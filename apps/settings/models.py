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
