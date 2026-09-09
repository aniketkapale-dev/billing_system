from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from apps.inventory.batch_service import BatchInventoryService
from apps.inventory.services import InventoryStockService
from apps.products.models import Product
from apps.purchases.models import Purchase, PurchaseItem, PurchasePayment
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

    def _apply_invoice_setting(self, data, business_id, *, allocate_number=True):
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
        data["invoice_setting_id"] = setting.id
        if allocate_number:
            data["reference_no"] = setting.format_invoice_number()
            setting.current_counter += 1
            setting.save(update_fields=["current_counter", "updated_at"])
        else:
            data["reference_no"] = ""
        return data

    def _assign_invoice_on_finalize(self, purchase, invoice_setting_id):
        reference_no = (purchase.reference_no or "").strip()
        if reference_no:
            return purchase

        if not invoice_setting_id:
            raise ValidationException("Please select an invoice before finalizing the sale.")

        invoice_data = {"invoice_setting_id": invoice_setting_id}
        self._apply_invoice_setting(invoice_data, purchase.business_id, allocate_number=True)
        purchase.invoice_setting_id = invoice_data["invoice_setting_id"]
        purchase.reference_no = invoice_data["reference_no"]
        purchase.save(update_fields=["reference_no", "invoice_setting_id", "updated_at"])
        return purchase

    def _strip_draft_invoice_number(self, purchase):
        if not purchase.is_draft:
            return purchase
        if not (purchase.reference_no or "").strip():
            return purchase

        self._release_draft_invoice_number(purchase)
        purchase.reference_no = ""
        purchase.save(update_fields=["reference_no", "updated_at"])
        return purchase

    @staticmethod
    def _normalize_sale_tax_ids(raw):
        ids = []
        for tax_id in raw or []:
            try:
                ids.append(int(tax_id))
            except (TypeError, ValueError):
                continue
        return ids

    def _prepare_sale_items(self, items_data, business_id, *, skip_stock_check=False):
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
                "discount_type": str(item.get("discount_type") or "percent"),
                "discount_value": Decimal(str(item.get("discount_value") or 0)),
                "distributor_discount_type": str(item.get("distributor_discount_type") or "percent"),
                "distributor_discount_value": Decimal(str(item.get("distributor_discount_value") or 0)),
                "sale_tax_ids": self._normalize_sale_tax_ids(item.get("sale_tax_ids")),
                "tax_amount": Decimal(str(item.get("tax_amount") or 0)),
            })

        if not skip_stock_check:
            for product_id, requested_qty in requested_by_product.items():
                available = self.batch_service.get_available_for_sale(business_id, product_id)
                if requested_qty > available:
                    product = Product.objects.get(pk=product_id)
                    raise ValidationException(
                        f"Insufficient stock for {product.name}. "
                        f"Available: {available}, requested: {requested_qty}."
                    )

        return prepared_items, total_amount

    def _attach_draft_items(self, purchase, prepared_items):
        for item in prepared_items:
            PurchaseItem.objects.create(
                purchase=purchase,
                product=item["product"],
                quantity=item["quantity"],
                list_price=item["list_price"],
                unit_price=item["unit_price"],
                line_total=item["line_total"],
                discount_amount=item["discount_amount"],
                discount_type=item["discount_type"],
                discount_value=item["discount_value"],
                distributor_discount_type=item["distributor_discount_type"],
                distributor_discount_value=item["distributor_discount_value"],
                sale_tax_ids=item["sale_tax_ids"],
                tax_amount=item["tax_amount"],
                cost_amount=Decimal("0"),
                profit_amount=Decimal("0"),
            )

        purchase.total_cost = Decimal("0")
        purchase.total_profit = Decimal("0")
        purchase.save(update_fields=["total_cost", "total_profit", "updated_at"])

    def _clear_draft_items(self, purchase):
        existing_items = PurchaseItem.objects.filter(
            purchase=purchase,
            is_deleted=False,
        )
        for item in existing_items:
            item.soft_delete()

    def _release_draft_invoice_number(self, purchase):
        from apps.settings.models import InvoiceSetting

        setting_id = purchase.invoice_setting_id
        reference_no = (purchase.reference_no or "").strip()
        if not setting_id or not reference_no:
            return

        setting = (
            InvoiceSetting.objects.select_for_update()
            .filter(
                pk=setting_id,
                business_id=purchase.business_id,
                is_deleted=False,
            )
            .first()
        )
        if not setting or setting.current_counter <= setting.counter:
            return

        expected_last = setting.format_invoice_number(setting.current_counter - 1)
        if reference_no != expected_last:
            return

        in_use = (
            Purchase.objects.filter(
                business_id=purchase.business_id,
                invoice_setting_id=setting.id,
                reference_no=reference_no,
                is_deleted=False,
            )
            .exclude(pk=purchase.pk)
            .exists()
        )
        if in_use:
            return

        setting.current_counter -= 1
        setting.save(update_fields=["current_counter", "updated_at"])

    @transaction.atomic
    def _delete_draft_purchase(self, purchase):
        if not purchase.is_draft:
            raise ValidationException("Only draft sales can be deleted this way.")
        if purchase.is_cancelled:
            return purchase

        self._clear_draft_items(purchase)
        self._release_draft_invoice_number(purchase)
        purchase.soft_delete()
        return purchase

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
                discount_type=item["discount_type"],
                discount_value=item["discount_value"],
                distributor_discount_type=item["distributor_discount_type"],
                distributor_discount_value=item["distributor_discount_value"],
                sale_tax_ids=item["sale_tax_ids"],
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
        if purchase.is_draft:
            self._clear_draft_items(purchase)
            return

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

        if "due_date" in data:
            updates["due_date"] = self._parse_optional_date(data.get("due_date"))

        return updates

    def _get_last_payment_date(self, purchase):
        return (
            PurchasePayment.objects.filter(purchase=purchase, is_deleted=False)
            .order_by("-payment_date", "-created_at")
            .values_list("payment_date", flat=True)
            .first()
        )

    def _sum_payments(self, purchase):
        total = (
            PurchasePayment.objects.filter(purchase=purchase, is_deleted=False)
            .aggregate(total=Sum("amount"))
            .get("total")
        )
        return total or Decimal("0")

    def _pending_bill(self, purchase):
        total_amount = purchase.total_amount or Decimal("0")
        pending = total_amount - self._sum_payments(purchase)
        if pending < 0:
            return Decimal("0")
        return pending

    def _sync_purchase_payment_state(self, purchase, *, next_due_date=None):
        from django.utils import timezone

        total_paid = self._sum_payments(purchase)
        total_amount = purchase.total_amount or Decimal("0")
        pending = total_amount - total_paid

        if pending <= Decimal("0"):
            purchase.is_paid = True
            purchase.paid_at = timezone.now()
            purchase.due_date = None
            purchase.save(update_fields=["is_paid", "paid_at", "due_date", "updated_at"])
            return purchase

        parsed_due_date = self._parse_optional_date(next_due_date)
        if not parsed_due_date:
            parsed_due_date = purchase.due_date
        if not parsed_due_date:
            raise ValidationException("Next due date is required when the bill is not fully paid.")

        purchase.is_paid = False
        purchase.paid_at = None
        purchase.due_date = parsed_due_date
        purchase.save(update_fields=["is_paid", "paid_at", "due_date", "updated_at"])
        return purchase

    @transaction.atomic
    def _create_payment(
        self,
        purchase,
        *,
        amount,
        payment_date=None,
        payment_type_id=None,
        next_due_date=None,
        notes="",
    ):
        if purchase.is_draft:
            raise ValidationException("Draft sales must be finalized before recording payments.")
        if purchase.is_cancelled:
            raise ValidationException("Cancelled invoices cannot receive payments.")

        amount = Decimal(str(amount))
        if amount <= 0:
            raise ValidationException("Payment amount must be greater than zero.")

        pending = self._pending_bill(purchase)
        if amount > pending + Decimal("0.0001"):
            raise ValidationException("Payment amount cannot exceed the pending bill.")

        from django.utils import timezone

        payment_date = self._parse_optional_date(payment_date) or timezone.localdate()
        last_payment_date = self._get_last_payment_date(purchase)
        if last_payment_date and payment_date < last_payment_date:
            raise ValidationException(
                "Payment date cannot be before the last recorded payment date."
            )

        resolved_payment_type_id = None
        if payment_type_id:
            resolved_payment_type_id = self._resolve_payment_type_id(
                purchase.business_id,
                payment_type_id,
            )

        will_clear = amount + Decimal("0.0001") >= pending
        parsed_next_due = self._parse_optional_date(next_due_date)
        if not will_clear and not parsed_next_due:
            raise ValidationException("Next due date is required when payment does not clear the full bill.")
        if not will_clear and parsed_next_due and parsed_next_due < payment_date:
            raise ValidationException("Next due date cannot be before the payment date.")

        payment = PurchasePayment.objects.create(
            purchase=purchase,
            amount=amount,
            payment_date=payment_date,
            next_due_date=None if will_clear else parsed_next_due,
            payment_type_id=resolved_payment_type_id,
            notes=(notes or "").strip(),
        )
        self._sync_purchase_payment_state(
            purchase,
            next_due_date=None if will_clear else parsed_next_due,
        )
        return payment

    def _apply_sale_payment_on_finalize(self, purchase, data):
        is_paid = bool(data.get("is_paid", False))
        due_date = data.get("due_date")
        payment_amount = data.get("payment_amount")
        payment_type_id = purchase.payment_type_id

        if is_paid:
            self._create_payment(
                purchase,
                amount=purchase.total_amount or Decimal("0"),
                payment_date=purchase.purchase_date,
                payment_type_id=payment_type_id,
            )
            return purchase

        if payment_amount is not None and Decimal(str(payment_amount)) > 0:
            self._create_payment(
                purchase,
                amount=payment_amount,
                payment_date=purchase.purchase_date,
                payment_type_id=payment_type_id,
                next_due_date=due_date,
            )
            return purchase

        parsed_due_date = self._parse_optional_date(due_date)
        if not parsed_due_date:
            raise ValidationException("Due date is required for unpaid sales.")
        purchase.is_paid = False
        purchase.paid_at = None
        purchase.due_date = parsed_due_date
        purchase.save(update_fields=["is_paid", "paid_at", "due_date", "updated_at"])
        return purchase

    @staticmethod
    def _parse_optional_date(value):
        if value in (None, ""):
            return None

        if hasattr(value, "year"):
            return value

        from datetime import datetime

        try:
            return datetime.strptime(str(value), "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValidationException("Invalid due date.") from exc

    @transaction.atomic
    def create_with_items(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")

        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")

        items_data = data.pop("items", [])
        is_draft = bool(data.pop("is_draft", False))
        self._apply_customer(data, business_id)
        if is_draft:
            data.pop("invoice_setting_id", None)
            data["reference_no"] = ""
        else:
            self._apply_invoice_setting(data, business_id, allocate_number=True)

        if "payment_type_id" in data:
            data["payment_type_id"] = self._resolve_payment_type_id(
                business_id,
                data.get("payment_type_id"),
            )

        is_paid = bool(data.pop("is_paid", False))
        due_date = data.pop("due_date", None)
        payment_amount = data.pop("payment_amount", None)
        if is_draft:
            is_paid = False
            payment_amount = None
            data["is_paid"] = False
            data["paid_at"] = None
            data["due_date"] = self._parse_optional_date(due_date)
        elif is_paid or (payment_amount and Decimal(str(payment_amount)) > 0):
            data["is_paid"] = False
            data["paid_at"] = None
            data["due_date"] = None
        else:
            data["is_paid"] = False
            parsed_due_date = self._parse_optional_date(due_date)
            if not is_draft and not parsed_due_date:
                raise ValidationException("Due date is required for unpaid sales.")
            data["due_date"] = parsed_due_date

        data["is_draft"] = is_draft
        payment_payload = {
            "is_paid": is_paid,
            "due_date": due_date,
            "payment_amount": payment_amount,
        }

        prepared_items, total_amount = self._prepare_sale_items(
            items_data,
            business_id,
            skip_stock_check=is_draft,
        )

        data["owner_id"] = user.id
        data["total_amount"] = total_amount
        purchase = self.repository.create(**data)

        if is_draft:
            self._attach_draft_items(purchase, prepared_items)
        else:
            self._attach_sale_items(purchase, prepared_items, business_id)
            self._apply_sale_payment_on_finalize(purchase, payment_payload)

        return purchase

    @transaction.atomic
    def update_draft_with_items(self, pk, data):
        purchase = self.repository.get_by_id(pk)
        if not purchase.is_draft:
            raise ValidationException("Only draft sales can be updated with line items.")
        if purchase.is_cancelled:
            raise ValidationException("Cancelled invoices cannot be edited.")

        self._strip_draft_invoice_number(purchase)

        business_id = purchase.business_id
        items_data = data.pop("items", None)

        if items_data is None:
            updates = self._build_header_updates(purchase, data)
            if not updates:
                return purchase
            return self.repository.update(purchase, **updates)

        self._clear_draft_items(purchase)

        prepared_items, total_amount = self._prepare_sale_items(
            items_data,
            business_id,
            skip_stock_check=True,
        )

        updates = self._build_header_updates(purchase, data)
        updates["total_amount"] = total_amount
        if updates:
            purchase = self.repository.update(purchase, **updates)

        self._attach_draft_items(purchase, prepared_items)
        return purchase

    @transaction.atomic
    def finalize_draft(self, pk, data=None):
        data = data or {}
        purchase = self.repository.get_by_id(pk)
        if not purchase.is_draft:
            raise ValidationException("This sale is already finalized.")
        if purchase.is_cancelled:
            raise ValidationException("Cancelled drafts cannot be finalized.")

        business_id = purchase.business_id
        items = list(
            PurchaseItem.objects.filter(
                purchase=purchase,
                is_deleted=False,
            ).select_related("product")
        )
        if not items:
            raise ValidationException("Add at least one product before finalizing the sale.")

        invoice_setting_id = data.pop("invoice_setting_id", None)
        self._assign_invoice_on_finalize(purchase, invoice_setting_id)

        requested_by_product = {}
        for item in items:
            requested_by_product[item.product_id] = (
                requested_by_product.get(item.product_id, Decimal("0")) + item.quantity
            )

        for product_id, requested_qty in requested_by_product.items():
            available = self.batch_service.get_available_for_sale(business_id, product_id)
            if requested_qty > available:
                product = Product.objects.get(pk=product_id)
                raise ValidationException(
                    f"Insufficient stock for {product.name}. "
                    f"Available: {available}, requested: {requested_qty}."
                )

        total_cost = Decimal("0")
        total_profit = Decimal("0")

        for item in items:
            slices = self.batch_service.consume_fifo(
                business_id,
                item.product_id,
                item.quantity,
                reference_type=BatchInventoryService.REF_CUSTOMER_SALE,
                reference_id=item.id,
                selling_price=item.unit_price,
                purchase_item=item,
            )
            line_cost = sum(
                (s["purchase_price"] * s["quantity"] for s in slices),
                Decimal("0"),
            )
            line_profit = sum(
                (s["profit"] for s in slices),
                Decimal("0"),
            )
            item.cost_amount = line_cost
            item.profit_amount = line_profit
            item.save(update_fields=["cost_amount", "profit_amount", "updated_at"])

            total_cost += line_cost
            total_profit += line_profit

            self.inventory_service.deduct_stock(
                business_id,
                item.product_id,
                item.quantity,
            )

        purchase.is_draft = False
        purchase.total_cost = total_cost
        purchase.total_profit = total_profit
        purchase.save(update_fields=["is_draft", "total_cost", "total_profit", "updated_at"])
        self._apply_sale_payment_on_finalize(purchase, data)
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
        if purchase.is_cancelled:
            raise ValidationException("Cancelled invoices cannot be edited.")
        if purchase.is_draft:
            raise ValidationException("Use draft update to change draft sale details.")
        if purchase.is_paid and "due_date" in data:
            data = dict(data)
            data.pop("due_date", None)
        elif "due_date" in data and not purchase.is_paid:
            parsed_due_date = self._parse_optional_date(data.get("due_date"))
            if not parsed_due_date:
                raise ValidationException("Due date is required for unpaid sales.")
            data = dict(data)
            data["due_date"] = parsed_due_date
        updates = self._build_header_updates(purchase, data)

        if not updates:
            return purchase

        return self.repository.update(purchase, **updates)

    @transaction.atomic
    def mark_as_paid(self, pk):
        purchase = self.repository.get_by_id(pk)
        if purchase.is_paid:
            return purchase

        pending = self._pending_bill(purchase)
        if pending <= 0:
            return purchase

        from django.utils import timezone

        self._create_payment(
            purchase,
            amount=pending,
            payment_date=timezone.localdate(),
            payment_type_id=purchase.payment_type_id,
        )
        return self.repository.get_by_id(pk)

    @transaction.atomic
    def record_payment(self, pk, data):
        purchase = self.repository.get_by_id(pk)
        self._create_payment(
            purchase,
            amount=data.get("amount"),
            payment_date=data.get("payment_date"),
            payment_type_id=data.get("payment_type_id"),
            next_due_date=data.get("next_due_date"),
            notes=data.get("notes", ""),
        )
        return self.repository.get_by_id(pk)

    def list_payments(self, pk):
        purchase = self.repository.get_by_id(pk)
        return (
            PurchasePayment.objects.filter(purchase=purchase, is_deleted=False)
            .select_related("payment_type")
            .order_by("payment_date", "created_at")
        )

    @transaction.atomic
    def mark_as_cancelled(self, pk, reason="", cancellation_date=None):
        purchase = self.repository.get_by_id(pk)
        if purchase.is_cancelled:
            return purchase

        if purchase.is_draft:
            return self._delete_draft_purchase(purchase)

        reason = (reason or "").strip()
        if not reason:
            raise ValidationException("Cancellation reason is required.")

        from django.utils import timezone

        if cancellation_date is None:
            cancellation_date = timezone.localdate()
        elif isinstance(cancellation_date, str):
            from datetime import datetime

            try:
                cancellation_date = datetime.strptime(cancellation_date, "%Y-%m-%d").date()
            except ValueError as exc:
                raise ValidationException("Invalid cancellation date.") from exc

        invoice_date = purchase.purchase_date
        if not invoice_date and purchase.created_at:
            invoice_date = timezone.localtime(purchase.created_at).date()
        if invoice_date and cancellation_date < invoice_date:
            raise ValidationException(
                "Cancellation date cannot be before the invoice date."
            )

        business_id = purchase.business_id
        if not purchase.is_draft:
            items = PurchaseItem.objects.filter(purchase=purchase, is_deleted=False)
            for item in items:
                self.batch_service.restore_purchase_item_consumptions(item)
                self.inventory_service.add_stock(business_id, item.product_id, item.quantity)

        purchase.is_cancelled = True
        purchase.cancelled_at = timezone.now()
        purchase.cancellation_date = cancellation_date
        purchase.cancellation_reason = reason
        purchase.save(
            update_fields=[
                "is_cancelled",
                "cancelled_at",
                "cancellation_date",
                "cancellation_reason",
                "updated_at",
            ]
        )
        return purchase
