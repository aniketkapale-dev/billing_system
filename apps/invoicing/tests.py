from decimal import Decimal

from django.test import TestCase

from apps.businesses.models import Business
from apps.catalog.models import Unit
from apps.invoicing.models import (
    InventoryBatch,
    PurchaseInvoice,
    PurchaseInvoiceItem,
    PurchaseReturnItem,
)
from apps.invoicing.return_services import PurchaseReturnService
from apps.inventory.models import InventoryStock, MovementType, StockMovement
from apps.products.models import Product
from apps.users.models import User
from core.exceptions import ValidationException


class PurchaseReturnServiceTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create(
            full_name="Owner",
            mobile_number="9000000101",
            password="test-password",
        )
        self.business = Business.objects.create(
            owner=self.owner,
            business_name="Return Test Shop",
        )
        self.unit = Unit.objects.create(
            business=self.business,
            name="Piece",
            short_name="pc",
        )
        self.product = Product.objects.create(
            owner=self.owner,
            business=self.business,
            unit=self.unit,
            name="Test product",
            sku="RETURN-TEST",
        )
        self.invoice = PurchaseInvoice.objects.create(
            business=self.business,
            invoice_number="PI-RETURN-1",
        )
        self.invoice_item = PurchaseInvoiceItem.objects.create(
            purchase_invoice=self.invoice,
            product=self.product,
            quantity=Decimal("5.00"),
            purchase_price=Decimal("10.00"),
            line_total=Decimal("50.00"),
        )
        self.batch = InventoryBatch.objects.create(
            business=self.business,
            product=self.product,
            purchase_invoice_item=self.invoice_item,
            purchased_quantity=Decimal("5.00"),
            available_quantity=Decimal("5.00"),
        )
        self.stock = InventoryStock.objects.create(
            owner=self.owner,
            business=self.business,
            product=self.product,
            quantity=Decimal("5.00"),
        )
        self.service = PurchaseReturnService()

    def test_return_deducts_purchase_batch_and_stock_and_is_listed(self):
        self.service.return_items(
            business_id=self.business.id,
            purchase_invoice_id=self.invoice.id,
            items=[{
                "purchase_invoice_item_id": self.invoice_item.id,
                "quantity": Decimal("2.00"),
            }],
            reason="Damaged",
        )

        self.batch.refresh_from_db()
        self.stock.refresh_from_db()
        self.assertEqual(self.batch.available_quantity, Decimal("3.00"))
        self.assertEqual(self.stock.quantity, Decimal("3.00"))
        movement = StockMovement.objects.get(reference_type="purchase_return")
        self.assertEqual(movement.movement_type, MovementType.OUT)
        self.assertEqual(movement.quantity, Decimal("2.00"))
        listed_invoice = self.service.list_returnable_purchases(self.business.id)[0]
        self.assertEqual(listed_invoice["items"][0]["returned_quantity"], "2.00")
        self.assertEqual(listed_invoice["items"][0]["returnable_quantity"], "3.00")
        self.assertEqual(PurchaseReturnItem.objects.count(), 1)

    def test_return_cannot_exceed_quantity_left_or_available_stock(self):
        self.service.return_items(
            business_id=self.business.id,
            purchase_invoice_id=self.invoice.id,
            items=[{
                "purchase_invoice_item_id": self.invoice_item.id,
                "quantity": Decimal("4.00"),
            }],
        )

        with self.assertRaises(ValidationException):
            self.service.return_items(
                business_id=self.business.id,
                purchase_invoice_id=self.invoice.id,
                items=[{
                    "purchase_invoice_item_id": self.invoice_item.id,
                    "quantity": Decimal("2.00"),
                }],
            )

        self.batch.refresh_from_db()
        self.stock.refresh_from_db()
        self.assertEqual(self.batch.available_quantity, Decimal("1.00"))
        self.assertEqual(self.stock.quantity, Decimal("1.00"))
        self.assertEqual(PurchaseReturnItem.objects.count(), 1)
