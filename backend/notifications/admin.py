from django.contrib import admin

from .models import Notification, NotificationRecipient


admin.site.register([Notification, NotificationRecipient])
