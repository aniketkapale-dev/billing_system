"""Record business changes using an explicit allowlist; never copy request payloads."""
from django.apps import apps
from django.db.models.signals import pre_save, post_save
from core.middleware import get_current_user
from .models import ActivityLog

# area, readable noun, fields that matter to the owner
TRACKED = {
    "purchases.Purchase": ("sales", "sale invoice", "reference_no customer_name total_amount is_draft is_cancelled cancellation_reason is_paid due_date purchase_date"),
    "purchases.PurchaseItem": ("sales", "sale item", "quantity unit_price gst_rate tax_amount discount_amount line_total"),
    "purchases.PurchasePayment": ("payments", "payment", "amount payment_date next_due_date notes"),
    "invoicing.PurchaseInvoice": ("purchases", "purchase invoice", "invoice_number invoice_date grand_total remarks"),
    "invoicing.PurchaseInvoiceItem": ("purchases", "purchase item", "quantity purchase_price gst_rate tax discount line_total batch_number expiry_date"),
    "catalog.Category": ("tax", "category", "name sale_tax_ids"),
    "settings.Tax": ("tax", "tax rate", "key value"),
    "products.Product": ("products", "product", "name sku category_id actual_price purchase_price sale_price mrp gst_rate"),
    "customers.Customer": ("customers", "customer", "name company_name mobile email gst_number address shipping_address"),
    "catalog.Vendor": ("purchases", "vendor", "name"),
    "catalog.Unit": ("products", "unit", "name short_name"),
    "catalog.Brand": ("products", "brand", "name"),
    "catalog.Manufacturer": ("products", "manufacturer", "name"),
    "catalog.PaymentType": ("payments", "payment method", "name"),
    "settings.InvoiceSetting": ("settings", "invoice settings", "year prefix suffix counter end_counter terms_conditions qr_image"),
    "purchases.SaleDueSetting": ("settings", "payment due settings", "default_due_days_after_sale"),
    "settings.WhatsAppMessageSetting": ("settings", "payment reminder settings", "first_message_after_days repeat_every_days"),
    "settings.ProductBarcode": ("products", "barcode", "value model_label"),
    "business_users.BusinessUser": ("team", "team member", "role_id allowed_tabs"),
    "roles.Role": ("team", "team role", "role_name allowed_tabs"),
    "businesses.Business": ("business", "business profile", "business_name gst_number address phone email"),
    "inventory.StockMovement": ("stock", "stock movement", "quantity balance_quantity"),
    "expenses.Expense": ("expenses", "expense", "amount expense_date payment_mode description"),
    "expenses.ExpenseCategory": ("expenses", "expense category", "category_name"),
}
LABELS = {
    "sale_tax_ids": "GST", "gst_rate": "GST rate", "value": "Rate (%)",
    "unit_price": "Price per item", "purchase_price": "Cost per item",
    "actual_price": "Cost before tax", "sale_price": "Selling price", "mrp": "MRP",
    "tax_amount": "Tax amount", "tax": "Tax amount", "quantity": "Quantity",
    "line_total": "Item total", "total_amount": "Invoice total", "grand_total": "Invoice total",
    "reference_no": "Invoice number", "is_draft": "Draft", "is_cancelled": "Cancelled",
    "is_paid": "Fully paid", "is_active": "Active", "due_date": "Payment due date",
    "category_id": "Category", "role_id": "Role", "allowed_tabs": "Page access",
    "qr_image": "Payment QR image", "terms_conditions": "Invoice terms",
}


def snapshot(instance):
    config = TRACKED[instance._meta.label]
    fields = config[2].split() + ["is_active", "is_deleted"]
    return {key: getattr(instance, key) for key in fields if hasattr(instance, key)}


def remember(sender, instance, raw=False, using="default", **kwargs):
    if raw:
        return
    old = sender._base_manager.using(using).filter(pk=instance.pk).first() if instance.pk else None
    instance._activity_before = snapshot(old) if old else None


def readable(key, value, using):
    if value is None or value == "":
        return "Not set"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if key == "sale_tax_ids":
        if not value:
            return "No tax"
        Tax = apps.get_model("settings", "Tax")
        rows = Tax._base_manager.using(using).filter(pk__in=value)
        return ", ".join(f"{tax.value}%" for tax in rows) or "Removed tax"
    if key in ("category_id", "role_id"):
        model = apps.get_model("catalog", "Category") if key == "category_id" else apps.get_model("roles", "Role")
        record = model._base_manager.using(using).filter(pk=value).first()
        return str(record) if record else "Removed"
    if key == "allowed_tabs":
        from apps.business_users.constants import BUSINESS_TAB_DEFINITIONS
        names = {tab["code"]: tab["label"] for tab in BUSINESS_TAB_DEFINITIONS}
        return ", ".join(names.get(tab, tab.replace("-", " ").title()) for tab in value) or "No pages"
    if key == "qr_image":
        return "Uploaded" if value else "Not set"
    if key == "gst_rate":
        return f"{value}%"
    return str(value)


def record_change(sender, instance, created, raw=False, using="default", **kwargs):
    if raw:
        return
    area, noun, _fields = TRACKED[sender._meta.label]
    before = getattr(instance, "_activity_before", None)
    # Read persisted values so partial saves and database expressions are accurate.
    instance = sender._base_manager.using(using).get(pk=instance.pk)
    after = snapshot(instance)
    business_id = getattr(instance, "business_id", None)
    label = next((str(getattr(instance, field)) for field in
                  ("reference_no", "invoice_number", "name", "key", "business_name", "role_name", "category_name", "value")
                  if getattr(instance, field, None)), "")
    if sender._meta.label == "businesses.Business":
        business_id = instance.pk
    if hasattr(instance, "purchase_id"):
        parent = instance.purchase
        business_id = parent.business_id
        label = parent.reference_no or f"#{parent.pk}"
    if hasattr(instance, "purchase_invoice_id"):
        parent = instance.purchase_invoice
        business_id = parent.business_id
        label = parent.invoice_number or f"#{parent.pk}"
    if hasattr(instance, "product_id") and instance.product_id:
        label = f"{instance.product.name}" + (f" on invoice {label}" if label and (hasattr(instance, "purchase_id") or hasattr(instance, "purchase_invoice_id")) else (f" ({label})" if label else ""))
    if sender._meta.label == "business_users.BusinessUser":
        label = instance.user.full_name
    if not business_id:
        return  # Global roles are not business activity.
    changed = {key: {"before": readable(key, before.get(key), using), "after": readable(key, value, using)}
               for key, value in after.items() if before is not None and value != before.get(key)}
    if not created and not changed:
        return
    action = "created" if created else "updated"
    verb = "Created" if created else "Updated"
    if before and not before.get("is_deleted") and after.get("is_deleted"):
        action, verb = "removed", "Removed"
    elif before and before.get("is_deleted") and not after.get("is_deleted"):
        action, verb = "restored", "Restored"
    elif "is_cancelled" in changed and after.get("is_cancelled"):
        action, verb = "cancelled", "Cancelled"
    elif "is_draft" in changed and not after.get("is_draft"):
        action, verb = "finalized", "Finalized"
    subject = f'{noun} "{label}"' if label else noun
    description = f"{verb} {subject}."
    if created and sender._meta.label == "inventory.StockMovement":
        direction = "Added" if instance.movement_type == "in" else "Removed"
        description = f"{direction} {instance.quantity} units of {instance.product.name} {'to' if direction == 'Added' else 'from'} stock."
        if instance.reference_type == "opening_stock":
            description += " Opening stock recorded."
        elif instance.reference_type == "purchase_invoice":
            invoice = apps.get_model("invoicing", "PurchaseInvoice")._base_manager.using(using).filter(pk=instance.reference_id).first()
            if invoice:
                description += f" Purchase invoice {invoice.invoice_number}."
        elif instance.reference_type == "customer_sale":
            item = apps.get_model("purchases", "PurchaseItem")._base_manager.using(using).select_related("purchase").filter(pk=instance.reference_id).first()
            if item:
                description += f" Sale invoice {item.purchase.reference_no or item.purchase_id}."
    elif created and sender._meta.label == "purchases.PurchasePayment":
        description = f"Recorded a payment of ?{instance.amount} for sale invoice {label}."
    elif "sale_tax_ids" in changed and action == "updated":
        rates = changed["sale_tax_ids"]
        description = f'Changed GST for {label} from {rates["before"]} to {rates["after"]}.'
    elif "value" in changed and sender._meta.label == "settings.Tax":
        rates = changed["value"]
        description = f'Changed tax rate {label} from {rates["before"]}% to {rates["after"]}%.'
    renamed_product = sender._meta.label == "products.Product" and action == "updated" and "name" in changed
    if renamed_product:
        names = changed["name"]
        description = f'Renamed product from "{names["before"]}" to "{names["after"]}".'
    details = []
    for key, change in changed.items():
        if key in ("is_deleted", "sale_tax_ids") or (renamed_product and key == "name"):
            continue
        title = LABELS.get(key, key.replace("_", " ").capitalize())
        if key in ("terms_conditions", "qr_image"):
            details.append(f"{title} updated")
        else:
            details.append(f'{title}: {change["before"]} to {change["after"]}')
    if created:
        for key in ("quantity", "gst_rate", "tax_amount", "tax", "line_total", "total_amount", "grand_total"):
            if key in after:
                details.append(f'{LABELS.get(key, key)}: {readable(key, after[key], using)}')
    if details:
        description += " " + "; ".join(details) + "."
    actor = get_current_user()
    ActivityLog.objects.using(using).create(
        business_id=business_id, actor_id=actor.pk if actor else None,
        actor_name=actor.full_name if actor else "System", area=area, action=action,
        description=description, record_type=sender._meta.label, record_id=instance.pk,
        changes={LABELS.get(key, key.replace("_", " ").capitalize()): value for key, value in changed.items()
                 if key not in ("terms_conditions", "qr_image", "is_deleted")},
    )


def connect_signals():
    for label in TRACKED:
        model = apps.get_model(label)
        pre_save.connect(remember, sender=model, dispatch_uid=f"activity-before-{label}")
        post_save.connect(record_change, sender=model, dispatch_uid=f"activity-after-{label}")
