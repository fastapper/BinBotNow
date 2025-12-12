# app/backend/routes/profitability.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta

from app.core.db import get_session
from app.core.models import Position, Trade
from app.core.equity import get_stats, get_token_stats

router = APIRouter()

@router.get("/profitability/{symbol}")
async def profitability_by_symbol(symbol: str, days: int = 30, session: AsyncSession = Depends(get_session)):
    """
    Devuelve la rentabilidad realizada (PnL) de un token en los últimos X días.
    """
    cutoff = datetime.utcnow() - timedelta(days=days)

    # Buscar posiciones cerradas del símbolo en el rango de fechas
    rows = (await session.execute(
        select(Position).where(
            Position.symbol == symbol,
            Position.status == "CLOSED",
            Position.closed_at >= cutoff
        )
    )).scalars().all()

    total_pnl = 0.0
    trade_count = 0

    for p in rows:
        # Buscar trades de entrada y salida
        t_first = (await session.execute(
            select(Trade).where(Trade.position_id == p.id).order_by(Trade.created_at.asc())
        )).scalars().first()
        t_last = (await session.execute(
            select(Trade).where(Trade.position_id == p.id).order_by(Trade.created_at.desc())
        )).scalars().first()

        entry = t_first.price if t_first else p.entry_price
        exitp = t_last.price if t_last else p.entry_price
        qty = p.qty or 0.0
        pnl = (exitp - entry) * qty

        total_pnl += pnl
        trade_count += 1

    return {
        "symbol": symbol,
        "days": days,
        "pnl_usdt": total_pnl,
        "trades_count": trade_count
    }

# 🚀 Nuevo: Indicadores globales
@router.get("/stats")
async def stats(session: AsyncSession = Depends(get_session)):
    """
    Devuelve indicadores globales:
    - WinRate últimos 30 días, 24h, 1h
    - Últimas 5 operaciones cerradas
    """
    return await get_stats(session)

# 🚀 Nuevo: Indicadores por token
@router.get("/stats/{symbol}")
async def token_stats(symbol: str, session: AsyncSession = Depends(get_session)):
    """
    Devuelve métricas por token:
    - Acc.Profit (últimos 30 días)
    - N.Real.PL (posiciones abiertas)
    - Nr Open (cantidad de operaciones abiertas)
    - $$ Inv (inversión actual en USDT)
    """
    return await get_token_stats(session, symbol)

# 🚀 Nuevo: Closed Positions
@router.get("/closed_positions")
async def closed_positions(session: AsyncSession = Depends(get_session)):
    """
    Devuelve lista de posiciones cerradas
    """
    result = await session.execute(select(Position).where(Position.status == "CLOSED"))
    return result.scalars().all()
