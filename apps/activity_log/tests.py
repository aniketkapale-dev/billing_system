from decimal import Decimal
from datetime import datetime, timedelta
from unittest.mock import patch
from django.db import transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from apps.businesses.models import Business
from apps.business_users.models import BusinessUser
from apps.catalog.models import Category, Unit
from apps.products.models import Product
from apps.purchases.models import Purchase, PurchaseItem, PurchasePayment
from apps.invoicing.models import PurchaseInvoice, PurchaseInvoiceItem
from apps.settings.models import Tax
from apps.users.models import User
from .models import ActivityLog
from .views import ActivityLogListView


class ActivityLogTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create(full_name="Owner", mobile_number="9000000001")
        self.staff = User.objects.create(full_name="Staff", mobile_number="9000000002")
        self.other = User.objects.create(full_name="Other owner", mobile_number="9000000003")
        self.business = Business.objects.create(owner=self.owner, business_name="Salon")
        self.other_business = Business.objects.create(owner=self.other, business_name="Other salon")
        BusinessUser.objects.create(business=self.business, user=self.staff)
        self.tax5 = Tax.objects.create(business=self.business, key="GST5", value=5)
        self.tax18 = Tax.objects.create(business=self.business, key="GST18", value=18)
        self.category = Category.objects.create(business=self.business, name="Shampoo", sale_tax_ids=[self.tax5.pk])
        self.unit = Unit.objects.create(business=self.business, name="Piece", short_name="pc")
        self.product = Product.objects.create(owner=self.owner, business=self.business, name="Shampoo bottle", category=self.category, unit=self.unit)
        ActivityLog.objects.all().delete()

    def request(self, user, business=None, method="get", params=None):
        request = getattr(APIRequestFactory(), method)("/api/activity-log/", params or {}, HTTP_X_BUSINESS_ID=str((business or self.business).pk))
        force_authenticate(request, user=user)
        return ActivityLogListView.as_view()(request)

    def test_category_tax_change_has_names_old_new_and_actor(self):
        with patch("apps.activity_log.signals.get_current_user", return_value=self.owner):
            self.category.sale_tax_ids = [self.tax18.pk]
            self.category.save()
        entry = ActivityLog.objects.get()
        self.assertEqual(entry.actor_name, "Owner")
        self.assertIn("Changed GST for Shampoo from 5.00% to 18.00%", entry.description)
        self.tax5.value = 28
        self.tax5.save()
        entry.refresh_from_db()
        self.assertIn("5.00%", entry.description)

    def test_sale_payment_cancellation_and_purchase_items_are_logged(self):
        sale = Purchase.objects.create(owner=self.owner, business=self.business, reference_no="S-1", customer_name="Buyer", total_amount=105)
        PurchaseItem.objects.create(purchase=sale, product=self.product, quantity=1, unit_price=105, line_total=105, gst_rate=5, tax_amount=5)
        PurchasePayment.objects.create(purchase=sale, amount=50)
        sale.is_cancelled = True
        sale.cancellation_reason = "Customer cancelled"
        sale.save()
        invoice = PurchaseInvoice.objects.create(business=self.business, invoice_number="P-1")
        PurchaseInvoiceItem.objects.create(purchase_invoice=invoice, product=self.product, quantity=2, purchase_price=118, line_total=236, gst_rate=18, tax=36)
        text = " ".join(ActivityLog.objects.values_list("description", flat=True))
        for expected in ("S-1", "P-1", "Recorded a payment of ?50", "Cancelled sale invoice", "Shampoo bottle", "18.00%"):
            self.assertIn(expected, text)

    def test_rollback_leaves_no_activity(self):
        with self.assertRaises(RuntimeError):
            with transaction.atomic():
                self.category.name = "Rolled back"
                self.category.save()
                raise RuntimeError("failed operation")
        self.assertEqual(ActivityLog.objects.count(), 0)

    def test_noop_save_does_not_add_noise(self):
        self.category.save()
        self.assertFalse(ActivityLog.objects.exists())

    def test_owner_access_and_business_isolation(self):
        self.category.name = "Changed"
        self.category.save()
        response = self.request(self.owner)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["pagination"]["count"], 1)
        self.assertNotEqual(self.request(self.staff).status_code, 200)
        self.assertNotEqual(self.request(self.other).status_code, 200)
        self.assertEqual(self.request(self.other, self.other_business).data["data"]["pagination"]["count"], 0)
        self.assertEqual(self.request(self.owner, method="post").status_code, 405)

    def test_filters_and_invalid_date(self):
        self.category.name = "Changed"
        self.category.save()
        self.assertEqual(self.request(self.owner, params={"area": "sales"}).data["data"]["pagination"]["count"], 0)
        self.assertEqual(self.request(self.owner, params={"search": "Changed", "date_from": timezone.localdate().isoformat()}).data["data"]["pagination"]["count"], 1)
        self.assertEqual(self.request(self.owner, params={"date_from": "invalid"}).status_code, 400)

    def test_date_filters_support_each_bound_and_inclusive_ranges(self):
        start = timezone.make_aware(datetime(2026, 9, 10))
        for offset in range(5):
            entry = ActivityLog.objects.create(
                business=self.business,
                actor_id=self.owner.pk,
                actor_name="Owner",
                area="products",
                action="updated",
                description=f"Activity {offset}",
                record_type="products.Product",
                record_id=self.product.pk,
            )
            ActivityLog.objects.filter(pk=entry.pk).update(
                occurred_at=start + timedelta(days=offset)
            )

        after = self.request(self.owner, params={"date_from": "2026-09-11"})
        before = self.request(self.owner, params={"date_to": "2026-09-13"})
        between = self.request(self.owner, params={
            "date_from": "2026-09-11",
            "date_to": "2026-09-13",
        })

        self.assertEqual(after.data["data"]["pagination"]["count"], 4)
        self.assertEqual(before.data["data"]["pagination"]["count"], 4)
        self.assertEqual(between.data["data"]["pagination"]["count"], 3)

    def test_soft_delete_is_recorded(self):
        self.category.soft_delete()
        self.assertEqual(ActivityLog.objects.get().action, "removed")

    def test_partial_save_only_logs_persisted_fields(self):
        self.category.name = "Not saved"
        self.category.description = "Saved description"
        self.category.save(update_fields=["description"])
        self.assertFalse(ActivityLog.objects.exists())

    def test_stock_movement_uses_plain_language(self):
        from apps.inventory.models import StockMovement
        StockMovement.objects.create(business=self.business, product=self.product,
            reference_type="opening_stock", reference_id=self.product.pk,
            movement_type="in", quantity=3, balance_quantity=3)
        entry = ActivityLog.objects.get()
        self.assertIn("Added 3.00 units of Shampoo bottle to stock", entry.description)
        self.assertEqual(entry.area, "stock")

    def test_bulk_soft_delete_keeps_activity(self):
        Category.objects.filter(pk=self.category.pk).soft_delete()
        self.assertEqual(ActivityLog.objects.get().action, "removed")
