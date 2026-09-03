from django.db.models import Count, Q
from django.db.models.functions import TruncMonth
from django.utils import timezone

from apps.inventory.models import InventoryStock
from apps.invoicing.models import PurchaseInvoice
from apps.products.models import Product
from apps.purchases.models import Purchase
from apps.users.querysets import business_owner_users_queryset
from core.business_access import get_active_business


class DashboardService:
    RECENT_LIMIT = 5

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
