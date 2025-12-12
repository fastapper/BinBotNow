"""Trading bot runner optimizado con ejecución real en Binance Spot (versión revisada)."""

from __future__ import annotations
import asyncio
import re
import logging
from datetime import datetime
from sqlalchemy import select

# Core imports
from app.core.indicators import add_indicators
from app.core.config import settings
from app.core.binance_client import get_spot
from app.core.market import get_active_symbols
from app.core.db import SessionLocal
from app.core.models import TradingConfig, Position
from app.core.order_service import open_market_quote, close_position_market

# ======================================================
# Variables globales
# ======================================================
last_signal_time: dict[str, datetime] = {}
RSI_COOLDOWN = 120  # segundos
TRADE_USDT_AMOUNT = 50  # valor fijo por orden
logger = logging.getLogger("bot")

# ======================================================
# Funciones auxiliares
# ======================================================
def parse_human_rule(formula: str) -> list[tuple[str, str]]:
    try:
        rules = []
        formula = (
            formula.replace("→", "->")
                   .replace("↗", ">")
                   .replace("↘", "<")
                   .replace("\n", "|")
        )
        for part in formula.split("|"):
            if "->" not in part:
                continue
            condition, action = part.split("->", 1)
            rules.append((condition.strip(), action.strip().upper()))
        return rules
    except Exception as e:
        logger.error(f"❌ Error parseando fórmula '{formula}': {e}")
        return []


def evaluate_condition(expr: str, indicators: dict) -> bool:
    match = re.match(r"([A-Za-z0-9_]+)\s*(>=|<=|>|<|==)\s*([A-Za-z0-9_\.]+)", expr)
    if not match:
        return False
    left, op, right = match.groups()

    def resolve(val):
        try:
            return float(val)
        except ValueError:
            return indicators.get(val.lower()) or indicators.get(val.upper())

    left_val, right_val = resolve(left), resolve(right)
    if left_val is None or right_val is None:
        return False
    return eval(f"{left_val} {op} {right_val}")


def can_trigger(symbol: str) -> bool:
    """Evita repetir señales en ventana corta."""
    now = datetime.utcnow()
    last = last_signal_time.get(symbol)
    if last and (now - last).total_seconds() < RSI_COOLDOWN:
        return False
    last_signal_time[symbol] = now
    return True


# ======================================================
# Ejecución real — Binance + DB
# ======================================================
async def execute_signal(session, symbol: str, action: str, reason: str):
    """Ejecuta BUY o SELL real usando las funciones del order_service."""
    try:
        action = action.upper()
        if action == "BUY":
            await open_market_quote(session, symbol, TRADE_USDT_AMOUNT, method="AUTO", side="BUY")
            logger.info(f"✅ BUY ejecutado en {symbol} ({reason})")

        elif action == "SELL":
            result = await session.execute(
                select(Position).where(Position.symbol == symbol, Position.status == "OPEN")
            )
            positions = result.scalars().all()
            if not positions:
                logger.warning(f"[Bot] ❌ No se encontró ninguna posición abierta para {symbol}")
                return

            if len(positions) > 1:
                logger.warning(f"[Bot] ⚠️ Múltiples posiciones OPEN encontradas para {symbol}, usando la más reciente")

            pos = sorted(positions, key=lambda x: x.created_at if hasattr(x, "created_at") else x.id)[-1]

            if not pos:
                logger.warning(f"⚠️ No hay posición abierta para {symbol}, se ignora SELL.")
                return
            await close_position_market(session, pos, method="AUTO")
            logger.info(f"✅ SELL ejecutado en {symbol} ({reason})")

    except Exception as e:
        logger.error(f"❌ Error ejecutando {action} en {symbol}: {e}", exc_info=True)


# ======================================================
# LOOP PRINCIPAL
# ======================================================
async def run_loop(client, pairs, cfg):
    async with SessionLocal() as session:
        while True:
            try:
                result = await session.execute(select(TradingConfig))
                configs = {c.symbol: c for c in result.scalars().all()}

                for pair in pairs:
                    if not pair.endswith("USDT"):
                        continue

                    if not can_trigger(pair):
                        continue

                    kl = client.klines(pair, cfg.get("interval", "1m"), limit=100)
                    closes = [float(k[4]) for k in kl]
                    if not closes:
                        continue

                    indicators = add_indicators(closes)
                    cfg_db = configs.get(pair)
                    signal = None
                    method = None

                    if cfg_db:
                        method = cfg_db.method
                        params = cfg_db.params or {}

                        # RSI Strategy
                        if method == "RSI":
                            rsi = indicators.get("rsi")
                            if not rsi:
                                continue
                            if rsi > float(params.get("rsiOverbought", 70)):
                                signal = {"action": "SELL", "reason": f"RSI Overbought ({rsi:.1f})"}
                            elif rsi < float(params.get("rsiOversold", 30)):
                                signal = {"action": "BUY", "reason": f"RSI Oversold ({rsi:.1f})"}

                        # EMA Strategy
                        elif method == "EMA":
                            short, long = indicators.get("ema_short"), indicators.get("ema_long")
                            if short and long:
                                if short > long:
                                    signal = {"action": "BUY", "reason": "EMA Crossover"}
                                elif short < long:
                                    signal = {"action": "SELL", "reason": "EMA Crossover"}

                        # MACD Strategy
                        elif method == "MACD":
                            macd, sig = indicators.get("macd"), indicators.get("signal")
                            if macd and sig:
                                if macd > sig:
                                    signal = {"action": "BUY", "reason": "MACD Crossover"}
                                elif macd < sig:
                                    signal = {"action": "SELL", "reason": "MACD Crossover"}

                    # === Ejecutar señales reales ===
                    if signal:
                        logger.info(f"⚡ Señal {signal['action']} en {pair} ({signal['reason']})")
                        await execute_signal(session, pair, signal["action"], signal["reason"])

                await asyncio.sleep(cfg.get("refresh_interval", 15))

            except Exception as e:
                logger.error(f"❌ Error en loop principal: {e}", exc_info=True)
                await asyncio.sleep(5)


# ======================================================
# MAIN ENTRYPOINT
# ======================================================
async def run_bot():
    logging.basicConfig(level=logging.INFO)
    cfg = {
        "interval": "1m",
        "refresh_interval": 15,
    }

    pairs = get_active_symbols()
    if not pairs:
        logging.error("❌ No hay pares activos configurados.")
        return

    logging.info(f"📊 Pairs activos: {pairs}")
    client = get_spot()
    logging.info("🚀 Entrando en loop principal (ejecución real)...")
    await run_loop(client, pairs, cfg)


if __name__ == "__main__":
    asyncio.run(run_bot())
