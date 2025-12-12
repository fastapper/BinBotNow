# app/backend/schemas.py
from pydantic import BaseModel
from typing import Optional, List
from decimal import Decimal
from datetime import datetime

class PairSignal(BaseModel):
    symbol: str
    price: Decimal
    rsi: Optional[float] = None
    macd: Optional[float] = None
    ema: Optional[float] = None
    ml: Optional[float] = None
    flag: Optional[str] = None  # BUY/SELL/HOLD

class PositionDTO(BaseModel):
    id: int
    symbol: str
    qty: Decimal
    entry_price: Decimal
    last_price: Decimal
    sl_price: Optional[Decimal]
    tp_price: Optional[Decimal]
    pnl_unrealized_usdt: Decimal
    pnl_unrealized_pct: float
    created_at: datetime
    oco_stop_id: Optional[str] = None
    oco_tp_id: Optional[str] = None

class ClosedOrderDTO(BaseModel):
    id: int
    symbol: str
    side: str
    qty: Decimal
    price: Decimal
    ts: datetime
    commission_usdt: Optional[Decimal] = None
    realized_pnl_usdt: Optional[Decimal] = None

class MetricsDTO(BaseModel):
    balance_usdt: Decimal
    invested_usdt: Decimal
    pnl_realized_usdt: Decimal
    pnl_unrealized_usdt: Decimal
    free_usdt: Decimal
    perf_24h_pct: float
    perf_7d_pct: float
    perf_30d_pct: float

class EquityPoint(BaseModel):
    ts: datetime
    equity_usdt: Decimal
