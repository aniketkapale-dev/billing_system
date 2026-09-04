from decimal import Decimal

from apps.invoicing.models import InventoryBatch
from apps.inventory.models import MovementType, StockMovement
from apps.inventory.repositories import InventoryStockRepository
from apps.invoicing.repositories import InventoryBatchRepository
from apps.products.models import Product
from core.exceptions import ValidationException


class BatchInventoryService:
    REF_OPENING = "opening_stock"
    REF_PURCHASE_INVOICE = "purchase_invoice"
    REF_CUSTOMER_SALE = "customer_sale"

    def __init__(self):
        self.batch_repository = InventoryBatchRepository()
        self.stock_repository = InventoryStockRepository()

    def get_total_available(self, business_id, product_id):
        return self.batch_repository.get_total_available(business_id, product_id)

    def get_available_for_sale(self, business_id, product_id):
        batch_total = self.get_total_available(business_id, product_id)
        if batch_total > 0:
            return batch_total

        aggregate = self.stock_repository.get_available_quantity(business_id, product_id)
        if aggregate > 0:
            self.sync_aggregate_to_opening_batch(business_id, product_id, aggregate)
            return aggregate
        return Decimal("0")

    def sync_aggregate_to_opening_batch(self, business_id, product_id, quantity):
        if self.get_total_available(business_id, product_id) > 0:
            return None

        product = Product.objects.get(pk=product_id)
        return self.create_opening_batch(
            business_id=business_id,
            product_id=product_id,
            quantity=quantity,
            purchase_price=Decimal("0"),
            selling_price=Decimal("0"),
            batch_number="OPEN",
        )

    def create_opening_batch(
        self,
        business_id,
        product_id,
        quantity,
        purchase_price,
        selling_price,
        batch_number="OPEN",
    ):
        return self._create_batch(
            business_id=business_id,
            product_id=product_id,
            quantity=quantity,
            purchase_price=purchase_price,
            selling_price=selling_price,
            batch_number=batch_number or "OPEN",
            reference_type=self.REF_OPENING,
            reference_id=product_id,
        )

    def create_batch_from_purchase(
        self,
        business_id,
        product_id,
        quantity,
        purchase_price,
        selling_price,
        batch_number="",
        expiry_date=None,
        purchase_invoice_item=None,
        reference_id=None,
    ):
        batch = self._create_batch(
            business_id=business_id,
            product_id=product_id,
            quantity=quantity,
            purchase_price=purchase_price,
            selling_price=selling_price,
            batch_number=batch_number,
            expiry_date=expiry_date,
            purchase_invoice_item=purchase_invoice_item,
            reference_type=self.REF_PURCHASE_INVOICE,
            reference_id=reference_id or (purchase_invoice_item.purchase_invoice_id if purchase_invoice_item else 0),
        )
        return batch

    def consume_fifo(
        self,
        business_id,
        product_id,
        quantity,
        reference_type,
        reference_id,
        selling_price=None,
        purchase_item=None,
        sales_invoice_item=None,
    ):
        qty_needed = Decimal(str(quantity))
        if qty_needed <= 0:
            raise ValidationException("Quantity must be greater than zero.")

        batches = self.batch_repository.get_fifo_batches(business_id, product_id)
        remaining = qty_needed
        slices = []

        for batch in batches:
            if remaining <= 0:
                break

            available = Decimal(batch.available_quantity)
            take = min(available, remaining)
            if take <= 0:
                continue

            batch.available_quantity = available - take
            batch.save(update_fields=["available_quantity", "updated_at"])

            unit_sell = Decimal(selling_price if selling_price is not None else batch.selling_price or 0)
            unit_cost = Decimal(batch.purchase_price or 0)
            profit = (unit_sell - unit_cost) * take

            self._log_movement(
                business_id=business_id,
                product_id=product_id,
                inventory_batch=batch,
                reference_type=reference_type,
                reference_id=reference_id,
                movement_type=MovementType.OUT,
                quantity=take,
                balance_quantity=batch.available_quantity,
            )

            slices.append({
                "batch": batch,
                "quantity": take,
                "purchase_price": unit_cost,
                "selling_price": unit_sell,
                "profit": profit,
            })

            if purchase_item or sales_invoice_item:
                from apps.invoicing.models import BatchConsumption

                BatchConsumption.objects.create(
                    purchase_item=purchase_item,
                    sales_invoice_item=sales_invoice_item,
                    inventory_batch=batch,
                    quantity_sold=take,
                    purchase_price=unit_cost,
                    selling_price=unit_sell,
                    profit=profit,
                )

            remaining -= take

        if remaining > 0:
            raise ValidationException(
                f"Insufficient batch stock for product {product_id}. "
                f"Short by {remaining} units."
            )

        return slices

    def restore_purchase_item_consumptions(self, purchase_item):
        from apps.invoicing.models import BatchConsumption
        from apps.inventory.models import MovementType

        consumptions = BatchConsumption.objects.filter(
            purchase_item=purchase_item,
            is_deleted=False,
        ).select_related("inventory_batch")

        for consumption in consumptions:
            batch = consumption.inventory_batch
            qty = Decimal(consumption.quantity_sold)
            batch.available_quantity = Decimal(batch.available_quantity or 0) + qty
            batch.save(update_fields=["available_quantity", "updated_at"])

            self._log_movement(
                business_id=batch.business_id,
                product_id=batch.product_id,
                inventory_batch=batch,
                reference_type=self.REF_CUSTOMER_SALE,
                reference_id=purchase_item.id,
                movement_type=MovementType.IN,
                quantity=qty,
                balance_quantity=batch.available_quantity,
            )
            consumption.soft_delete()

    def _create_batch(
        self,
        business_id,
        product_id,
        quantity,
        purchase_price,
        selling_price,
        batch_number="",
        expiry_date=None,
        manufacture_date=None,
        purchase_invoice_item=None,
        reference_type="",
        reference_id=0,
    ):
        qty = Decimal(str(quantity))
        batch = InventoryBatch.objects.create(
            business_id=business_id,
            product_id=product_id,
            purchase_invoice_item=purchase_invoice_item,
            batch_number=batch_number or "",
            purchase_price=Decimal(str(purchase_price or 0)),
            selling_price=Decimal(str(selling_price or 0)),
            purchased_quantity=qty,
            available_quantity=qty,
            manufacture_date=manufacture_date,
            expiry_date=expiry_date,
        )

        self._log_movement(
            business_id=business_id,
            product_id=product_id,
            inventory_batch=batch,
            reference_type=reference_type,
            reference_id=reference_id,
            movement_type=MovementType.IN,
            quantity=qty,
            balance_quantity=batch.available_quantity,
        )
        return batch

    def _log_movement(
        self,
        business_id,
        product_id,
        inventory_batch,
        reference_type,
        reference_id,
        movement_type,
        quantity,
        balance_quantity,
    ):
        StockMovement.objects.create(
            business_id=business_id,
            product_id=product_id,
            inventory_batch=inventory_batch,
            reference_type=reference_type,
            reference_id=reference_id,
            movement_type=movement_type,
            quantity=Decimal(str(quantity)),
            balance_quantity=Decimal(str(balance_quantity)),
        )
