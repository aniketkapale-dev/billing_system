from django.db import models


class PreferredContactMode(models.IntegerChoices):
    EMAIL = 1, "Email"
    PHONE = 2, "Phone Number"
    BOTH = 3, "Email or Phone Number"