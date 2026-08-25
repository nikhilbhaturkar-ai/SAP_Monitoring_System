from app.adapters.ticketing.base import TicketingClient
from app.adapters.ticketing.mock import MockTicketingClient
from app.config import settings

_instance: TicketingClient | None = None


def get_ticketing_client() -> TicketingClient:
    global _instance
    if _instance is not None:
        return _instance

    impl = settings.TICKETING_CLIENT_IMPL
    if impl == "mock":
        _instance = MockTicketingClient()
    elif impl == "real":
        raise NotImplementedError(
            "RealTicketingClient is not implemented yet. Implement "
            "app.adapters.ticketing.real.RealTicketingClient and wire it here to connect to a "
            "live ServiceNow instance."
        )
    else:
        raise ValueError(f"Unknown TICKETING_CLIENT_IMPL: {impl}")
    return _instance
