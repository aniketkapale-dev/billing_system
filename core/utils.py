"""
Small shared helpers.
"""


def build_absolute_uri(request, file_field):
    """Returns an absolute URL for a FileField/ImageField or None."""
    if not file_field:
        return None
    url = file_field.url
    if request is not None:
        return request.build_absolute_uri(url)
    return url


def str_to_bool(value, default=False):
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return str(value).strip().lower() in ("1", "true", "yes", "on")
