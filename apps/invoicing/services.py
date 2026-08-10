from decimal import Decimal

from django.db import transaction

from apps.invoicing.models import InventoryBatch, PurchaseInvoiceItem
from apps.invoicing.repositories import PurchaseInvoiceRepository
from apps.inventory.batch_service import BatchInventoryService
from apps.inventory.services import InventoryStockService
from apps.products.models import Product
from core.base_service import BaseService
from core.exceptions import NotFoundException, ValidationException
from core.validators import validate_required


class PurchaseInvoiceService(BaseService):
    def __init__(self):
        super().__init__(repository=PurchaseInvoiceRepository())
        self.batch_service = BatchInventoryService()
        self.inventory_service = InventoryStockService()

    @transaction.atomic
    def create_with_items(self, data):
        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")

        items_data = data.pop("items", [])
        if not items_data:
            raise ValidationException("At least one invoice item is required.")

        validate_required(data.get("invoice_number"), "Invoice number")

        if self.repository.exists(
            business_id=business_id,
            invoice_number=data["invoice_number"],
            is_deleted=False,
        ):
            raise ValidationException("Invoice number already exists for this business.")

        subtotal = Decimal("0")
        prepared_items = []

        for item in items_data:
            product_id = item.get("product_id")
            quantity = Decimal(str(item.get("quantity", 0)))
            purchase_price = Decimal(str(item.get("purchase_price", 0)))
            discount = Decimal(str(item.get("discount", 0)))
            tax = Decimal(str(item.get("tax", 0)))

            if quantity <= 0:
                raise ValidationException("Item quantity must be greater than zero.")
            if purchase_price < 0:
                raise ValidationException("Purchase price cannot be negative.")

            try:
                product = Product.objects.get(
                    pk=product_id,
                    business_id=business_id,
                    is_deleted=False,
                )
            except Product.DoesNotExist:
                raise NotFoundException(f"Product with id {product_id} not found.")

            selling_price = Decimal(str(product.sale_price or 0))

            line_total = (quantity * purchase_price) - discount + tax
            subtotal += line_total
            prepared_items.append({
                "product": product,
                "quantity": quantity,
                "purchase_price": purchase_price,
                "selling_price": selling_price,
                "discount": discount,
                "tax": tax,
                "batch_number": item.get("batch_number", "") or "",
                "expiry_date": item.get("expiry_date"),
                "line_total": line_total,
            })

        invoice_discount = Decimal(str(data.pop("discount", 0) or 0))
        invoice_tax = Decimal(str(data.pop("tax", 0) or 0))
        data["subtotal"] = subtotal
        data["discount"] = invoice_discount
        data["tax"] = invoice_tax
        data["grand_total"] = subtotal - invoice_discount + invoice_tax

        data.pop("owner_id", None)
        invoice = self.repository.create(**data)

        for item in prepared_items:
            invoice_item = PurchaseInvoiceItem.objects.create(
                purchase_invoice=invoice,
                product=item["product"],
                quantity=item["quantity"],
                purchase_price=item["purchase_price"],
                selling_price=item["selling_price"],
                discount=item["discount"],
                tax=item["tax"],
                batch_number=item["batch_number"],
                expiry_date=item["expiry_date"],
                line_total=item["line_total"],
            )
            self.batch_service.create_batch_from_purchase(
                business_id=business_id,
                product_id=item["product"].id,
                quantity=item["quantity"],
                purchase_price=item["purchase_price"],
                selling_price=item["selling_price"],
                batch_number=item["batch_number"],
                expiry_date=item["expiry_date"],
                purchase_invoice_item=invoice_item,
                reference_id=invoice.id,
            )
            self.inventory_service.add_stock(
                business_id,
                item["product"].id,
                item["quantity"],
            )

        return invoice

    def update_header(self, pk, data):
        invoice = self.repository.get_by_id(pk)
        business_id = invoice.business_id
        updates = {}

        if "invoice_number" in data:
            invoice_number = (data.get("invoice_number") or "").strip()
            validate_required(invoice_number, "Invoice number")
            if (
                invoice_number != invoice.invoice_number
                and self.repository.exists(
                    business_id=business_id,
                    invoice_number=invoice_number,
                    is_deleted=False,
                )
            ):
                raise ValidationException("Invoice number already exists for this business.")
            updates["invoice_number"] = invoice_number

        if "invoice_date" in data and data.get("invoice_date") is not None:
            updates["invoice_date"] = data["invoice_date"]

        if "remarks" in data:
            updates["remarks"] = data.get("remarks") or ""

        if "attachment" in data:
            updates["attachment"] = data["attachment"]

        if not updates:
            return invoice

        return self.repository.update(invoice, **updates)

    @transaction.atomic
    def soft_delete(self, pk):
        invoice = self.repository.get_by_id(pk)
        business_id = invoice.business_id
        items = invoice.items.filter(is_deleted=False)

        for item in items:
            batches = InventoryBatch.objects.filter(
                purchase_invoice_item=item,
                is_deleted=False,
            )
            for batch in batches:
                purchased = Decimal(batch.purchased_quantity or 0)
                available = Decimal(batch.available_quantity or 0)
                if available < purchased:
                    raise ValidationException(
                        "Cannot delete this purchase because some stock has already been sold or used."
                    )

        for item in items:
            batches = InventoryBatch.objects.filter(
                purchase_invoice_item=item,
                is_deleted=False,
            )
            for batch in batches:
                qty = Decimal(batch.available_quantity or 0)
                if qty > 0:
                    self.inventory_service.deduct_stock(
                        business_id,
                        batch.product_id,
                        qty,
                    )
                batch.soft_delete()
            item.soft_delete()

        return self.repository.soft_delete(invoice)
