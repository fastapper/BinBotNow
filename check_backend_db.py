import asyncio
from sqlalchemy import text
from app.core.db import engine   # usa el mismo engine del backend

async def main():
    print("📌 Usando DB:", engine.url)

    async with engine.begin() as conn:
        # Listar tablas
        tables = await conn.execute(text(
            "SELECT name FROM sqlite_master WHERE type='table';"
        ))
        print("\n📋 Tablas en la base de datos:")
        for row in tables.fetchall():
            print(" -", row[0])

        # Verificar columnas de trading_config
        cols = await conn.execute(text("PRAGMA table_info(trading_config);"))
        cols = cols.fetchall()
        print("\n🔍 Columnas de trading_config:")
        if not cols:
            print("⚠️ La tabla trading_config no existe")
        else:
            for col in cols:
                print(f" - {col[1]} ({col[2]})")

asyncio.run(main())
