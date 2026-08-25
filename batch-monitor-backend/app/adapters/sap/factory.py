from app.adapters.sap.base import SAPClient
from app.adapters.sap.mock import MockSAPClient
from app.config import settings

_instance: SAPClient | None = None


def get_sap_client() -> SAPClient:
    global _instance
    if _instance is not None:
        return _instance

    impl = settings.SAP_CLIENT_IMPL
    if impl == "mock":
        _instance = MockSAPClient()
    elif impl == "real":
        raise NotImplementedError(
            "RealSAPClient is not implemented yet. Implement app.adapters.sap.real.RealSAPClient "
            "and wire it here to connect to a live SAP system."
        )
    else:
        raise ValueError(f"Unknown SAP_CLIENT_IMPL: {impl}")
    return _instance
