from decimal import Decimal

from django.db import transaction

from apps.inventory.batch_service import BatchInventoryService
from apps.inventory.services import InventoryStockService
from apps.products.models import Product
from apps.purchases.models import PurchaseItem
from apps.purchases.repositories import PurchaseRepository
from core.base_service import BaseService
from core.exceptions import NotFoundException, ValidationException
from core.middleware import get_current_user


class PurchaseService(BaseService):
    def __init__(self):
        super().__init__(repository=PurchaseRepository())
        self.inventory_service = InventoryStockService()
        self.batch_service = BatchInventoryService()

    def _resolve_payment_type_id(self, business_id, payment_type_id):
        if not payment_type_id:
            return None

        from apps.catalog.models import PaymentType

        try:
            PaymentType.objects.get(
                pk=payment_type_id,
                business_id=business_id,
                is_deleted=False,
            )
        except PaymentType.DoesNotExist:
            raise NotFoundException("Payment type not found.")
        return payment_type_id

    def _resolve_customer(self, business_id, customer_id):
        from apps.customers.models import Customer

        try:
            return Customer.objects.get(
                pk=customer_id,
                business_id=business_id,
                is_deleted=False,
            )
        except Customer.DoesNotExist:
            raise NotFoundException("Customer not found.")

    def _apply_customer(self, data, business_id):
        customer_id = data.pop("customer_id", None)
        if customer_id is None:
            raise ValidationException("Customer is required.")
        customer = self._resolve_customer(business_id, customer_id)
        data["customer_id"] = customer.id
        data["customer_name"] = customer.name
        return data

    def _apply_invoice_setting(self, data, business_id):
        from apps.settings.models import InvoiceSetting
        from apps.settings.services import InvoiceSettingService

        setting_id = data.pop("invoice_setting_id", None)
        if not setting_id:
            raise ValidationException("Invoice setting is required.")

        try:
            setting = InvoiceSetting.objects.select_for_update().get(
                pk=setting_id,
                business_id=business_id,
                is_deleted=False,
            )
        except InvoiceSetting.DoesNotExist:
            raise NotFoundException("Invoice setting not found.")

        setting = InvoiceSettingService().resolve_for_sale(setting)
        data["reference_no"] = setting.format_invoice_number()
        data["invoice_setting_id"] = setting.id
        setting.current_counter += 1
        setting.save(update_fields=["current_counter", "updated_at"])
        return data

    def _prepare_sale_items(self, items_data, business_id):
        if not items_data:
            raise ValidationException("At least one purchase item is required.")

        total_amount = Decimal("0")
        prepared_items = []
        requested_by_product = {}

        for item in items_data:
            product_id = item.get("product_id")
            quantity = Decimal(str(item.get("quantity", 0)))
            unit_price = Decimal(str(item.get("unit_price", 0)))

            if quantity <= 0:
                raise ValidationException("Item quantity must be greater than zero.")
            if unit_price < 0:
                raise ValidationException("Item unit price cannot be negative.")

            try:
                product = Product.objects.get(
                    pk=product_id,
                    business_id=business_id,
                    is_deleted=False,
                )
            except Product.DoesNotExist:
                raise NotFoundException(f"Product with id {product_id} not found.")

            requested_by_product[product_id] = (
                requested_by_product.get(product_id, Decimal("0")) + quantity
            )

            line_total = quantity * unit_price
            total_amount += line_total
            list_price = item.get("list_price")
            if list_price is None or list_price == "":
                list_price = unit_price
            prepared_items.append({
                "product": product,
                "quantity": quantity,
                "list_price": Decimal(str(list_price)),
                "unit_price": unit_price,
                "line_total": line_total,
                "discount_amount": Decimal(str(item.get("discount_amount") or 0)),
                "tax_amount": Decimal(str(item.get("tax_amount") or 0)),
            })

        for product_id, requested_qty in requested_by_product.items():
            available = self.batch_service.get_available_for_sale(business_id, product_id)
            if requested_qty > available:
                product = Product.objects.get(pk=product_id)
                raise ValidationException(
                    f"Insufficient stock for {product.name}. "
                    f"Available: {available}, requested: {requested_qty}."
                )

        return prepared_items, total_amount

    def _attach_sale_items(self, purchase, prepared_items, business_id):
        total_cost = Decimal("0")
        total_profit = Decimal("0")

        for item in prepared_items:
            purchase_item = PurchaseItem.objects.create(
                purchase=purchase,
                product=item["product"],
                quantity=item["quantity"],
                list_price=item["list_price"],
                unit_price=item["unit_price"],
                line_total=item["line_total"],
                discount_amount=item["discount_amount"],
                tax_amount=item["tax_amount"],
            )
            slices = self.batch_service.consume_fifo(
                business_id,
                item["product"].id,
                item["quantity"],
                reference_type=BatchInventoryService.REF_CUSTOMER_SALE,
                reference_id=purchase_item.id,
                selling_price=item["unit_price"],
                purchase_item=purchase_item,
            )
            line_cost = sum(
                (s["purchase_price"] * s["quantity"] for s in slices),
                Decimal("0"),
            )
            line_profit = sum(
                (s["profit"] for s in slices),
                Decimal("0"),
            )
            purchase_item.cost_amount = line_cost
            purchase_item.profit_amount = line_profit
            purchase_item.save(update_fields=["cost_amount", "profit_amount", "updated_at"])

            total_cost += line_cost
            total_profit += line_profit

            self.inventory_service.deduct_stock(
                business_id,
                item["product"].id,
                item["quantity"],
            )

        purchase.total_cost = total_cost
        purchase.total_profit = total_profit
        purchase.save(update_fields=["total_cost", "total_profit", "updated_at"])

    def _restore_existing_sale_items(self, purchase):
        business_id = purchase.business_id
        existing_items = PurchaseItem.objects.filter(
            purchase=purchase,
            is_deleted=False,
        )
        for item in existing_items:
            self.batch_service.restore_purchase_item_consumptions(item)
            self.inventory_service.add_stock(business_id, item.product_id, item.quantity)
            item.soft_delete()

    def _build_header_updates(self, purchase, data):
        updates = {}

        if "customer_id" in data and data.get("customer_id") is not None:
            customer = self._resolve_customer(purchase.business_id, data["customer_id"])
            updates["customer_id"] = customer.id
            updates["customer_name"] = customer.name

        if "purchase_date" in data and data.get("purchase_date") is not None:
            updates["purchase_date"] = data["purchase_date"]

        if "reference_no" in data:
            updates["reference_no"] = (data.get("reference_no") or "").strip()

        if "notes" in data:
            updates["notes"] = data.get("notes") or ""

        if "billing_address" in data:
            updates["billing_address"] = (data.get("billing_address") or "").strip()

        if "shipping_address" in data:
            updates["shipping_address"] = (data.get("shipping_address") or "").strip()

        if "payment_type_id" in data:
            updates["payment_type_id"] = self._resolve_payment_type_id(
                purchase.business_id,
                data.get("payment_type_id"),
            )

        return updates

    @transaction.atomic
    def create_with_items(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")

        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")

        items_data = data.pop("items", [])
        self._apply_customer(data, business_id)
        self._apply_invoice_setting(data, business_id)

        if "payment_type_id" in data:
            data["payment_type_id"] = self._resolve_payment_type_id(
                business_id,
                data.get("payment_type_id"),
            )

        prepared_items, total_amount = self._prepare_sale_items(items_data, business_id)

        data["owner_id"] = user.id
        data["total_amount"] = total_amount
        purchase = self.repository.create(**data)

        self._attach_sale_items(purchase, prepared_items, business_id)

        return purchase

    @transaction.atomic
    def update_with_items(self, pk, data):
        purchase = self.repository.get_by_id(pk)
        business_id = purchase.business_id
        items_data = data.pop("items", None)

        if items_data is None:
            return self.update_header(pk, data)

        self._restore_existing_sale_items(purchase)

        prepared_items, total_amount = self._prepare_sale_items(items_data, business_id)

        updates = self._build_header_updates(purchase, data)
        updates["total_amount"] = total_amount
        if updates:
            purchase = self.repository.update(purchase, **updates)

        self._attach_sale_items(purchase, prepared_items, business_id)
        return purchase

    def update_header(self, pk, data):
        purchase = self.repository.get_by_id(pk)
        updates = self._build_header_updates(purchase, data)

        if not updates:
            return purchase

        return self.repository.update(purchase, **updates)
