from django.apps import AppConfig


class ActivityLogConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.activity_log"

    def ready(self):
        from .signals import connect_signals
        connect_signals()
