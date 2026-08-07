from decimal import Decimal

from django.db import models
from django.utils import timezone

from core.base_entity import BaseEntity


class ExpenseCategory(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="expense_categories",
        db_column="business_id",
    )
    category_name = models.CharField(max_length=150)

    class Meta:
        db_table = "expense_categories"
        verbose_name = "Expense Category"
        verbose_name_plural = "Expense Categories"
        constraints = [
            models.UniqueConstraint(
                fields=["business", "category_name"],
                condition=models.Q(is_deleted=False),
                name="uniq_active_business_expense_category",
            )
        ]

    def __str__(self):
        return self.category_name


class Expense(BaseEntity):
    business = models.ForeignKey(
        "businesses.Business",
        on_delete=models.CASCADE,
        related_name="expenses",
        db_column="business_id",
    )
    expense_category = models.ForeignKey(
        ExpenseCategory,
        on_delete=models.PROTECT,
        related_name="expenses",
        db_column="expense_category_id",
    )
    expense_date = models.DateField(default=timezone.localdate)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    payment_mode = models.CharField(max_length=50, blank=True, default="")
    description = models.TextField(blank=True, default="")

    class Meta:
        db_table = "expenses"
        verbose_name = "Expense"
        verbose_name_plural = "Expenses"
        ordering = ("-expense_date", "-created_at")

    def __str__(self):
        return f"{self.expense_category_id} — {self.amount}"
