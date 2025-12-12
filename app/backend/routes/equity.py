# app/backend/routes/equity.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.db import get_session
from app.core.equity import calculate_equity
from sqlalchemy import select
from app.core.models import EquitySnapshot

router = APIRouter()

@router.get("/equity/history")
async def equity_history(range: str = "30d", session: AsyncSession = Depends(get_session)):
    """
    Devuelve el histórico de equity desde la DB.
    """
    rows = (
        await session.execute(
            select(EquitySnapshot).order_by(EquitySnapshot.ts.desc()).limit(500)
        )
    ).scalars().all()

    return [
        {
            "ts": r.ts.isoformat(),
            "free": r.free_usdt,
            "invested": r.invested_usdt,
            "total": r.total_usdt,
        }
        for r in rows[::-1]  # más antiguo primero
    ]