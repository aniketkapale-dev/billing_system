from decimal import Decimal


def gst_rate_for_tax_ids(tax_ids):
    """Percent in effect for these tax ids right now. Callers must store the result."""
    ids = []
    for tax_id in tax_ids or []:
        try:
            ids.append(int(tax_id))
        except (TypeError, ValueError):
            continue
        if ids:
            break
    if not ids:
        return Decimal("0.00")

    from apps.settings.models import Tax

    tax = Tax.objects.filter(pk=ids[0], is_deleted=False).only("value").first()
    if not tax:
        return Decimal("0.00")
    return Decimal(tax.value or 0).quantize(Decimal("0.01"))
