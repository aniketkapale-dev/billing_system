from django.db import models


class ActivityLog(models.Model):
    business = models.ForeignKey("businesses.Business", on_delete=models.CASCADE, related_name="activity_logs")
    occurred_at = models.DateTimeField(auto_now_add=True)
    actor_id = models.BigIntegerField(null=True)
    actor_name = models.CharField(max_length=255)
    area = models.CharField(max_length=32)
    action = models.CharField(max_length=20)
    description = models.TextField()
    record_type = models.CharField(max_length=80)
    record_id = models.BigIntegerField()
    changes = models.JSONField(default=dict)

    class Meta:
        db_table = "business_activity_logs"
        ordering = ("-occurred_at", "-id")
        indexes = [
            models.Index(fields=["business", "-occurred_at"], name="activity_business_date_idx"),
            models.Index(fields=["business", "area", "-occurred_at"], name="activity_business_area_idx"),
        ]
