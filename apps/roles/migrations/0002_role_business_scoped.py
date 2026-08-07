import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("businesses", "0003_business_profile_fields"),
        ("roles", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="role",
            name="role_name",
            field=models.CharField(max_length=100),
        ),
        migrations.AddField(
            model_name="role",
            name="business",
            field=models.ForeignKey(
                blank=True,
                db_column="business_id",
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="roles",
                to="businesses.business",
            ),
        ),
        migrations.AddConstraint(
            model_name="role",
            constraint=models.UniqueConstraint(
                condition=models.Q(("business__isnull", False), ("is_deleted", False)),
                fields=("business", "role_name"),
                name="uniq_active_business_role_name",
            ),
        ),
        migrations.AddConstraint(
            model_name="role",
            constraint=models.UniqueConstraint(
                condition=models.Q(("business__isnull", True), ("is_deleted", False)),
                fields=("role_name",),
                name="uniq_active_global_role_name",
            ),
        ),
    ]
