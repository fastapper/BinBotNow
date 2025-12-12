# app/backend/main.py

from app.core.diagnostic_logger import setup_diagnostic_logger
# ✅ Setup de logger uniforme

setup_diagnostic_logger()

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.backend.routes import equity
from app.backend.routes import profitability
from app.core import router_bot  # 👈 import nuevo
from app.core.binance_client import get_spot
from app.core.data_preparator import prepare_ohlcv_csv, DataPreparatorAPI
from app.core.db import engine, Base
from app.core.db import SessionLocal
from app.core.order_service import open_market_quote, close_position_market
# from app.core.scheduler import start_scheduler
from app.core.smart_trading_api import SmartTradingAPI, load_manifest, GoldenRules, smart_train_and_export
from app.ws import router as ws_router
from app.ws.router import register_cache_preloader
from app.ws.binance_stream import launch_all


from app.core.smart_trading_api import (GoldenRules, smart_train_and_export, load_manifest, load_xgb_model, add_indicators, ensure_features, apply_dsl_rules, predict_signal_from_model)

from datetime import datetime, timedelta
from multiprocessing import Manager

from ..core.config import settings
from ..core.db import Base
from ..core.models import Position, Trade, EquitySnapshot, DecisionLog,TradingConfig
from ..core.migrate import run_sqlite_migrations
from ..core.binance_client import get_spot
from ..core.db import engine, get_session
from ..core.indicators import ema, rsi, macd

from binance.error import ClientError

from fastapi import FastAPI, Depends, Query, Body, APIRouter, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse 
from fastapi import File, UploadFile
from fastapi import WebSocket, WebSocketDisconnect
from functools import lru_cache


from starlette.websockets import WebSocketState
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import Column, Integer, String, Float, JSON, func, select, update
from sqlalchemy.orm import Session  # 👈 AÑADIDO AQUÍ
from typing import Dict, List
from typing import Optional
from pydantic import BaseModel
from datetime import datetime

import pandas as pd
import xgboost as xgb
import numpy as np
import uuid
import json, asyncio
import os, traceback
import math
import logging
import sys
import uvicorn


# ============================================================
# ✅ Instancia principal de FastAPI
# ============================================================
app = FastAPI(title=settings.APP_NAME)

# ============================================================
# 🚀 CORS: habilitar acceso desde frontend local (Vite/React)
# ============================================================
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "*",  # 👈 agregado para permitir otros orígenes locales
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# 🔌 Registro de routers (sin duplicados)
# ============================================================
app.include_router(profitability.router, prefix="/profitability")
app.include_router(router_bot.router)
app.include_router(ws_router)
app.include_router(equity.router)

logger = logging.getLogger(__name__)
logger.info("✅ Routers registrados correctamente (profitability, bot, WS)")

# ============================================================
# 🧠 Registro del precache automático de equity history
# ============================================================
register_cache_preloader(app)

# ============================================================
# ⚙️ Configuración global / variables
# ============================================================
router = APIRouter()
api = SmartTradingAPI()
dp = DataPreparatorAPI()
smart = SmartTradingAPI()
scheduler = AsyncIOScheduler()
trading_configs: dict[str, dict] = {}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
    datefmt="%H:%M:%S",
)

PREFERRED = [
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "ADAUSDT", "XRPUSDT",
    "SOLUSDT", "DOGEUSDT", "DOTUSDT", "MATICUSDT", "LTCUSDT"
]

# Estado global en memoria
jobs = {}


class ActivateFormulaPayload(BaseModel):
    symbol: str
    strategy_name: str
    formula: dict

class FormulaPayload(BaseModel):
    accuracy: Optional[float] = None
    profit: Optional[float] = None
    formula_human: Optional[str] = None

class ActivatePayload(BaseModel):
    symbol: str
    strategy_name: str
    formula: FormulaPayload

async def get_open_positions(session: AsyncSession):
    """Obtiene todas las posiciones abiertas en la base de datos."""
    result = await session.execute(
        select(Position).where(Position.status == "OPEN")
    )
    return result.scalars().all()


async def close_position_obj(session: AsyncSession, pos: Position):
    """Cierra una posición abierta en el exchange y la marca como cerrada."""
    c = get_spot()
    try:
        side = "SELL" if pos.side == "BUY" else "BUY"

        precision = get_symbol_precision(pos.symbol)
        qty = round(float(pos.qty), precision)
        if qty <= 0:
            logger.error(f"[close_position_obj] ❌ Cantidad 0 para {pos.symbol}")
            return

        order = c.new_order(
            symbol=pos.symbol,
            side=side,
            type="MARKET",
            quantity=qty
        )
        logger.info(f"[close_position_obj] ✅ Cerrada {pos.symbol}: qty={qty}, side={side}")

        pos.status = "CLOSED"
        pos.closed_at = datetime.utcnow()
        await session.commit()

    except Exception as e:
        await session.rollback()
        logger.error(f"[close_position_obj] ⚠️ Error cerrando {pos.symbol}: {e}")


async def sync_positions_with_binance(session: AsyncSession):
    """Sincroniza las posiciones locales con Binance (actualiza status y qty)."""
    c = get_spot()
    try:
        # 1️⃣ Traer balances y posiciones abiertas desde Binance
        account_info = c.account()
        balances = {b["asset"]: float(b["free"]) + float(b["locked"]) for b in account_info["balances"]}
        open_orders = c.get_open_orders()  # si tu API wrapper lo soporta

        # 2️⃣ Buscar todas las posiciones locales abiertas
        result = await session.execute(select(Position).where(Position.status == "OPEN"))
        open_positions = result.scalars().all()

        for pos in open_positions:
            symbol = pos.symbol
            base_asset = symbol.replace("USDT", "")  # asumiendo pares tipo XXXUSDT
            balance = balances.get(base_asset, 0.0)

            # Verificar si Binance ya no tiene posición o balance
            if balance <= 0:
                logger.info(f"[sync] Cerrando localmente {symbol} (balance {balance})")
                pos.status = "CLOSED"
                pos.qty = 0.0
                pos.closed_at = datetime.utcnow()

        await session.commit()
        logger.info(f"[sync] 🔁 Sincronización completa ({len(open_positions)} posiciones revisadas).")

    except Exception as e:
        await session.rollback()
        logger.error(f"[sync] ⚠️ Error durante sincronización: {e}")


# ------------------------------------------
# ✅ Ajuste de cantidad según LOT_SIZE Binance
# ------------------------------------------
def adjust_quantity_from_info(symbol: str, qty: float, exchange_info: dict) -> float:
    """Ajusta la cantidad (qty) según el filtro LOT_SIZE del símbolo."""
    try:
        symbol_info = next((s for s in exchange_info["symbols"] if s["symbol"] == symbol), None)
        if not symbol_info:
            return round(qty, 6)

        lot_filter = next((f for f in symbol_info["filters"] if f["filterType"] == "LOT_SIZE"), None)
        if not lot_filter:
            return round(qty, 6)

        step_size = float(lot_filter["stepSize"])
        precision = abs(int(round(-math.log10(step_size)))) if step_size < 1 else 0
        adj_qty = math.floor(qty / step_size) * step_size
        return round(adj_qty, precision)
    except Exception as e:
        logger.error(f"[adjust_quantity_from_info] ⚠️ Error ajustando {symbol}: {e}")
        return round(qty, 6)



# ------------------------------------------
# ✅ Cierre total de todas las posiciones
# ------------------------------------------
async def close_all_open_positions(session: AsyncSession):
    """
    Cierra todas las posiciones abiertas en Binance y en la base local.
    - Cancela órdenes pendientes
    - Envía orden MARKET inversa
    - Verifica que el balance sea cero
    - Sincroniza posiciones al final
    """
    c = get_spot()
    closed_symbols = []

    try:
        # Cachear info de símbolos para evitar llamadas repetidas
        exchange_info = c.exchange_info()

        # Obtener posiciones abiertas
        result = await session.execute(select(Position).where(Position.status == "OPEN"))
        open_positions = result.scalars().all()

        if not open_positions:
            logger.info("[close_all_open_positions] No hay posiciones abiertas.")
            return {"closed": [], "count": 0}

        logger.info(f"[close_all_open_positions] 🔍 Cerrando {len(open_positions)} posiciones abiertas...")

        # Recorremos posiciones abiertas
        for pos in open_positions:
            try:
                symbol = pos.symbol.upper()
                side = pos.side
                qty = float(pos.qty)

                if qty <= 0:
                    continue

                opposite = "SELL" if side == "BUY" else "BUY"

                # 1️⃣ Cancelar órdenes pendientes
                try:
                    c.cancel_open_orders(symbol)
                    logger.info(f"[close_all_open_positions] 🧹 Órdenes pendientes canceladas para {symbol}")
                except Exception as e:
                    if "-2011" in str(e) or "Unknown order" in str(e):
                       # No hay órdenes abiertas, ignorar
                       logger.info(f"[close_all_open_positions] ℹ️ Sin órdenes pendientes para {symbol}")
                    else:
                       logger.error(f"[close_all_open_positions] ⚠️ Error cancelando órdenes en {symbol}: {e}")


                # 2️⃣ Ajustar cantidad según LOT_SIZE
                adj_qty = adjust_quantity_from_info(symbol, qty, exchange_info)
                if adj_qty <= 0:
                    logger.error(f"[close_all_open_positions] ⚠️ Cantidad ajustada inválida ({adj_qty}) para {symbol}, saltando...")
                    continue

                # 3️⃣ Enviar orden de cierre
                try:
                    order = c.new_order(symbol=symbol, side=opposite, type="MARKET", quantity=adj_qty)
                    logger.info(f"[close_all_open_positions] ✅ Orden de cierre enviada para {symbol} ({adj_qty})")
                except Exception as e:
                    logger.error(f"[close_all_open_positions] ❌ Error al cerrar {symbol}: {e}")
                    continue

                # 4️⃣ Esperar confirmación
                await asyncio.sleep(1.5)

                # 5️⃣ Verificar balances post-cierre
                try:
                    account_info = c.account()
                    balances = {
                        b["asset"]: float(b["free"]) + float(b["locked"])
                        for b in account_info["balances"]
                    }
                    base_asset = symbol.replace("USDT", "")
                    balance = balances.get(base_asset, 0.0)

                    if balance <= 0.0001:
                        pos.status = "CLOSED"
                        pos.closed_at = datetime.utcnow()
                        pos.qty = 0.0
                        closed_symbols.append(symbol)
                        logger.info(f"[close_all_open_positions] ✅ Confirmado cerrado {symbol} (balance={balance})")
                    else:
                        logger.error(f"[close_all_open_positions] ⚠️ Balance residual en {symbol}: {balance}")
                except Exception as e:
                    logger.error(f"[close_all_open_positions] ⚠️ No se pudo verificar balance de {symbol}: {e}")

            except Exception as e:
                logger.error(f"[close_all_open_positions] ❌ Error en {getattr(pos, 'symbol', '?')}: {e}")

        # 6️⃣ Commit local
        await session.commit()

        # 7️⃣ Sincronizar con Binance
        try:
            await sync_positions_with_binance(session)
            logger.info("[close_all_open_positions] 🔄 Sincronización completada post-cierre.")
        except Exception as e:
            logger.error(f"[close_all_open_positions] ⚠️ Error en sincronización final: {e}")

        logger.info(f"✅ Todas las posiciones cerradas: {closed_symbols}")
        return {"closed": closed_symbols, "count": len(closed_symbols)}

    except Exception as e:
        await session.rollback()
        logger.error(f"[close_all_open_positions] ❌ Error general: {e}")
        raise

# =============================================================
# 🧹 LIMPIEZA DE POSICIONES FANTASMA
# =============================================================

async def clean_local_positions(session: AsyncSession):
    """
    Limpia posiciones inconsistentes (qty=0 o sin balance real en Binance).
    """
    c = get_spot()
    cleaned = []
    try:
        account = c.account()
        balances = {
            b["asset"]: float(b["free"]) + float(b["locked"])
            for b in account.get("balances", [])
        }

        result = await session.execute(select(Position).where(Position.status == "OPEN"))
        positions = result.scalars().all()

        for p in positions:
            base = p.symbol.replace("USDT", "")
            balance = balances.get(base, 0.0)

            # Condiciones de cierre local
            if p.qty <= 0 or balance <= 0.0001 or (p.method or "").upper().startswith("BINANCE_SYNC"):
                logger.info(f"[clean_local_positions] 🧹 Corrigiendo {p.symbol} (qty={p.qty}, balance={balance}, method={p.method})")
                p.status = "CLOSED"
                p.qty = 0
                p.closed_at = datetime.utcnow()
                cleaned.append(p.symbol)

        await session.commit()
        logger.info(f"[clean_local_positions] ✅ Limpieza completada ({len(cleaned)} posiciones corregidas).")
        return {"cleaned": cleaned, "count": len(cleaned)}

    except Exception as e:
        await session.rollback()
        logger.error(f"[clean_local_positions] ❌ Error limpiando: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def calculate_equity(session: AsyncSession) -> dict:
    """
    Calcula equity total = saldo líquido USDT + valor de posiciones abiertas.
    """
    c = get_spot()
    info = c.account()

    usdt_free = usdt_locked = 0.0
    for b in info.get("balances", []):
        if b.get("asset") == "USDT":
            usdt_free = float(b.get("free", 0))
            usdt_locked = float(b.get("locked", 0))
            break
    balance_usdt = usdt_free + usdt_locked

    rows = (await session.execute(
        select(Position).where(Position.status == "OPEN")
    )).scalars().all()

    try:
        prices = {p["symbol"]: float(p["price"]) for p in c.ticker_price()}
    except Exception:
        prices = {}

    invested = 0.0
    for p in rows:
        last = prices.get(p.symbol, p.entry_price)
        invested += p.qty * last

    equity = balance_usdt + invested
    return {"balance_usdt": balance_usdt, "invested_usdt": invested, "equity": equity}


@lru_cache(maxsize=100)
def get_symbol_precision(symbol: str) -> int:
    c = get_spot()
    info = c.exchange_info(symbol=symbol)
    filters = info["symbols"][0]["filters"]
    lot_filter = next((f for f in filters if f["filterType"] == "LOT_SIZE"), None)
    if not lot_filter:
        return 3
    step_size = float(lot_filter["stepSize"])
    return abs(int(round(math.log10(step_size)))) if step_size < 1 else 0


@app.get("/health")
async def health_check():
    return {"status": "ok"}


# =====================================================
# NUEVO: Endpoints TradingConfig
# =====================================================
@app.post("/config/trading")
async def save_trading_config(cfg: dict, session: AsyncSession = Depends(get_session)):
    import json, traceback
    try:
        logger.info(">>> Recibido:", json.dumps(cfg, indent=2))

        if "symbol" not in cfg:
            raise HTTPException(status_code=400, detail="Missing symbol in config")

        result = await session.execute(
            select(TradingConfig).where(TradingConfig.symbol == cfg["symbol"])
        )
        existing = result.scalars().first()

        if existing:
            for k, v in cfg.items():
                if k == "smart_config":  # 🚀 guardamos bloque Smart en smart_config
                    existing.smart_config = v
                elif hasattr(existing, k):
                    setattr(existing, k, v)
        else:
            clean_cfg = {k: v for k, v in cfg.items() if hasattr(TradingConfig, k)}
           # smart_cfg = cfg.get("smart_config", {})
            clean_cfg["smart_config"] = cfg.get("smart_config", {})
            existing = TradingConfig(**clean_cfg)
            session.add(existing)

        await session.commit()
        return {"ok": True}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error saving config: {str(e)}")

@app.get("/config/trading")
async def get_trading_configs(session: AsyncSession = Depends(get_session)):
    try:
        result = await session.execute(select(TradingConfig))
        rows = result.scalars().all()

        out = []
        for r in rows:
            d = r.__dict__.copy()
            if "smart_config" in d:
                d["smart_config"] = d.pop("smart_config")  # 🚀 devolver como "smart"
            out.append(d)

        return out

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error fetching configs: {str(e)}")

# =============================
# Logs de decisiones del bot
# =============================
@app.get("/logs/decisions")
async def get_decision_logs(
    limit: int = Query(100, ge=10, le=1000),
    session: AsyncSession = Depends(get_session)
):
    """
    Devuelve las últimas decisiones tomadas por el bot (BUY/SELL/HOLD).
    """
    result = await session.execute(
        select(DecisionLog).order_by(DecisionLog.created_at.desc()).limit(limit)
    )
    rows = result.scalars().all()

    return [
        {
            "id": r.id,
            "symbol": r.symbol,
            "method": r.method,
            "signal": r.signal,
            "price": r.price,
            "params": r.params,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]

# -----------------------
# Equity unificado
# -----------------------
@app.get("/equity")
async def get_equity(
    days: int = Query(30, description="Cantidad de días a traer"),
    session: AsyncSession = Depends(get_session)
):
    q = await session.execute(
        select(EquitySnapshot)
        .order_by(EquitySnapshot.ts.desc())
        .limit(days * 24 * 12)
    )
    rows = q.scalars().all()

    results = []
    for r in rows:
        invested_usdt = max(r.equity - r.balance_usdt, 0.0)
        results.append({
            "ts": r.ts.isoformat(),
            "balance_usdt": float(r.balance_usdt),
            "invested_usdt": float(invested_usdt),
            "equity": float(r.equity),
        })
    return results


@app.get("/profitability")
async def profitability(session: AsyncSession = Depends(get_session)):
    snaps = (await session.execute(
        select(EquitySnapshot).order_by(EquitySnapshot.ts.asc())
    )).scalars().all()

    if not snaps:
        return {
            "latest_balance": 0.0, "latest_equity": 0.0,
            "pct": {}, "balance_change": {}, "projected_30d": {}
        }

    now = snaps[-1].ts
    latest = await calculate_equity(session)
    latest_equity = latest["equity"]
    latest_balance = latest["balance_usdt"]

    def pct_from(delta: timedelta):
        ref_snap = _closest_snapshot(snaps, now - delta)
        if ref_snap is None or ref_snap == 0:
            return 0.0
        return round((latest_equity - ref_snap) / ref_snap * 100.0, 2)

    pct_map = {
        "1h": pct_from(timedelta(hours=1)),
        "24h": pct_from(timedelta(hours=24)),
        "7d": pct_from(timedelta(days=7)),
        "30d": pct_from(timedelta(days=30)),
        "3m": pct_from(timedelta(days=90)),
        "6m": pct_from(timedelta(days=180)),
        "12m": pct_from(timedelta(days=365)),
    }

    balance_change = {
        "1h": latest_equity - (_closest_snapshot(snaps, now - timedelta(hours=1)) or latest_equity),
        "24h": latest_equity - (_closest_snapshot(snaps, now - timedelta(hours=24)) or latest_equity),
        "30d": latest_equity - (_closest_snapshot(snaps, now - timedelta(days=30)) or latest_equity),
    }

    def proj_30d_from_pct(pct: float, window: str) -> float:
        base = latest_equity
        r = pct / 100.0
        if window == "1h": days = 1/24
        elif window == "24h": days = 1
        elif window == "7d": days = 7
        elif window == "30d": days = 30
        elif window == "90d": days = 90
        else: days = 1
        return round(base * (1 + r * (30/days)), 2)

    projected_30d = {
        "based_on_1h": proj_30d_from_pct(pct_map["1h"], "1h"),
        "based_on_24h": proj_30d_from_pct(pct_map["24h"], "24h"),
        "based_on_7d": proj_30d_from_pct(pct_map["7d"], "7d"),
        "based_on_30d": proj_30d_from_pct(pct_map["30d"], "30d"),
        "based_on_90d": proj_30d_from_pct(pct_map["3m"], "90d"),
    }

    return {
        "latest_balance": latest_balance,
        "latest_equity": latest_equity,
        "pct": pct_map,
        "balance_change": balance_change,
        "projected_30d": projected_30d,
        "snapshots": [
            {"ts": s.ts.isoformat(), "equity": s.equity, "balance_usdt": s.balance_usdt}
            for s in snaps
        ]
    }



# -----------------------
# Selección de símbolos
# -----------------------
def pick_10_symbols_lazy() -> List[str]:
    if getattr(app.state, "symbols", None):
        return app.state.symbols

    try:
        c = get_spot()
        try:
            ex = c.exchange_info()
            all_usdt = [
                s["symbol"]
                for s in ex.get("symbols", [])
                if s.get("status") == "TRADING" and s.get("quoteAsset") == "USDT"
            ]
        except Exception:
            all_usdt = []

        chosen = [s for s in PREFERRED if s in all_usdt]
        for sym in sorted(all_usdt):
            if len(chosen) >= 10:
                break
            if sym not in chosen:
                chosen.append(sym)

        if not chosen:
            chosen = PREFERRED[:10]

        app.state.symbols = chosen[:10]
    except Exception:
        app.state.symbols = PREFERRED[:10]

    return app.state.symbols



@app.get("/status")
def status():
    syms = pick_10_symbols_lazy()
    return {
        "live": True,
        "env": "TESTNET" if settings.BINANCE_TESTNET else "REAL",
        "symbols": syms
    }


# -----------------------
# Balance de cuenta
# -----------------------
@app.get("/account/balance")
def account_balance():
    try:
        c = get_spot()
        info = c.account()

        usdt_free = usdt_locked = 0.0
        for b in info.get("balances", []):
            if b.get("asset") == "USDT":
                usdt_free = float(b.get("free", 0))
                usdt_locked = float(b.get("locked", 0))
                break

        return {
            "asset": "USDT",
            "balance": usdt_free + usdt_locked,
            "free": usdt_free,
            "locked": usdt_locked,
        }

    except Exception as e:
        # fallback: return empty balance
        return {
            "asset": "USDT",
            "balance": 0.0,
            "free": 0.0,
            "locked": 0.0,
            "error": str(e),  # opcional: útil para debug
        }



# -----------------------
# Tickers
# -----------------------
@app.get("/tickers")
def tickers():
    try:
        c = get_spot()
        prices = {p["symbol"]: float(p["price"]) for p in c.ticker_price()}
    except Exception as e:
        # Si Binance no responde, devolvemos precios None
        prices = {}

    return [
        {"symbol": s, "price": prices.get(s)}
        for s in pick_10_symbols_lazy()
    ]



# -----------------------
# Posiciones abiertas
# -----------------------
@app.get("/positions/open")
async def positions_open(session: AsyncSession = Depends(get_session)):
    rows = (
        await session.execute(select(Position).where(Position.status == "OPEN"))
    ).scalars().all()

    prices: Dict[str, float] = {}
    try:
        c = get_spot()
        prices = {p["symbol"]: float(p["price"]) for p in c.ticker_price()}
    except Exception as e:
        # Si no hay conexión a Binance, seguimos con entry_price
        prices = {}

    out = []
    for p in rows:
        last = prices.get(p.symbol, p.entry_price)
        pnl = (last - p.entry_price) * (p.qty if p.side == "BUY" else -p.qty)
        out.append({
            "id": p.id,
            "symbol": p.symbol,
            "qty": p.qty,
            "entry_price": p.entry_price,
            "last_price": last,
            "sl": p.sl,
            "tp": p.tp,
            "side": p.side,
            "pnl_usdt": pnl,
            "open_method": p.open_method,
            "status": p.status,
            "opened_at": p.opened_at,
            "closed_at": p.closed_at,
        })
    return out



@app.get("/positions/aggregate-by-symbol")
async def positions_aggregate_by_symbol(session: AsyncSession = Depends(get_session)):
    syms = pick_10_symbols_lazy()
    rows = (
        await session.execute(select(Position).where(Position.status == "OPEN"))
    ).scalars().all()

    prices: Dict[str, float] = {}
    try:
        c = get_spot()
        prices = {p["symbol"]: float(p["price"]) for p in c.ticker_price()}
    except Exception:
        prices = {}

    acc: Dict[str, Dict[str, float]] = {s: {"count": 0, "invested": 0.0, "pnl": 0.0} for s in syms}
    for p in rows:
        last = prices.get(p.symbol, p.entry_price)
        invested = p.qty * p.entry_price
        pnl = (last - p.entry_price) * p.qty if p.side == "BUY" else 0.0
        a = acc.setdefault(p.symbol, {"count": 0, "invested": 0.0, "pnl": 0.0})
        a["count"] += 1
        a["invested"] += invested
        a["pnl"] += pnl

    result = []
    for s in syms:
        a = acc.get(s, {"count": 0, "invested": 0.0, "pnl": 0.0})
        pct = (a["pnl"] / a["invested"] * 100.0) if a["invested"] > 0 else 0.0
        result.append({
            "symbol": s,
            "count": a["count"],
            "invested_usdt": a["invested"],
            "pnl_usdt": a["pnl"],
            "pnl_pct": pct,
        })
    return result


@app.get("/positions/pnl-by-token")
async def pnl_by_token(session: AsyncSession = Depends(get_session)):
    syms = pick_10_symbols_lazy()
    rows = (
        await session.execute(select(Position).where(Position.status == "OPEN"))
    ).scalars().all()

    prices: Dict[str, float] = {}
    try:
        c = get_spot()
        prices = {p["symbol"]: float(p["price"]) for p in c.ticker_price()}
    except Exception:
        prices = {}

    acc: Dict[str, float] = {s: 0.0 for s in syms}
    for p in rows:
        last = prices.get(p.symbol, p.entry_price)
        pnl = (last - p.entry_price) * (p.qty if p.side == "BUY" else -p.qty)
        if p.symbol in acc:
            acc[p.symbol] += pnl

    return [{"symbol": s, "pnl_usdt": acc.get(s, 0.0)} for s in syms]



@app.get("/trades/closed")
async def trades_closed(session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Position).where(Position.status=="CLOSED").order_by(Position.closed_at.desc()))).scalars().all()
    out = []
    for p in rows:
        t_first = (await session.execute(
            select(Trade).where(Trade.position_id==p.id).order_by(Trade.created_at.asc())
        )).scalars().first()
        t_last = (await session.execute(
            select(Trade).where(Trade.position_id==p.id).order_by(Trade.created_at.desc())
        )).scalars().first()
        entry = t_first.price if t_first else p.entry_price
        exitp = t_last.price if t_last else p.entry_price
        pnl = (exitp - entry) * p.qty
        fees = (t_first.fees if t_first else 0.0) + (t_last.fees if t_last else 0.0)
        out.append({
            "position_id": p.id, "symbol": p.symbol, "qty": p.qty,
            "entry_price": entry, "exit_price": exitp,
            "opened_at": p.opened_at, "closed_at": p.closed_at,
            "pnl_usdt": pnl, "fees_total": fees,
            "open_method": p.open_method, "close_method": p.close_method or ""
        })
    return out


@app.get("/distribution/open-holdings")
async def distribution_open_holdings(session: AsyncSession = Depends(get_session)):
    usdt_free = 0.0
    info = {}
    prices: Dict[str, float] = {}

    try:
        c = get_spot()
        info = c.account()
        prices = {p["symbol"]: float(p["price"]) for p in c.ticker_price()}
    except Exception:
        info = {}
        prices = {}

    # Saldo USDT libre
    for b in info.get("balances", []):
        if b.get("asset") == "USDT":
            usdt_free = float(b.get("free", 0))
            break

    # Posiciones abiertas
    rows = (
        await session.execute(select(Position).where(Position.status == "OPEN"))
    ).scalars().all()

    acc: Dict[str, float] = {}
    for p in rows:
        last = prices.get(p.symbol, p.entry_price)
        acc[p.symbol] = acc.get(p.symbol, 0.0) + p.qty * last

    out = [{"label": "CASH", "usdt": usdt_free}]
    for sym, usd in acc.items():
        out.append({"label": sym, "usdt": usd})

    return out


@app.get("/candles/{symbol}")
def candles(symbol: str, interval: str = Query("1m"), limit: int = Query(120, ge=50, le=1000)):
    """
    Devuelve velas + indicadores (EMA, RSI, MACD) con `x` como timestamp en ms.
    Esto asegura compatibilidad con Chart.js time scale.
    """
    kl = []
    try:
        c = get_spot()
        kl = c.klines(symbol.upper(), interval, limit=limit)
    except ClientError:
        return {"symbol": symbol.upper(), "last": None, "ema20": [], "rsi14": [], "macd": [], "signal": [], "candles": []}
    except Exception:
        return {"symbol": symbol.upper(), "last": None, "ema20": [], "rsi14": [], "macd": [], "signal": [], "candles": []}

    # Extraemos datos
    closes = [float(k[4]) for k in kl]
    opens = [float(k[1]) for k in kl]
    highs = [float(k[2]) for k in kl]
    lows = [float(k[3]) for k in kl]
    times = [int(k[0]) for k in kl]  # ⬅️ timestamp en ms

    # Calculamos indicadores
    e20 = ema(closes, 20) if closes else []
    r14 = rsi(closes, 14) if closes else []
    m_line, s_line, _ = macd(closes, 12, 26, 9) if closes else ([], [], [])

    # Construcción de respuesta con timestamps
    candles = [
        {"x": times[i], "o": opens[i], "h": highs[i], "l": lows[i], "c": closes[i]}
        for i in range(len(closes))
    ]

    ema20 = [{"x": times[i], "y": e20[i]} for i in range(len(e20))]
    rsi14 = [{"x": times[i], "y": r14[i]} for i in range(len(r14))]
    macd_line = [{"x": times[i], "y": m_line[i]} for i in range(len(m_line))]
    signal_line = [{"x": times[i], "y": s_line[i]} for i in range(len(s_line))]

    return {
        "symbol": symbol.upper(),
        "last": closes[-1] if closes else None,
        "ema20": ema20,
        "rsi14": rsi14,
        "macd": macd_line,
        "signal": signal_line,
        "candles": candles,
    }



@app.post("/actions/stop-all")
async def stop_all(session: AsyncSession = Depends(get_session)):
    try:
        res = await close_all_open_positions(session)
        await sync_positions_with_binance(session)
        logger.info(f"✅ Todas las posiciones cerradas y sincronizadas: {res}")
        return res
    except Exception as e:
        logger.error(f"❌ Error en stop_all: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/actions/close-symbol/{symbol}")
async def close_symbol(symbol: str, session: AsyncSession = Depends(get_session)):
    rows = (await session.execute(select(Position).where(Position.status=="OPEN", Position.symbol==symbol.upper()))).scalars().all()
    out=[]
    for p in rows:
        out.append(await close_position_market(session, p, method="MANUAL"))
    return {"ok": True, "closed": len(out)}


@app.post("/position/close")
async def close_position_manual(position_id: int = Body(...), session: AsyncSession = Depends(get_session)):
    result = await close_position_market(session=session, position_id=position_id, method="MANUAL")
    return result

@app.post("/position/close/{id}")
async def close_position(id: int, session: AsyncSession = Depends(get_session)):
    pos = await session.get(Position, id)
    if not pos or pos.status != "OPEN":
        raise HTTPException(status_code=404, detail="Position not found or not open")

    result = await close_position_market(session, pos.id)
    return result

@app.post("/actions/buy/{symbol}")
async def buy_symbol(symbol: str, quote: float = Query(50.0), session: AsyncSession = Depends(get_session)):
    res = await open_market_quote(session, symbol.upper(), quote, method="MANUAL")
    return {"ok": True, **res}

@app.post("/actions/clean-db")
async def clean_db(session: AsyncSession = Depends(get_session)):
    """
    Limpia posiciones abiertas inconsistentes (qty=0, método SYNC, sin balance real).
    """
    result = await clean_local_positions(session)
    await sync_positions_with_binance(session)
    return result


@app.get("/positions/closed")
async def get_closed_positions(limit: int = 100, session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Position)
        .where(Position.closed == True)
        .order_by(Position.closed_at.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    if not rows:
        return []
    return [row.__dict__ for row in rows]



@app.get("/trades/stats")
async def trades_stats(session: AsyncSession = Depends(get_session)):
    """
    Estadísticas generales de trades para KpiSummary.
    Calcula ganadores a partir de entry/exit en posiciones cerradas.
    """
    # Total de posiciones
    total = await session.scalar(select(func.count()).select_from(Position))

    # Todas las cerradas
    closed_positions = (
        await session.execute(
            select(Position).where(Position.status == "CLOSED")
        )
    ).scalars().all()

    wins = 0
    for p in closed_positions:
        # Buscar primer y último trade
        t_first = (
            await session.execute(
                select(Trade).where(Trade.position_id == p.id).order_by(Trade.created_at.asc())
            )
        ).scalars().first()
        t_last = (
            await session.execute(
                select(Trade).where(Trade.position_id == p.id).order_by(Trade.created_at.desc())
            )
        ).scalars().first()

        entry_price = t_first.price if t_first else None
        exit_price = t_last.price if t_last else None

        if p.side == "BUY" and entry_price and exit_price and exit_price > entry_price:
            wins += 1
        elif p.side == "SELL" and entry_price and exit_price and exit_price < entry_price:
            wins += 1

    now = datetime.utcnow()
    since_24h = now - timedelta(hours=24)
    since_1h = now - timedelta(hours=1)

    open24h = await session.scalar(
        select(func.count()).select_from(Position).where(Position.opened_at >= since_24h)
    )
    closed24h = await session.scalar(
        select(func.count()).select_from(Position).where(Position.closed_at >= since_24h)
    )

    open1h = await session.scalar(
        select(func.count()).select_from(Position).where(Position.opened_at >= since_1h)
    )
    closed1h = await session.scalar(
        select(func.count()).select_from(Position).where(Position.closed_at >= since_1h)
    )

    last5_positions = (
        await session.execute(
            select(Position)
            .where(Position.status == "CLOSED")
            .order_by(Position.closed_at.desc())
            .limit(5)
        )
    ).scalars().all()

    last5 = []
    for p in last5_positions:
        t_first = (
            await session.execute(
                select(Trade).where(Trade.position_id == p.id).order_by(Trade.created_at.asc())
            )
        ).scalars().first()
        t_last = (
            await session.execute(
                select(Trade).where(Trade.position_id == p.id).order_by(Trade.created_at.desc())
            )
        ).scalars().first()

        entry_price = t_first.price if t_first else None
        exit_price = t_last.price if t_last else None

        if p.side == "BUY" and entry_price and exit_price:
            last5.append(1 if exit_price > entry_price else 0)
        elif p.side == "SELL" and entry_price and exit_price:
            last5.append(1 if exit_price < entry_price else 0)
        else:
            last5.append(0)

    return {
        "total": total or 0,
        "wins": wins,
        "open24h": open24h or 0,
        "closed24h": closed24h or 0,
        "open1h": open1h or 0,
        "closed1h": closed1h or 0,
        "last5": last5,
    }

@app.get("/metrics/{symbol}")
async def get_symbol_metrics(symbol: str, session: AsyncSession = Depends(get_session)):
    symbol = symbol.upper()

    # Precios actuales
    prices: Dict[str, float] = {}
    last_price = None
    try:
        c = get_spot()
        prices = {p["symbol"]: float(p["price"]) for p in c.ticker_price()}
        last_price = prices.get(symbol)
    except Exception:
        prices = {}
        last_price = None

    # Posiciones abiertas
    open_positions = (
        await session.execute(
            select(Position).where(Position.symbol == symbol, Position.status == "OPEN")
        )
    ).scalars().all()

    invested = sum(p.qty * p.entry_price for p in open_positions)
    pnl_open = sum(
        ((last_price or p.entry_price) - p.entry_price) * (p.qty if p.side == "BUY" else -p.qty)
        for p in open_positions
    )
    nr_open = len(open_positions)

    # Rentabilidad acumulada de cerradas
    closed_positions = (
        await session.execute(
            select(Position).where(Position.symbol == symbol, Position.status == "CLOSED")
        )
    ).scalars().all()

    acc_profit = sum(
        (p.fees_total * -1) + ((p.tp or 0) - (p.sl or 0))
        for p in closed_positions
    )

    return {
        "symbol": symbol,
        "invested": invested,
        "pnl_open": pnl_open,
        "nr_open": nr_open,
        "acc_profit": acc_profit,
    }


# ====================================
# SMART TRADING API
# ====================================

# Estado global
app.state.smart = {
    "manifest": None,
    "chosen": None,
    "booster": None,
    "features": None,
    "dsl": None,
    "active_path": None
}


async def smart_train(
    data_path: str,
    pair: str,
    timeframe: str,
    outdir: str,
    min_accuracy: float = 0.75,
    min_profit: float = 0.05,
    profit_target: float = 0.10,
    stop_loss: float = 0.05,
    delta_t: int = 60,
    trailing_enabled: bool = True,
    trailing_distance: float = 0.015,
    max_combinations: int = 200,
):
    """Entrena y exporta un modelo SmartTrading"""
    rules = GoldenRules(
        min_accuracy=min_accuracy,
        min_profit=min_profit,
        profit_target=profit_target,
        stop_loss=stop_loss,
        delta_t=delta_t,
        trailing_enabled=trailing_enabled,
        trailing_distance=trailing_distance
    )

    manifest_path = smart_train_and_export(
        data_path=data_path,
        pair=pair,
        timeframe=timeframe,
        outdir=outdir,
        rules=rules,
        max_combinations=max_combinations
    )
    return {"ok": True, "manifest_path": manifest_path}


@app.get("/smart/signal/{symbol}")
async def smart_signal(symbol: str, session: AsyncSession = Depends(get_session)):
    """Calcula señal en vivo con el modelo activo"""
    sm = app.state.smart
    if not sm.get("booster"):
        raise HTTPException(status_code=400, detail="No active smart strategy")

    symbol = symbol.upper()

    # Obtener últimas velas del backend (protegido)
    try:
        c = get_spot()
        kl = c.klines(symbol, "1h", limit=120)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching candles from Binance: {str(e)}")

    if not kl:
        raise HTTPException(status_code=404, detail=f"No OHLCV data for {symbol}")

    # Construir DataFrame
    df = pd.DataFrame(kl, columns=[
        "time", "open", "high", "low", "close", "volume",
        "c1","c2","c3","c4","c5","c6"
    ])
    df = df[["time","open","high","low","close","volume"]].astype(float)

    # Agregar indicadores
    df = add_indicators(df)
    row = df.iloc[-1]

    if not ensure_features(row, sm["features"]):
        raise HTTPException(status_code=400, detail="Missing features in OHLCV")

    # Predicción por modelo
    try:
        pred_class, conf = predict_signal_from_model(sm["booster"], row[sm["features"]])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error running model prediction: {str(e)}")

    # Señal DSL
    pred_dsl = apply_dsl_rules(row, sm["dsl"])

    # Señal final
    signal = pred_class
    if pred_dsl != pred_class and conf < 0.55:
        signal = pred_dsl

    return {
        "symbol": symbol,
        "signal": signal,   # 0=HOLD, 1=BUY, 2=SELL
        "confidence": conf,
        "dsl_signal": pred_dsl,
        "risk": sm["dsl"].get("risk", {})
    }


@app.post("/smart/retrain-stream")
async def smart_retrain_stream(payload: dict):
    """
    Lanza el entrenamiento SmartTrading y transmite logs parciales en tiempo real.
    El frontend puede mostrar progreso con un EventSource (SSE).
    """
    pair = payload.get("pair")
    timeframe = payload.get("timeframe", "1h")
    data_path = payload.get("dataPath")
    outdir = payload.get("outdir", "artifacts")

    rules = GoldenRules(
        min_accuracy=float(payload.get("minAccuracy", 0.7)),
        min_profit=float(payload.get("minProfit", 0.05)),
        profit_target=float(payload.get("profitTarget", 0.1)),
        stop_loss=float(payload.get("stopLoss", 0.05)),
        delta_t=int(payload.get("deltaT", 60)),
        trailing_enabled=payload.get("trailingEnabled", True),
        trailing_distance=float(payload.get("trailingDistance", 0.01)),
    )

    max_combinations = int(payload.get("maxCombinations", 200))

    async def event_generator():
        yield f"data: {json.dumps({'status':'started','ts':str(datetime.datetime.utcnow())})}\n\n"
        await asyncio.sleep(0.2)

        # aquí llamamos a smart_train_and_export
        manifest_path = smart_train_and_export(
            data_path=data_path,
            pair=pair,
            timeframe=timeframe,
            outdir=outdir,
            rules=rules,
            max_combinations=max_combinations,
        )

        yield f"data: {json.dumps({'status':'completed','manifest':manifest_path,'ts':str(datetime.datetime.utcnow())})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")



# ==============================
# Helper seguro para enviar mensajes WS
# ==============================
async def safe_send(ws: WebSocket, data: dict):
    if ws.application_state != WebSocketState.CONNECTED:
        logger.error("⚠️ Intento de enviar mensaje pero el WS ya está cerrado.")
        return
    try:
        await ws.send_json(data)
    except (RuntimeError, Exception) as e:
        logger.error(f"⚠️ Error enviando mensaje WS: {e}")


# ==============================
# Progreso con safe_send
# ==============================
async def progress_callback(ws: WebSocket, current: int, total: int, message: str):
    try:
        await safe_send(ws, {
            "status": "progress",
            "progress": int((current / total) * 100),
            "message": message
        })
    except RuntimeError:
        # 🔥 Silenciar error de socket cerrado
        pass


# ==============================
# Task de keepalive
# ==============================
async def ping_task(ws: WebSocket):
    try:
        while True:
            await asyncio.sleep(15)  # ⏳ cada 15 segundos
            if ws.application_state != WebSocketState.CONNECTED:
                break
            await safe_send(ws, {"status": "ping"})
    except asyncio.CancelledError:
        # ✅ detener limpiamente cuando el WS se cierre
        pass


# ==============================
# Entrenamiento asincrónico
# ==============================
async def run_training(ws: WebSocket, cfg: dict, prep: dict):
    smart_res = await smart_train_and_export(
        data_path=cfg["dataPath"],
        pair=cfg["pair"],
        timeframe=cfg.get("timeframe", "1h"),
        outdir=cfg.get("outdir", "artifacts"),
        rules=GoldenRules(
            min_accuracy=float(cfg.get("minAccuracy", 0.7)),
            min_profit=float(cfg.get("minProfit", 0.05)),
            profit_target=float(cfg.get("profitTarget", 0.1)),
            stop_loss=float(cfg.get("stopLoss", 0.05)),
            delta_t=int(cfg.get("deltaT", 60)),
            trailing_enabled=bool(cfg.get("trailingEnabled", True)),
            trailing_distance=float(cfg.get("trailingDistance", 0.01)),
        ),
        max_combinations=int(cfg.get("maxCombinations", 200)),
        progress_callback=lambda c, t, m: progress_callback(ws, c, t, m)
    )

    if smart_res is None:
        await safe_send(ws, {
            "status": "warning",
            "message": "⚠️ No se generaron modelos válidos"
        })
    else:
        manifest_data = load_manifest(smart_res)
        await safe_send(ws, {
            "status": "done",
            "manifest": smart_res,
            "formulas": {
                "best_by_accuracy": manifest_data.get("best_by_accuracy"),
                "best_by_profit": manifest_data.get("best_by_profit"),
                "best_balanced": manifest_data.get("best_balanced"),
            },
            "generated_csv": prep["outfile"],
            "filesize": prep.get("filesize"),
            "generated_at": prep.get("generated_at"),
        })


# ==============================
# WebSocket principal
# ==============================
@app.websocket("/ws/smart/retrain")
async def websocket_smart_retrain(ws: WebSocket):
    await ws.accept()
    training_task = None
    ping = None

    try:
        payload = await ws.receive_json()
        pair = payload.get("pair")
        timeframe = payload.get("timeframe", "1h")
        outdir = payload.get("outdir", "artifacts")

        if not pair:
            await safe_send(ws, {"status": "error", "message": "❌ Falta el parámetro 'pair'"})
            return

        # ⏳ Mensaje antes de preparar dataset
        await safe_send(ws, {"status": "info", "message": "📅 Generando archivo de datos..."})

        # Dataset
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        outfile = os.path.join(outdir, f"{pair}_{timeframe}_{ts}.csv")
        prep = prepare_ohlcv_csv(pair, timeframe, outfile)

        if not prep["success"]:
            await safe_send(ws, {"status": "error", "message": prep["error"]})
            return

        cfg = payload.copy()
        cfg["dataPath"] = prep["outfile"]

        await safe_send(ws, {"status": "info", "message": "📅 Dataset preparado"})

        # 🚀 Lanza entrenamiento en background
        training_task = asyncio.create_task(run_training(ws, cfg, prep))

        # 🚀 Lanza keepalive
        ping = asyncio.create_task(ping_task(ws))

        await training_task

    except WebSocketDisconnect:
        logger.info("⚠️ Cliente desconectado de /ws/smart/retrain")
    except Exception as e:
        import traceback
        traceback.print_exc()
        await safe_send(ws, {"status": "error", "message": str(e)})
    finally:
        if ping:
            ping.cancel()
        if ws.application_state == WebSocketState.CONNECTED:
            await ws.close()




@app.post("/smart/activate")
async def activate_formula(payload: dict):
    """
    Activa una fórmula como estrategia principal para un símbolo.
    Guarda en memoria y en la base de datos (si está configurada con AsyncSession).
    """
    try:
        symbol = payload.get("symbol")
        formula = payload.get("formula")
        strategy_name = payload.get("strategy_name")

        if not symbol or not formula:
            raise HTTPException(status_code=400, detail="❌ Falta símbolo o fórmula")

        # 🔹 Guardamos en memoria
        trading_configs[symbol] = {
            "active_formula": formula,
            "active_strategy_name": strategy_name,
            "lastActivatedAt": datetime.utcnow().isoformat(),
        }

        # 🔹 Intentamos persistir en DB si AsyncSession está disponible
        try:
            async with SessionLocal() as session:  # SessionLocal debe devolver un AsyncSession
                if isinstance(session, AsyncSession):
                    # Buscar config existente
                    result = await session.execute(
                        select(TradingConfig).filter_by(symbol=symbol)
                    )
                    cfg = result.scalars().first()

                    if not cfg:
                        cfg = TradingConfig(symbol=symbol, method="SMART")
                        session.add(cfg)

                    cfg.method = "SMART"
                    cfg.params = formula  # guardamos la fórmula como JSON
                    cfg.active_strategy = strategy_name
                    cfg.updated_at = datetime.utcnow()

                    await session.commit()
                else:
                    logger.info("⚠️ SessionLocal no es AsyncSession, skip DB persistencia")

        except Exception as db_err:
            logger.error(f"⚠️ No se pudo persistir en DB: {db_err}")

        logger.info(f"⚡ Estrategia activada para {symbol}: {strategy_name} → {formula}")

        return {
            "success": True,
            "symbol": symbol,
            "formula": formula,
            "strategy": strategy_name,
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error activando fórmula: {str(e)}")

@app.get("/balance")
async def get_balance():
    async with SessionLocal() as session:
        result = await session.execute(
            select(EquitySnapshot).order_by(EquitySnapshot.ts.desc()).limit(1)
        )
        snap = result.scalars().first()
        if not snap:
            return {"free": 0, "invested": 0, "total": 0}
        return {
            "free": snap.free_usdt,
            "invested": snap.invested_usdt,
            "total": snap.total_usdt,
        }

async def scheduled_sync():
    """Tarea automática para sincronizar posiciones con Binance."""
    async with get_session_ws() as session:
        from app.backend.main import sync_positions_with_binance  # o ajustá ruta si la pusiste en otro archivo
        logger.info("[scheduler] ⏰ Ejecutando sincronización automática...")
        await sync_positions_with_binance(session)
        await clean_local_positions(session)

# 🔁 Ejecutar cada 1 hora
scheduler.add_job(scheduled_sync, "interval", hours=1)

# 🟢 Iniciar el scheduler cuando arranque la app
@app.on_event("startup")
async def startup_event():
    import logging
    logger = logging.getLogger(__name__)

    # Inicializar DB
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    run_sqlite_migrations()
    app.state.symbols = None

    # Iniciar scheduler
    scheduler.start()
    logger.info("[Scheduler] ✅ Limpieza automática activada (cada 1h).")

    # Lanzar WS asincrónico con delay
    async def delayed_launch():
        await asyncio.sleep(3)
        try:
            logger.info("🚀 Lanzando streams Binance (async delayed)...")
            await launch_all()
        except Exception as e:
            logger.error(f"❌ Error al lanzar streams Binance: {e}")

    asyncio.create_task(delayed_launch())
