from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ======================
    # Database
    # ======================
    DB_URL: str = "sqlite+aiosqlite:///./db.sqlite3"
    DB_FILE: str = "db.sqlite3"   # 👈 usado por scripts/check_db.py y reset_db.py

    # ======================
    # Binance API
    # ======================
    BINANCE_API_KEY: str | None = None
    BINANCE_API_SECRET: str | None = None
    BINANCE_TESTNET: bool = False
    BINANCE_BASE_URL: str = "https://api.binance.com"

    # ======================
    # Otros ajustes (si los necesitas después)
    # ======================
    ENV: str = "prod"
    TRADE_TYPE: str = "SPOT"

    class Config:
        env_file = ".env"
        env_prefix = ""   # sin prefijo, usa los nombres tal cual
        case_sensitive = False


# instancia global
settings = Settings()
