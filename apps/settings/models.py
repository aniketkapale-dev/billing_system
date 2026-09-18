from decimal import Decimal

from django.db import models

from core.base_entity import BaseEntity


class Tax(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="taxes",
        db_column="business_id",
    )
    key = models.CharField(max_length=100)
    value = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal("0"))

    class Meta:
        db_table = "taxes"
        verbose_name = "Tax"
        verbose_name_plural = "Taxes"
        ordering = ("key",)
        constraints = [
            models.UniqueConstraint(
                fields=["business", "key"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_business_tax_key",
            )
        ]

    def __str__(self):
        return f"{self.key} ({self.value}%)"


class InvoiceSetting(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="invoice_settings",
        db_column="business_id",
    )
    year = models.PositiveIntegerField()
    prefix = models.CharField(max_length=50, blank=True, default="")
    suffix = models.CharField(max_length=50, blank=True, default="")
    counter = models.PositiveIntegerField(default=1)
    current_counter = models.PositiveIntegerField(default=1)
    end_counter = models.DateField(null=True, blank=True)
    terms_conditions = models.TextField(blank=True, default="")
    qr_image = models.ImageField(upload_to="invoice_qr/", blank=True, null=True)

    class Meta:
        db_table = "invoice_settings"
        verbose_name = "Invoice Setting"
        verbose_name_plural = "Invoice Settings"
        ordering = ("-year", "prefix", "suffix")
        constraints = [
            models.UniqueConstraint(
                fields=["business", "year", "prefix", "suffix"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_business_invoice_setting_series",
            )
        ]

    def format_invoice_number(self, counter=None):
        counter = self.current_counter if counter is None else counter
        prefix = (self.prefix or "").strip()
        suffix = (self.suffix or "").strip()
        parts = []
        if prefix:
            parts.append(prefix)
        parts.append(str(counter))
        if suffix:
            parts.append(suffix)
        return "/".join(parts)

    def is_usable_on(self, day=None):
        from django.utils import timezone

        day = day or timezone.localdate()
        if not self.end_counter:
            return True
        return self.end_counter >= day

    def __str__(self):
        return f"{self.format_invoice_number()} ({self.year})"


class ProductBarcode(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="product_barcodes",
        db_column="business_id",
    )
    product = models.ForeignKey(
        "products.Product",
        on_delete=models.SET_NULL,
        related_name="barcode_entries",
        db_column="product_id",
        null=True,
        blank=True,
    )
    value = models.CharField(max_length=100)
    model_label = models.CharField(max_length=100, blank=True, default="")

    class Meta:
        db_table = "product_barcodes"
        verbose_name = "Product Barcode"
        verbose_name_plural = "Product Barcodes"
        ordering = ("model_label", "value")
        constraints = [
            models.UniqueConstraint(
                fields=["business", "value"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_business_product_barcode_value",
            )
        ]

    def __str__(self):
        label = (self.model_label or "").strip()
        if label:
            return f"{label} ({self.value})"
        return self.value


class WhatsAppMessageSetting(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="whatsapp_message_settings",
        db_column="business_id",
    )
    first_message_after_days = models.PositiveIntegerField(
        default=1,
        help_text="Days after sale date to send the first reminder.",
    )
    repeat_every_days = models.PositiveIntegerField(
        default=7,
        help_text="Days after the first message to repeat reminders.",
    )

    class Meta:
        db_table = "whatsapp_message_settings"
        verbose_name = "WhatsApp Message Setting"
        verbose_name_plural = "WhatsApp Message Settings"
        constraints = [
            models.UniqueConstraint(
                fields=["business"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_business_whatsapp_message_setting",
            )
        ]

    def __str__(self):
        return (
            f"WhatsApp reminders: first {self.first_message_after_days}d after sale, "
            f"repeat every {self.repeat_every_days}d"
        )


class WhatsAppMessageLog(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="whatsapp_message_logs",
        db_column="business_id",
    )
    sale = models.ForeignKey(
        "purchases.Purchase",
        on_delete=models.SET_NULL,
        related_name="whatsapp_message_logs",
        db_column="sale_id",
        null=True,
        blank=True,
    )
    invoice_no = models.CharField(max_length=50, blank=True, default="")
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        related_name="whatsapp_message_logs",
        db_column="customer_id",
        null=True,
        blank=True,
    )
    customer_name = models.CharField(max_length=255)
    mobile = models.CharField(max_length=20, blank=True, default="")
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    pending_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    first_message_sent_at = models.DateField()
    sent_at = models.DateTimeField()
    is_first_send = models.BooleanField(default=True)

    class Meta:
        db_table = "whatsapp_message_logs"
        verbose_name = "WhatsApp Message Log"
        verbose_name_plural = "WhatsApp Message Logs"
        ordering = ("-sent_at", "-created_at")

    def __str__(self):
        return f"{self.customer_name} ({self.sent_at.date()})"
