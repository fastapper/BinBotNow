import asyncio
import logging
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from datetime import datetime
from app.core.config import settings

logging.basicConfig(level=logging.INFO)

async def migrate():
    engine = create_async_engine(settings.DB_URL, echo=False, future=True)

    async with engine.begin() as conn:
        # 1. Verificar columnas actuales
        result = await conn.execute(text("PRAGMA table_info(equity_snapshots);"))
        columns = [row[1] for row in result.fetchall()]
        logging.info(f"Columnas actuales: {columns}")

        # 2. Si falta created_at → la agregamos
        if "created_at" not in columns:
            logging.info("⏳ Columna 'created_at' no encontrada, creando...")

            # Crear columna sin default
            await conn.execute(
                text("ALTER TABLE equity_snapshots ADD COLUMN created_at TIMESTAMP;")
            )

            # Rellenar con el valor de ts (si existe) o la fecha actual
            await conn.execute(
                text("UPDATE equity_snapshots SET created_at = COALESCE(ts, :now)")
                .bindparams(now=datetime.utcnow().isoformat())
            )

            logging.info("✅ Columna 'created_at' agregada y rellenada correctamente.")
        else:
            logging.info("✅ La columna 'created_at' ya existe, no se hicieron cambios.")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(migrate())
