from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Sum

from apps.invoicing.models import BatchConsumption, InventoryBatch, PurchaseInvoiceItem
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

    @staticmethod
    def _gst_rate_for_product(product):
        from apps.settings.tax_snapshot import gst_rate_for_tax_ids

        category = getattr(product, "category", None)
        tax_ids = list(getattr(category, "sale_tax_ids", None) or [])
        return gst_rate_for_tax_ids(tax_ids)

    def _resolve_vendor(self, business_id, vendor_id):
        if not vendor_id:
            return None

        from apps.catalog.models import Vendor

        try:
            return Vendor.objects.get(
                pk=vendor_id,
                business_id=business_id,
                is_deleted=False,
            )
        except Vendor.DoesNotExist:
            raise NotFoundException("Vendor not found.")

    def _prepare_purchase_item(self, business_id, item):
        product_id = item.get("product_id")
        quantity = Decimal(str(item.get("quantity", 0)))
        purchase_price = Decimal(str(item.get("purchase_price", 0)))
        discount = Decimal(str(item.get("discount", 0)))

        if quantity <= 0:
            raise ValidationException("Item quantity must be greater than zero.")
        if purchase_price < 0:
            raise ValidationException("Purchase price cannot be negative.")

        try:
            product = Product.objects.select_related("category").get(
                pk=product_id,
                business_id=business_id,
                is_deleted=False,
            )
        except Product.DoesNotExist:
            raise NotFoundException(f"Product with id {product_id} not found.")

        selling_price = Decimal(str(product.sale_price or 0))
        batch_mrp = Decimal(str(item.get("mrp") or 0))
        if batch_mrp <= 0:
            batch_mrp = Decimal(str(product.mrp or 0))
        current_max_mrp = self.batch_service.get_max_batch_mrp(business_id, product.id)
        if purchase_price > current_max_mrp and batch_mrp < purchase_price:
            batch_mrp = purchase_price
        if batch_mrp <= 0 and purchase_price > 0:
            batch_mrp = purchase_price
        vendor = self._resolve_vendor(business_id, item.get("vendor_id"))

        line_total = (quantity * purchase_price) - discount
        gst_rate = self._gst_rate_for_product(product)
        tax = (line_total - line_total / (1 + gst_rate / 100)).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP,
        )
        return {
            "product": product,
            "quantity": quantity,
            "purchase_price": purchase_price,
            "selling_price": selling_price,
            "mrp": batch_mrp,
            "discount": discount,
            "tax": tax,
            "gst_rate": gst_rate,
            "batch_number": item.get("batch_number", "") or "",
            "vendor": vendor,
            "expiry_date": item.get("expiry_date"),
            "line_total": line_total,
        }

    def _create_invoice_items(self, invoice, business_id, prepared_items):
        for item in prepared_items:
            invoice_item = PurchaseInvoiceItem.objects.create(
                purchase_invoice=invoice,
                product=item["product"],
                quantity=item["quantity"],
                purchase_price=item["purchase_price"],
                selling_price=item["selling_price"],
                discount=item["discount"],
                tax=item["tax"],
                gst_rate=item["gst_rate"],
                batch_number=item["batch_number"],
                vendor=item["vendor"],
                expiry_date=item["expiry_date"],
                line_total=item["line_total"],
            )
            self.batch_service.create_batch_from_purchase(
                business_id=business_id,
                product_id=item["product"].id,
                quantity=item["quantity"],
                purchase_price=item["purchase_price"],
                selling_price=item["selling_price"],
                mrp=item["mrp"],
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

    def _recalculate_invoice_totals(self, invoice):
        subtotal = Decimal("0")
        invoice_tax = Decimal("0")
        for item in invoice.items.filter(is_deleted=False):
            line_total = Decimal(str(item.line_total or 0))
            tax = Decimal(str(item.tax or 0))
            line_subtotal = line_total - tax
            if line_subtotal < 0:
                line_subtotal = Decimal("0")
            subtotal += line_subtotal
            invoice_tax += tax

        invoice_discount = Decimal(str(invoice.discount or 0))
        invoice.subtotal = subtotal
        invoice.tax = invoice_tax
        invoice.grand_total = subtotal - invoice_discount + invoice_tax
        invoice.save(update_fields=["subtotal", "tax", "grand_total", "updated_at"])
        return invoice

    @transaction.atomic
    def create_with_items(self, data):
        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")

        items_data = data.pop("items", [])
        if not items_data:
            raise ValidationException("At least one invoice item is required.")

        validate_required(data.get("invoice_number"), "Invoice number")

        subtotal = Decimal("0")
        invoice_tax = Decimal("0")
        prepared_items = []

        for item in items_data:
            prepared = self._prepare_purchase_item(business_id, item)
            line_subtotal = prepared["line_total"] - prepared["tax"]
            if line_subtotal < 0:
                line_subtotal = Decimal("0")
            subtotal += line_subtotal
            invoice_tax += prepared["tax"]
            prepared_items.append(prepared)

        invoice_discount = Decimal(str(data.pop("discount", 0) or 0))
        data["subtotal"] = subtotal
        data["discount"] = invoice_discount
        data["tax"] = invoice_tax
        data["grand_total"] = subtotal - invoice_discount + invoice_tax

        data.pop("owner_id", None)
        invoice = self.repository.create(**data)
        self._create_invoice_items(invoice, business_id, prepared_items)
        return invoice

    def update_header(self, pk, data):
        invoice = self.repository.get_by_id(pk)
        business_id = invoice.business_id
        updates = {}

        if "invoice_number" in data:
            invoice_number = (data.get("invoice_number") or "").strip()
            validate_required(invoice_number, "Invoice number")
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
    def add_items_to_invoice(self, pk, items_data):
        if not items_data:
            raise ValidationException("At least one new item is required.")

        invoice = self.repository.get_by_id(pk)
        if invoice.is_deleted:
            raise NotFoundException("Purchase invoice not found.")

        business_id = invoice.business_id
        prepared_items = [
            self._prepare_purchase_item(business_id, item)
            for item in items_data
        ]
        self._create_invoice_items(invoice, business_id, prepared_items)
        return self._recalculate_invoice_totals(invoice)

    @transaction.atomic
    def update_invoice(self, pk, header_data=None, new_items=None):
        invoice = self.repository.get_by_id(pk)
        header_data = dict(header_data or {})
        new_items = list(new_items or [])

        if header_data:
            invoice = self.update_header(pk, header_data)
        if new_items:
            invoice = self.add_items_to_invoice(pk, new_items)
        return invoice

    def _append_blocker(self, blockers, seen_products, product_id, product_name, sold_quantity=None):
        if not product_id or product_id in seen_products:
            return
        seen_products.add(product_id)
        blockers.append({
            "product_id": product_id,
            "product_name": product_name or "Product",
            "sold_quantity": sold_quantity,
        })

    def get_delete_blockers(self, invoice):
        from apps.purchases.models import PurchaseItem

        blockers = []
        seen_products = set()
        items = list(invoice.items.filter(is_deleted=False).select_related("product"))
        product_ids = [item.product_id for item in items if item.product_id]

        if not product_ids:
            return blockers

        consumption_rows = (
            BatchConsumption.objects.filter(
                inventory_batch__purchase_invoice_item__purchase_invoice=invoice,
                is_deleted=False,
            )
            .values("inventory_batch__product_id", "inventory_batch__product__name")
            .annotate(sold_quantity=Sum("quantity_sold"))
        )
        for row in consumption_rows:
            self._append_blocker(
                blockers,
                seen_products,
                row["inventory_batch__product_id"],
                row["inventory_batch__product__name"],
                row["sold_quantity"],
            )

        for item in items:
            if item.product_id in seen_products:
                continue
            batch_totals = InventoryBatch.objects.filter(
                purchase_invoice_item=item,
                is_deleted=False,
            ).aggregate(
                purchased=Sum("purchased_quantity"),
                available=Sum("available_quantity"),
            )
            purchased = Decimal(batch_totals["purchased"] or 0)
            available = Decimal(batch_totals["available"] or 0)
            if purchased > 0 and available < purchased:
                self._append_blocker(
                    blockers,
                    seen_products,
                    item.product_id,
                    item.product.name if item.product else "Product",
                    purchased - available,
                )

        sale_rows = (
            PurchaseItem.objects.filter(
                purchase__business_id=invoice.business_id,
                purchase__is_deleted=False,
                purchase__is_draft=False,
                purchase__is_cancelled=False,
                is_deleted=False,
                product_id__in=product_ids,
            )
            .exclude(product_id__in=seen_products)
            .values("product_id", "product__name")
            .distinct()
        )
        for row in sale_rows:
            self._append_blocker(
                blockers,
                seen_products,
                row["product_id"],
                row["product__name"],
            )

        return blockers

    def _format_delete_blocker_message(self, blockers):
        if not blockers:
            return (
                "Cannot delete this purchase because a sale has already been created "
                "for one or more products on this purchase."
            )
        label = ", ".join(blocker["product_name"] for blocker in blockers)
        return (
            "Cannot delete or re-create this purchase because a sale has already been created for: "
            + label
            + "."
        )

    def _format_recreate_all_sold_message(self, blockers):
        if not blockers:
            return (
                "Cannot re-create this purchase because all products have already been sold."
            )
        label = ", ".join(blocker["product_name"] for blocker in blockers)
        return (
            "Cannot re-create this purchase because all products have already been sold: "
            + label
            + "."
        )

    def can_recreate(self, invoice):
        blockers = self.get_delete_blockers(invoice)
        blocked_ids = {blocker["product_id"] for blocker in blockers}
        items = invoice.items.filter(is_deleted=False)
        if not items.exists():
            return False
        return items.exclude(product_id__in=blocked_ids).exists()

    def _delete_item_and_batches(self, business_id, item):
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

    @transaction.atomic
    def soft_delete(self, pk):
        invoice = self.repository.get_by_id(pk)
        business_id = invoice.business_id
        blockers = self.get_delete_blockers(invoice)
        if blockers:
            raise ValidationException(self._format_delete_blocker_message(blockers))

        items = invoice.items.filter(is_deleted=False)
        for item in items:
            self._delete_item_and_batches(business_id, item)

        return self.repository.soft_delete(invoice)

    @transaction.atomic
    def soft_delete_for_recreate(self, pk):
        invoice = self.repository.get_by_id(pk)
        business_id = invoice.business_id
        blockers = self.get_delete_blockers(invoice)
        blocked_ids = {blocker["product_id"] for blocker in blockers}

        items = list(invoice.items.filter(is_deleted=False))
        if not items:
            return self.repository.soft_delete(invoice)

        deletable_items = [item for item in items if item.product_id not in blocked_ids]
        if not deletable_items:
            raise ValidationException(self._format_recreate_all_sold_message(blockers))

        for item in deletable_items:
            self._delete_item_and_batches(business_id, item)

        if not invoice.items.filter(is_deleted=False).exists():
            return self.repository.soft_delete(invoice)

        return self._recalculate_invoice_totals(invoice)
