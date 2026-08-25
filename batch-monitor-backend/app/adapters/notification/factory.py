from app.adapters.notification.base import NotificationClient
from app.adapters.notification.mock import MockNotificationClient
from app.config import settings

_instance: NotificationClient | None = None


def get_notification_client() -> NotificationClient:
    global _instance
    if _instance is not None:
        return _instance

    impl = settings.NOTIFICATION_CLIENT_IMPL
    if impl == "mock":
        _instance = MockNotificationClient()
    elif impl == "real":
        raise NotImplementedError(
            "RealNotificationClient is not implemented yet. Implement "
            "app.adapters.notification.real.RealNotificationClient and wire it here to connect "
            "to a live Slack/Teams/email service."
        )
    else:
        raise ValueError(f"Unknown NOTIFICATION_CLIENT_IMPL: {impl}")
    return _instance
