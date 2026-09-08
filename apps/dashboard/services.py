from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Prefetch, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from apps.inventory.models import InventoryStock
from apps.invoicing.models import InventoryBatch, PurchaseInvoice
from apps.products.models import Product
from apps.purchases.models import Purchase, PurchaseItem
from apps.users.querysets import business_owner_users_queryset
from core.business_access import get_active_business


class DashboardService:
    RECENT_LIMIT = 5
    SALES_CHART_PERIODS = {"day", "week", "month", "all"}
    PENDING_PAYMENTS_PERIODS = {"day", "week", "month"}
    EXPIRING_PRODUCTS_PERIODS = {"day", "week", "month"}
    KPI_PERIODS = {"day", "week", "month"}

    def get_stats(self, request):
        from core.business_access import resolve_business_access, user_has_tab

        business = get_active_business(request)
        _access = resolve_business_access(request)[1]
        if not user_has_tab(_access, "dashboard"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have access to the dashboard.")
        business_id = business.id

        totals = {
            "products": Product.objects.filter(
                business_id=business_id,
                is_deleted=False,
            ).count(),
            "purchases": PurchaseInvoice.objects.filter(
                business_id=business_id,
                is_deleted=False,
            ).count(),
            "sales": Purchase.objects.filter(
                business_id=business_id,
                is_deleted=False,
            ).count(),
            "in_stock_products": InventoryStock.objects.filter(
                business_id=business_id,
                is_deleted=False,
                quantity__gt=0,
            )
            .values("product_id")
            .distinct()
            .count(),
        }

        recent_purchases = self._recent_purchases(business_id)
        recent_sales = self._recent_sales(business_id)

        return {
            "totals": totals,
            "recent_purchases": recent_purchases,
            "recent_sales": recent_sales,
        }

    def _recent_purchases(self, business_id):
        invoices = (
            PurchaseInvoice.objects.filter(
                business_id=business_id,
                is_deleted=False,
            )
            .annotate(
                items_count=Count(
                    "items",
                    filter=Q(items__is_deleted=False),
                )
            )
            .order_by("-invoice_date", "-created_at")[: self.RECENT_LIMIT]
        )
        return [
            {
                "id": invoice.id,
                "date": invoice.invoice_date.isoformat() if invoice.invoice_date else "",
                "invoice_number": invoice.invoice_number,
                "amount": invoice.grand_total,
                "items_count": invoice.items_count,
            }
            for invoice in invoices
        ]

    def _recent_sales(self, business_id):
        sales = (
            Purchase.objects.filter(
                business_id=business_id,
                is_deleted=False,
            )
            .annotate(
                items_count=Count(
                    "items",
                    filter=Q(items__is_deleted=False),
                )
            )
            .order_by("-purchase_date", "-created_at")[: self.RECENT_LIMIT]
        )
        return [
            {
                "id": sale.id,
                "date": sale.purchase_date.isoformat() if sale.purchase_date else "",
                "customer_name": sale.customer_name,
                "reference_no": sale.reference_no or "",
                "amount": sale.total_amount,
                "items_count": sale.items_count,
            }
            for sale in sales
        ]

    def get_sales_chart(self, request, period):
        from core.business_access import resolve_business_access, user_has_tab

        business = get_active_business(request)
        _access = resolve_business_access(request)[1]
        if not user_has_tab(_access, "dashboard"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have access to the dashboard.")

        period = (period or "week").lower()
        if period not in self.SALES_CHART_PERIODS:
            period = "week"

        series = self._sales_chart_series(business.id, period)
        return {"period": period, "series": series}

    def _sales_base_queryset(self, business_id):
        return Purchase.objects.filter(
            business_id=business_id,
            is_deleted=False,
            is_cancelled=False,
            is_draft=False,
        )

    def _sales_chart_series(self, business_id, period):
        today = timezone.localdate()
        base_qs = self._sales_base_queryset(business_id)

        if period == "day":
            start = today
            end = today
            return self._daily_sales_series(base_qs, start, end)

        if period == "week":
            start = today - timedelta(days=6)
            end = today
            return self._daily_sales_series(base_qs, start, end)

        if period == "month":
            start = today.replace(day=1)
            end = today
            return self._daily_sales_series(base_qs, start, end)

        return self._monthly_sales_series(base_qs, start=None, end=today)

    def _daily_sales_series(self, base_qs, start, end):
        rows = (
            base_qs.filter(purchase_date__gte=start, purchase_date__lte=end)
            .values("purchase_date")
            .annotate(amount=Sum("total_amount"))
            .order_by("purchase_date")
        )
        amount_map = {row["purchase_date"]: row["amount"] or Decimal("0") for row in rows}

        series = []
        cursor = start
        while cursor <= end:
            amount = amount_map.get(cursor, Decimal("0"))
            series.append(
                {
                    "date": cursor.isoformat(),
                    "amount": amount,
                }
            )
            cursor += timedelta(days=1)
        return series

    def _monthly_sales_series(self, base_qs, start, end):
        qs = base_qs.filter(purchase_date__lte=end)
        if start is not None:
            qs = qs.filter(purchase_date__gte=start)

        rows = (
            qs.annotate(month=TruncMonth("purchase_date"))
            .values("month")
            .annotate(amount=Sum("total_amount"))
            .order_by("month")
        )

        series = []
        for row in rows:
            month = row["month"]
            if not month:
                continue
            month_date = month.date() if hasattr(month, "date") else month
            series.append(
                {
                    "date": month_date.isoformat(),
                    "amount": row["amount"] or Decimal("0"),
                }
            )

        if start is not None and end is not None:
            amount_map = {}
            for item in series:
                key = item["date"][:7]
                amount_map[key] = item["amount"]

            filled = []
            cursor = start.replace(day=1)
            end_month = end.replace(day=1)
            while cursor <= end_month:
                key = cursor.strftime("%Y-%m")
                existing = amount_map.get(key, Decimal("0"))
                filled.append(
                    {
                        "date": cursor.isoformat(),
                        "amount": existing,
                    }
                )
                if cursor.month == 12:
                    cursor = cursor.replace(year=cursor.year + 1, month=1)
                else:
                    cursor = cursor.replace(month=cursor.month + 1)
            return filled

        return series

    def _pending_products_lines(self, sale):
        parts = []
        for item in sale.items.all():
            if item.is_deleted:
                continue
            product_name = item.product.name if item.product_id and item.product else "Product"
            quantity = item.quantity
            if quantity == int(quantity):
                qty_label = str(int(quantity))
            else:
                qty_label = str(quantity).rstrip("0").rstrip(".")
            parts.append(f"{product_name} x {qty_label}")
        return parts

    def get_pending_payments(self, request, period):
        from core.business_access import resolve_business_access, user_has_tab

        business = get_active_business(request)
        _access = resolve_business_access(request)[1]
        if not user_has_tab(_access, "dashboard"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have access to the dashboard.")

        period = (period or "week").lower()
        if period not in self.PENDING_PAYMENTS_PERIODS:
            period = "week"

        today = timezone.localdate()
        if period == "day":
            start = today
        elif period == "month":
            start = today.replace(day=1)
        else:
            start = today - timedelta(days=6)

        items_qs = PurchaseItem.objects.filter(is_deleted=False).select_related("product")
        sales = (
            self._sales_base_queryset(business.id)
            .filter(
                is_paid=False,
                purchase_date__gte=start,
                purchase_date__lte=today,
            )
            .select_related("payment_type", "customer")
            .prefetch_related(Prefetch("items", queryset=items_qs))
            .order_by("-purchase_date", "-created_at")
        )

        items = []
        for sale in sales:
            customer = sale.customer
            items.append(
                {
                    "id": sale.id,
                    "customer_name": sale.customer_name,
                    "customer_mobile": customer.mobile if customer else "",
                    "company_name": customer.company_name if customer else "",
                    "amount": sale.total_amount,
                    "total_cost": sale.total_cost,
                    "purchase_date": sale.purchase_date.isoformat() if sale.purchase_date else "",
                    "reference_no": sale.reference_no or "",
                    "payment_type_name": sale.payment_type.name if sale.payment_type else "",
                    "products_sold_lines": self._pending_products_lines(sale),
                }
            )

        total_count = sales.count()
        total_amount = sales.aggregate(total=Sum("total_amount"))["total"] or Decimal("0")

        return {
            "period": period,
            "items": items,
            "total_amount": total_amount,
            "count": total_count,
        }

    def _normalize_kpi_period(self, period):
        period = (period or "week").lower()
        if period not in self.KPI_PERIODS:
            period = "week"
        return period

    def _kpi_period_date_range(self, period, today):
        period = self._normalize_kpi_period(period)
        if period == "day":
            return today, today
        if period == "month":
            return today.replace(day=1), today
        return today - timedelta(days=6), today

    def _expiring_date_range(self, period, today):
        period = self._normalize_kpi_period(period)
        if period == "day":
            return today, today
        if period == "month":
            if today.month == 12:
                next_month = today.replace(year=today.year + 1, month=1, day=1)
            else:
                next_month = today.replace(month=today.month + 1, day=1)
            end = next_month - timedelta(days=1)
            return today, end
        return today, today + timedelta(days=6)

    def get_kpi_counts(self, request, purchases_period, sales_period):
        from core.business_access import resolve_business_access, user_has_tab

        business = get_active_business(request)
        _access = resolve_business_access(request)[1]
        if not user_has_tab(_access, "dashboard"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have access to the dashboard.")

        purchases_period = self._normalize_kpi_period(purchases_period)
        sales_period = self._normalize_kpi_period(sales_period)
        today = timezone.localdate()

        purchases_start, purchases_end = self._kpi_period_date_range(purchases_period, today)
        sales_start, sales_end = self._kpi_period_date_range(sales_period, today)

        purchases_count = PurchaseInvoice.objects.filter(
            business_id=business.id,
            is_deleted=False,
            invoice_date__gte=purchases_start,
            invoice_date__lte=purchases_end,
        ).count()

        sales_count = self._sales_base_queryset(business.id).filter(
            purchase_date__gte=sales_start,
            purchase_date__lte=sales_end,
        ).count()

        return {
            "purchases": {
                "period": purchases_period,
                "count": purchases_count,
            },
            "sales": {
                "period": sales_period,
                "count": sales_count,
            },
        }

    def get_expiring_products(self, request, period):
        from core.business_access import resolve_business_access, user_has_tab

        business = get_active_business(request)
        _access = resolve_business_access(request)[1]
        if not user_has_tab(_access, "dashboard"):
            from rest_framework.exceptions import PermissionDenied

            raise PermissionDenied("You do not have access to the dashboard.")

        period = (period or "week").lower()
        if period not in self.EXPIRING_PRODUCTS_PERIODS:
            period = "week"

        today = timezone.localdate()
        start, end = self._expiring_date_range(period, today)

        batches = (
            InventoryBatch.objects.filter(
                business_id=business.id,
                is_deleted=False,
                available_quantity__gt=0,
                expiry_date__isnull=False,
                expiry_date__gte=start,
                expiry_date__lte=end,
            )
            .select_related("product")
            .order_by("expiry_date", "product__name", "batch_number")
        )

        items = []
        product_ids = set()
        for batch in batches:
            product_ids.add(batch.product_id)
            items.append(
                {
                    "id": batch.id,
                    "product_id": batch.product_id,
                    "product_name": batch.product.name if batch.product else "",
                    "batch_number": batch.batch_number or "",
                    "expiry_date": batch.expiry_date.isoformat() if batch.expiry_date else "",
                    "available_quantity": batch.available_quantity,
                }
            )

        return {
            "period": period,
            "count": len(product_ids),
            "batch_count": len(items),
            "items": items,
        }


class SuperAdminDashboardService:
    TREND_MONTHS = 6

    def get_stats(self):
        owners = business_owner_users_queryset()
        active_count = owners.filter(is_active=True).count()
        inactive_count = owners.filter(is_active=False).count()
        total_count = active_count + inactive_count

        now = timezone.now()
        month_cursor = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        month_keys = []
        for offset in range(self.TREND_MONTHS - 1, -1, -1):
            year = month_cursor.year
            month = month_cursor.month - offset
            while month <= 0:
                month += 12
                year -= 1
            month_keys.append(timezone.datetime(year, month, 1, tzinfo=month_cursor.tzinfo))

        trend_start = month_keys[0]
        monthly_rows = (
            owners.filter(created_at__gte=trend_start)
            .annotate(month=TruncMonth("created_at"))
            .values("month")
            .annotate(
                total=Count("id"),
                active=Count("id", filter=Q(is_active=True)),
                inactive=Count("id", filter=Q(is_active=False)),
            )
            .order_by("month")
        )
        monthly_map = {
            row["month"].strftime("%Y-%m"): row for row in monthly_rows if row["month"]
        }

        monthly_trend = []
        for month_start in month_keys:
            key = month_start.strftime("%Y-%m")
            row = monthly_map.get(key, {})
            monthly_trend.append(
                {
                    "label": month_start.strftime("%b %Y"),
                    "total": row.get("total", 0),
                    "active": row.get("active", 0),
                    "inactive": row.get("inactive", 0),
                }
            )

        return {
            "totals": {
                "total": total_count,
                "active": active_count,
                "inactive": inactive_count,
            },
            "distribution": [
                {"label": "Active Users", "value": active_count, "tone": "active"},
                {"label": "Inactive Users", "value": inactive_count, "tone": "inactive"},
            ],
            "monthly_trend": monthly_trend,
        }
