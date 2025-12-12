from binance.spot import Spot
from app.core.config import settings

def get_spot() -> Spot:
    """
    Devuelve un cliente Spot de Binance, conectado a Testnet o Mainnet 
    según configuración.
    """
    return Spot(
        api_key=settings.BINANCE_API_KEY,
        api_secret=settings.BINANCE_API_SECRET,
        base_url=settings.BINANCE_BASE_URL if settings.BINANCE_TESTNET else None
    )

# Cliente global (opcional)
c = get_spot()
