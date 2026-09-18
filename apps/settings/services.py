import random
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.invoicing.models import PurchaseInvoiceItem
from apps.products.models import Product
from apps.settings.models import ProductBarcode

from apps.purchases.models import Purchase
from apps.settings.models import WhatsAppMessageLog, WhatsAppMessageSetting
from apps.settings.repositories import (
    InvoiceSettingRepository,
    ProductBarcodeRepository,
    TaxRepository,
    WhatsAppMessageLogRepository,
    WhatsAppMessageSettingRepository,
)
from core.base_service import BaseService
from core.exceptions import ValidationException
from core.middleware import get_current_user
from core.validators import validate_required


class TaxService(BaseService):
    def __init__(self):
        super().__init__(repository=TaxRepository())

    def before_create(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")
        data.pop("owner_id", None)
        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")
        self._validate(data)

    def before_update(self, instance, data):
        data.pop("owner_id", None)
        data.pop("business_id", None)
        self._validate(data, exclude_pk=instance.pk, business_id=instance.business_id)

    def _validate(self, data, exclude_pk=None, business_id=None):
        if "key" in data:
            validate_required(data["key"], "Tax key")

        scoped_business_id = business_id or data.get("business_id")
        key = data.get("key")
        if key:
            qs = self.repository.model.objects.filter(
                business_id=scoped_business_id,
                key=key,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("A tax with this key already exists.")

        if "value" in data:
            value = data["value"]
            if value is None or value == "":
                raise ValidationException("Tax value is required.")
            try:
                numeric = Decimal(str(value))
            except Exception as exc:
                raise ValidationException("Tax value must be a number.") from exc
            if numeric < 0 or numeric > 100:
                raise ValidationException("Tax value must be between 0 and 100.")
            data["value"] = numeric


class InvoiceSettingService(BaseService):
    def __init__(self):
        super().__init__(repository=InvoiceSettingRepository())

    def before_create(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")
        data.pop("owner_id", None)
        data.pop("clear_qr", None)
        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")

        if "terms_conditions" in data:
            data["terms_conditions"] = str(data.get("terms_conditions") or "").strip()

        counter = data.get("counter")
        if counter is None or counter == "":
            counter = 1
        data["counter"] = int(counter)
        data["current_counter"] = data["counter"]
        self._validate(data)

    def before_update(self, instance, data):
        data.pop("owner_id", None)
        data.pop("business_id", None)
        if data.pop("clear_qr", False):
            if instance.qr_image:
                instance.qr_image.delete(save=False)
            data["qr_image"] = None
        if "terms_conditions" in data:
            data["terms_conditions"] = str(data.get("terms_conditions") or "").strip()
        self._validate(data, exclude_pk=instance.pk, business_id=instance.business_id, instance=instance)

    def _validate(self, data, exclude_pk=None, business_id=None, instance=None):
        scoped_business_id = business_id or data.get("business_id")

        if "year" in data:
            year = data.get("year")
            if year is None or year == "":
                raise ValidationException("Year is required.")
            try:
                year = int(year)
            except (TypeError, ValueError) as exc:
                raise ValidationException("Year must be a valid number.") from exc
            if year < 2000 or year > 2100:
                raise ValidationException("Year must be between 2000 and 2100.")
            data["year"] = year

        resolved_year = data.get("year") if "year" in data else (instance.year if instance else None)
        if resolved_year is not None:
            if "prefix" in data:
                resolved_prefix = str(data.get("prefix") or "").strip()
                data["prefix"] = resolved_prefix
            else:
                resolved_prefix = (instance.prefix if instance else "") or ""

            if "suffix" in data:
                resolved_suffix = str(data.get("suffix") or "").strip()
                data["suffix"] = resolved_suffix
            else:
                resolved_suffix = (instance.suffix if instance else "") or ""

            qs = self.repository.model.objects.filter(
                business_id=scoped_business_id,
                year=resolved_year,
                prefix=resolved_prefix,
                suffix=resolved_suffix,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException(
                    "Invoice settings with this year, prefix, and suffix already exist."
                )

        for field in ("counter", "current_counter"):
            if field in data:
                value = data[field]
                if value is None or value == "":
                    label = "Start counter" if field == "counter" else "Current counter"
                    raise ValidationException(f"{label} is required.")
                try:
                    numeric = int(value)
                except (TypeError, ValueError) as exc:
                    label = "Start counter" if field == "counter" else "Current counter"
                    raise ValidationException(f"{label} must be a whole number.") from exc
                if numeric < 0:
                    label = "Start counter" if field == "counter" else "Current counter"
                    raise ValidationException(f"{label} cannot be negative.")
                data[field] = numeric

    @staticmethod
    def _shift_end_counter_date(end_counter):
        if not end_counter:
            return None
        try:
            return end_counter.replace(year=end_counter.year + 1)
        except ValueError:
            return end_counter.replace(year=end_counter.year + 1, day=28)

    def resolve_for_sale(self, setting):
        from django.db import IntegrityError
        from django.utils import timezone

        from apps.settings.models import InvoiceSetting

        today = timezone.localdate()
        if setting.is_usable_on(today):
            return setting

        next_year = setting.year + 1
        if next_year > 2100:
            raise ValidationException("Invoice series cannot roll over beyond year 2100.")

        prefix = (setting.prefix or "").strip()
        suffix = (setting.suffix or "").strip()
        next_end_counter = self._shift_end_counter_date(setting.end_counter)

        lookup = {
            "business_id": setting.business_id,
            "year": next_year,
            "prefix": prefix,
            "suffix": suffix,
            "is_deleted": False,
        }

        successor = InvoiceSetting.objects.select_for_update().filter(**lookup).first()
        if successor:
            successor.current_counter = successor.counter
            successor.save(update_fields=["current_counter", "updated_at"])
            return successor

        try:
            return InvoiceSetting.objects.create(
                business_id=setting.business_id,
                year=next_year,
                prefix=prefix,
                suffix=suffix,
                counter=setting.counter,
                current_counter=setting.counter,
                end_counter=next_end_counter,
            )
        except IntegrityError:
            successor = InvoiceSetting.objects.select_for_update().filter(**lookup).first()
            if not successor:
                raise
            successor.current_counter = successor.counter
            successor.save(update_fields=["current_counter", "updated_at"])
            return successor


class ProductBarcodeService(BaseService):
    def __init__(self):
        super().__init__(repository=ProductBarcodeRepository())

    def _related_product_ids(self, barcode):
        product_ids = set()
        if barcode.product_id:
            product_ids.add(barcode.product_id)

        sku = (barcode.model_label or "").strip()
        if sku:
            product_ids.update(
                Product.objects.filter(
                    business_id=barcode.business_id,
                    sku__iexact=sku,
                    is_deleted=False,
                ).values_list("id", flat=True)
            )
        return product_ids

    def is_used_in_purchase(self, barcode):
        product_ids = self._related_product_ids(barcode)
        if not product_ids:
            return False

        return PurchaseInvoiceItem.objects.filter(
            product_id__in=product_ids,
            is_deleted=False,
            purchase_invoice__is_deleted=False,
            purchase_invoice__business_id=barcode.business_id,
        ).exists()

    @transaction.atomic
    def soft_delete(self, pk):
        instance = self.repository.get_by_id(pk)
        if self.is_used_in_purchase(instance):
            raise ValidationException(
                "This barcode cannot be deleted because the product was used in a purchase invoice."
            )
        return self.repository.soft_delete(instance)

    def before_create(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")
        data.pop("owner_id", None)
        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")
        if "product_id" in data:
            self._apply_product(data, business_id)
        self._validate(data)

    def before_update(self, instance, data):
        data.pop("owner_id", None)
        data.pop("business_id", None)
        if "product_id" in data:
            self._apply_product(data, instance.business_id)
            new_product_id = data.get("product_id")
            if instance.product_id and new_product_id and instance.product_id != new_product_id:
                raise ValidationException("This barcode is already assigned to a product.")
        self._validate(data, exclude_pk=instance.pk, business_id=instance.business_id)

    def _apply_product(self, data, business_id):
        product_id = data.pop("product_id", None)
        if not product_id:
            data["product_id"] = None
            return

        product = Product.objects.filter(
            pk=product_id,
            business_id=business_id,
            is_deleted=False,
        ).first()
        if not product:
            raise ValidationException("Product not found.")
        data["product_id"] = product.id

    def _validate(self, data, exclude_pk=None, business_id=None):
        value = data.get("value")
        if value is not None:
            value = str(value).strip()
            if not value:
                raise ValidationException("Barcode value is required.")
            data["value"] = value

        scoped_business_id = business_id or data.get("business_id")
        if value and scoped_business_id:
            qs = self.repository.model.objects.filter(
                business_id=scoped_business_id,
                value=value,
                is_deleted=False,
            )
            if exclude_pk:
                qs = qs.exclude(pk=exclude_pk)
            if qs.exists():
                raise ValidationException("This barcode value already exists.")

        if "model_label" in data:
            data["model_label"] = str(data.get("model_label") or "").strip()

    def bulk_generate(self, data):
        user = get_current_user()
        if not user:
            raise ValidationException("Authentication required.")

        business_id = data.get("business_id")
        if not business_id:
            raise ValidationException("Business is required.")

        product_id = data.get("product_id")

        product = Product.objects.filter(
            pk=product_id,
            business_id=business_id,
            is_deleted=False,
        ).first()
        if not product:
            raise ValidationException("Product not found.")

        sku = (product.sku or "").strip()
        if not sku:
            raise ValidationException("Product SKU is required.")

        existing = ProductBarcode.objects.filter(
            business_id=business_id,
            is_deleted=False,
        ).filter(
            Q(product_id=product.id) | Q(model_label=sku)
        ).first()
        if existing:
            raise ValidationException("A barcode already exists for this SKU.")

        date_stamp = timezone.localdate().strftime("%Y%m%d")
        prefix = date_stamp

        suffixes = self._allocate_unique_suffixes(prefix, business_id, 1)
        created = []

        with transaction.atomic():
            for suffix in suffixes:
                value = f"{prefix}{suffix}"
                instance = self.repository.create(
                    business_id=business_id,
                    product_id=product.id,
                    value=value,
                    model_label=sku,
                    is_active=True,
                )
                created.append(instance)

        return created

    def _collect_used_suffixes(self, prefix, business_id):
        """Return RAND4 suffixes already used for this model+date prefix."""
        used = set()
        suffix_len = 4
        expected_len = len(prefix) + suffix_len

        values = ProductBarcode.objects.filter(
            business_id=business_id,
            is_deleted=False,
            value__startswith=prefix,
        ).values_list("value", flat=True)

        for value in values:
            if len(value) == expected_len:
                used.add(value[len(prefix):])

        return used

    def _allocate_unique_suffixes(self, prefix, business_id, quantity):
        """Pick unique random 4-digit suffixes not yet used for this prefix."""
        used = self._collect_used_suffixes(prefix, business_id)
        remaining = 10000 - len(used)
        if quantity > remaining:
            raise ValidationException(
                f"Cannot generate {quantity} unique barcodes for this date. "
                f"Only {remaining} unique suffixes remain."
            )

        available = [f"{i:04d}" for i in range(10000) if f"{i:04d}" not in used]
        random.shuffle(available)
        return available[:quantity]


class WhatsAppMessageSettingService(BaseService):
    def __init__(self):
        super().__init__(repository=WhatsAppMessageSettingRepository())

    def get_or_create_for_business(self, business_id):
        setting = (
            self.repository.model.objects.filter(
                business_id=business_id,
                is_deleted=False,
            )
            .select_related("business")
            .first()
        )
        if setting:
            return setting
        return self.repository.create(
            business_id=business_id,
            first_message_after_days=1,
            repeat_every_days=7,
            is_active=True,
        )

    def before_update(self, instance, data):
        data.pop("owner_id", None)
        data.pop("business_id", None)
        self._validate(data)

    def _validate(self, data):
        if "first_message_after_days" in data:
            value = data["first_message_after_days"]
            if value is None or value == "":
                raise ValidationException("Days after sale date for first message is required.")
            try:
                numeric = int(value)
            except (TypeError, ValueError) as exc:
                raise ValidationException("Days after sale date must be a whole number.") from exc
            if numeric < 0:
                raise ValidationException("Days after sale date cannot be negative.")
            data["first_message_after_days"] = numeric

        if "repeat_every_days" in data:
            value = data["repeat_every_days"]
            if value is None or value == "":
                raise ValidationException("Repeat frequency is required.")
            try:
                numeric = int(value)
            except (TypeError, ValueError) as exc:
                raise ValidationException("Repeat frequency must be a whole number.") from exc
            if numeric < 1:
                raise ValidationException("Repeat frequency must be at least 1 day.")
            data["repeat_every_days"] = numeric

    @staticmethod
    def _sale_pending_amount(sale):
        paid = sum(
            (payment.amount for payment in sale.payments.all() if not payment.is_deleted),
            Decimal("0"),
        )
        total = sale.total_amount or Decimal("0")
        return max(total - paid, Decimal("0"))

    @staticmethod
    def _sales_base_queryset(business_id):
        return Purchase.objects.filter(
            business_id=business_id,
            is_deleted=False,
            is_cancelled=False,
            is_draft=False,
        )

    @staticmethod
    def _invoice_label(sale):
        if sale.reference_no:
            return sale.reference_no
        return f"Sale #{sale.id}"

    def collect_pending_invoices(self, business_id):
        sales = (
            self._sales_base_queryset(business_id)
            .filter(is_paid=False)
            .select_related("customer")
            .prefetch_related("payments")
            .order_by("purchase_date", "created_at")
        )

        recipients = []
        for sale in sales:
            pending = self._sale_pending_amount(sale)
            if pending <= 0:
                continue

            customer = sale.customer
            recipients.append(
                {
                    "sale_id": sale.id,
                    "invoice_no": self._invoice_label(sale),
                    "customer_id": customer.id if customer else None,
                    "customer_name": sale.customer_name or "Customer",
                    "mobile": (customer.mobile if customer else "") or "",
                    "total_amount": str((sale.total_amount or Decimal("0")).quantize(Decimal("0.01"))),
                    "pending_amount": str(pending.quantize(Decimal("0.01"))),
                    "sale_date": sale.purchase_date,
                }
            )

        recipients.sort(
            key=lambda item: (
                item.get("sale_date") or timezone.localdate(),
                item["invoice_no"].lower(),
            )
        )
        return recipients

    def collect_pending_customers(self, business_id):
        return self.collect_pending_invoices(business_id)

    def _last_log_by_sale(self, business_id):
        logs = WhatsAppMessageLog.objects.filter(
            business_id=business_id,
            is_deleted=False,
            sale_id__isnull=False,
        ).order_by("-sent_at", "-created_at")
        mapping = {}
        for log in logs:
            if log.sale_id not in mapping:
                mapping[log.sale_id] = log
        return mapping

    def _is_due_for_first_message(self, item, setting, today):
        sale_date = item.get("sale_date")
        if not sale_date:
            return False, "No sale date found for this invoice."

        days_since_sale = (today - sale_date).days
        if days_since_sale >= setting.first_message_after_days:
            return True, None

        days_remaining = setting.first_message_after_days - days_since_sale
        return False, (
            f"Invoice sale was {days_since_sale} day(s) ago; first reminder sends "
            f"{days_remaining} day(s) from now "
            f"(setting: {setting.first_message_after_days} day(s) after sale date)"
        )

    def filter_eligible_recipients(self, business_id, recipients, setting):
        today = timezone.localdate()
        last_logs = self._last_log_by_sale(business_id)
        eligible = []
        skipped = []

        for item in recipients:
            sale_id = item.get("sale_id")
            last_log = last_logs.get(sale_id) if sale_id else None

            if not last_log:
                is_due, reason = self._is_due_for_first_message(item, setting, today)
                if is_due:
                    item["is_first_send"] = True
                    eligible.append(item)
                elif reason:
                    skipped.append(
                        {
                            "invoice_no": item.get("invoice_no") or "",
                            "customer_name": item["customer_name"],
                            "mobile": item.get("mobile") or "",
                            "reason": reason,
                        }
                    )
                continue

            last_sent_date = timezone.localdate(last_log.sent_at)
            days_since_last = (today - last_sent_date).days
            if days_since_last >= setting.repeat_every_days:
                item["is_first_send"] = False
                eligible.append(item)
            else:
                skipped.append(
                    {
                        "invoice_no": item.get("invoice_no") or "",
                        "customer_name": item["customer_name"],
                        "mobile": item.get("mobile") or "",
                        "reason": (
                            f"Repeat reminder already sent {days_since_last} day(s) ago; "
                            f"next send after {setting.repeat_every_days} day(s)"
                        ),
                    }
                )

        return eligible, skipped

    def _resolve_first_message_sent_date(self, business_id, sale_id):
        if sale_id:
            existing = (
                WhatsAppMessageLog.objects.filter(
                    business_id=business_id,
                    is_deleted=False,
                    sale_id=sale_id,
                )
                .order_by("first_message_sent_at")
                .first()
            )
            if existing:
                return existing.first_message_sent_at
        return timezone.localdate()

    @transaction.atomic
    def _store_sent_messages(self, business_id, recipients):
        sent_at = timezone.now()
        logs = []
        for item in recipients:
            sale_id = item.get("sale_id")
            customer_id = item.get("customer_id")
            customer_name = item["customer_name"]
            mobile = item.get("mobile") or ""
            first_message_sent_at = self._resolve_first_message_sent_date(
                business_id,
                sale_id,
            )
            log = WhatsAppMessageLog.objects.create(
                business_id=business_id,
                sale_id=sale_id,
                invoice_no=item.get("invoice_no") or "",
                customer_id=customer_id,
                customer_name=customer_name,
                mobile=mobile,
                total_amount=Decimal(item["total_amount"]),
                pending_amount=Decimal(item["pending_amount"]),
                first_message_sent_at=first_message_sent_at,
                sent_at=sent_at,
                is_first_send=bool(item.get("is_first_send", False)),
                is_active=True,
            )
            logs.append(log)
        return logs

    def list_sent_messages(self, business_id):
        return (
            WhatsAppMessageLog.objects.filter(
                business_id=business_id,
                is_deleted=False,
                is_first_send=True,
            )
            .select_related("customer")
            .order_by("-sent_at", "-created_at")
        )

    def send_pending_payment_messages(self, business_id):
        setting = self.get_or_create_for_business(business_id)
        pending_recipients = self.collect_pending_invoices(business_id)
        recipients, skipped = self.filter_eligible_recipients(
            business_id,
            pending_recipients,
            setting,
        )
        first_time_count = sum(1 for item in recipients if item.get("is_first_send"))

        if not pending_recipients:
            print("[WhatsApp Reminder] No pending invoices found.")
        elif not recipients:
            print("[WhatsApp Reminder] No invoices due for reminders based on current settings.")
            for index, item in enumerate(skipped, start=1):
                print(
                    f"{index}. Skipped: Invoice {item.get('invoice_no') or '—'} | "
                    f"Customer: {item['customer_name']} | "
                    f"Mobile: {item['mobile'] or '—'} | Reason: {item['reason']}"
                )
        else:
            logs = self._store_sent_messages(business_id, recipients)
            print(f"[WhatsApp Reminder] Sent payment reminders for {len(recipients)} invoice(s):")
            for index, (item, log) in enumerate(zip(recipients, logs, strict=True), start=1):
                print(
                    f"{index}. Invoice: {item.get('invoice_no') or '—'} | "
                    f"Customer: {item['customer_name']} | "
                    f"Mobile: {item['mobile'] or '—'} | "
                    f"Total Amount: {item['total_amount']} | "
                    f"Pending Amount: {item['pending_amount']} | "
                    f"First Message Date: {log.first_message_sent_at.isoformat()} | "
                    f"First Send: {'Yes' if log.is_first_send else 'No'}"
                )

        sent_payload = [
            {
                "sale_id": item.get("sale_id"),
                "invoice_no": item.get("invoice_no") or "",
                "customer_name": item["customer_name"],
                "mobile": item.get("mobile") or "",
                "total_amount": item["total_amount"],
                "pending_amount": item["pending_amount"],
                "is_first_send": bool(item.get("is_first_send")),
            }
            for item in recipients
        ]

        return {
            "settings": {
                "first_message_after_days": setting.first_message_after_days,
                "repeat_every_days": setting.repeat_every_days,
            },
            "pending_count": len(pending_recipients),
            "count": len(recipients),
            "first_time_count": first_time_count,
            "recipients": sent_payload,
            "skipped": skipped,
        }
