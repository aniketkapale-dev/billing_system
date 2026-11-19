from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from apps.invoicing.models import (
    InventoryBatch,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    PurchaseReturn,
    PurchaseReturnItem,
)
from apps.inventory.models import MovementType, StockMovement
from apps.inventory.services import InventoryStockService
from core.exceptions import NotFoundException, ValidationException


class PurchaseReturnService:
    REFERENCE_TYPE = "purchase_return"

    def __init__(self):
        self.inventory_service = InventoryStockService()

    def list_returnable_purchases(self, business_id, invoice_ids=None):
        invoice_query = PurchaseInvoice.objects.filter(
            business_id=business_id,
            is_deleted=False,
            is_active=True,
        )
        if invoice_ids is not None:
            invoice_query = invoice_query.filter(pk__in=invoice_ids)
        invoices = list(invoice_query.order_by("-invoice_date", "-id"))
        if not invoices:
            return []

        invoice_ids = [invoice.id for invoice in invoices]
        items = list(
            PurchaseInvoiceItem.objects.filter(
                purchase_invoice_id__in=invoice_ids,
                is_deleted=False,
                is_active=True,
            )
            .select_related("product", "product__unit")
            .order_by("id")
        )
        item_ids = [item.id for item in items]
        available_by_item = dict(
            InventoryBatch.objects.filter(
                purchase_invoice_item_id__in=item_ids,
                is_deleted=False,
                is_active=True,
            )
            .values("purchase_invoice_item_id")
            .annotate(total=Sum("available_quantity"))
            .values_list("purchase_invoice_item_id", "total")
        )
        returned_by_item = dict(
            PurchaseReturnItem.objects.filter(
                purchase_invoice_item_id__in=item_ids,
                purchase_return__business_id=business_id,
                purchase_return__is_deleted=False,
                is_deleted=False,
            )
            .values("purchase_invoice_item_id")
            .annotate(total=Sum("quantity"))
            .values_list("purchase_invoice_item_id", "total")
        )

        items_by_invoice = {invoice_id: [] for invoice_id in invoice_ids}
        for item in items:
            returned = Decimal(returned_by_item.get(item.id) or 0)
            available = Decimal(available_by_item.get(item.id) or 0)
            remaining_from_purchase = max(Decimal(item.quantity) - returned, Decimal("0"))
            returnable = min(available, remaining_from_purchase)
            items_by_invoice[item.purchase_invoice_id].append({
                "id": item.id,
                "product_id": item.product_id,
                "product_name": item.product.name,
                "product_sku": item.product.sku,
                "product_unit": item.product.unit.short_name if item.product.unit_id else "",
                "quantity": f"{Decimal(item.quantity):.2f}",
                "returned_quantity": f"{returned:.2f}",
                "available_quantity": f"{available:.2f}",
                "returnable_quantity": f"{returnable:.2f}",
                "purchase_price": f"{Decimal(item.purchase_price):.2f}",
                "batch_number": item.batch_number,
            })

        return [
            {
                "id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "invoice_date": invoice.invoice_date.isoformat(),
                "remarks": invoice.remarks,
                "items": items_by_invoice[invoice.id],
            }
            for invoice in invoices
        ]

    @transaction.atomic
    def return_items(self, business_id, purchase_invoice_id, items, reason=""):
        invoice = (
            PurchaseInvoice.objects.select_for_update()
            .filter(
                pk=purchase_invoice_id,
                business_id=business_id,
                is_deleted=False,
                is_active=True,
            )
            .first()
        )
        if invoice is None:
            raise NotFoundException("Purchase invoice not found.")
        if not items:
            raise ValidationException("Select at least one product to return.")

        item_ids = [entry["purchase_invoice_item_id"] for entry in items]
        if len(item_ids) != len(set(item_ids)):
            raise ValidationException("A product can only be listed once per return.")

        invoice_items = {
            item.id: item
            for item in PurchaseInvoiceItem.objects.select_for_update()
            .filter(
                pk__in=item_ids,
                purchase_invoice=invoice,
                is_deleted=False,
                is_active=True,
            )
            .select_related("product")
        }
        if len(invoice_items) != len(item_ids):
            raise ValidationException("A selected product does not belong to this purchase.")

        prepared = []
        for entry in items:
            item = invoice_items[entry["purchase_invoice_item_id"]]
            quantity = Decimal(entry["quantity"])
            if quantity <= 0:
                raise ValidationException("Return quantity must be greater than zero.")

            batches = list(
                InventoryBatch.objects.select_for_update()
                .filter(
                    purchase_invoice_item=item,
                    business_id=business_id,
                    is_deleted=False,
                    is_active=True,
                    available_quantity__gt=0,
                )
                .order_by("id")
            )
            available = sum(
                (Decimal(batch.available_quantity) for batch in batches),
                Decimal("0"),
            )
            returned = PurchaseReturnItem.objects.filter(
                purchase_invoice_item=item,
                purchase_return__business_id=business_id,
                purchase_return__is_deleted=False,
                is_deleted=False,
            ).aggregate(total=Sum("quantity"))["total"] or Decimal("0")
            from_purchase = max(Decimal(item.quantity) - Decimal(returned), Decimal("0"))
            returnable = min(available, from_purchase)
            if quantity > returnable:
                raise ValidationException(
                    f"Only {returnable} of {item.product.name} can be returned from this purchase."
                )
            prepared.append((item, quantity, batches))

        purchase_return = PurchaseReturn.objects.create(
            business_id=business_id,
            purchase_invoice=invoice,
            reason=reason,
        )
        for item, quantity, batches in prepared:
            PurchaseReturnItem.objects.create(
                purchase_return=purchase_return,
                purchase_invoice_item=item,
                quantity=quantity,
            )
            remaining = quantity
            for batch in batches:
                if remaining <= 0:
                    break
                returned_from_batch = min(Decimal(batch.available_quantity), remaining)
                batch.available_quantity = Decimal(batch.available_quantity) - returned_from_batch
                batch.save(update_fields=["available_quantity", "updated_at"])
                self.inventory_service.deduct_stock(
                    business_id,
                    item.product_id,
                    returned_from_batch,
                )
                StockMovement.objects.create(
                    business_id=business_id,
                    product_id=item.product_id,
                    inventory_batch=batch,
                    reference_type=self.REFERENCE_TYPE,
                    reference_id=purchase_return.id,
                    movement_type=MovementType.OUT,
                    quantity=returned_from_batch,
                    balance_quantity=batch.available_quantity,
                )
                remaining -= returned_from_batch

            if remaining > 0:
                raise ValidationException(
                    f"Available stock changed while returning {item.product.name}. Try again."
                )

        return purchase_return
