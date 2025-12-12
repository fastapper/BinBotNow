import logging
from core.indicator_engine import IndicatorEngine
from core.ai_signaler import AISignaler
from core.risk_manager import RiskParameters

logger = logging.getLogger(__name__)


class StrategyEngine:
    def __init__(self, indicator_engine: IndicatorEngine, ai_signaler: AISignaler,
                 risk_params: RiskParameters, order_manager, datastore, cfg,
                 price_stream, binance_client=None):
        self.indicator_engine = indicator_engine
        self.ai_signaler = ai_signaler
        self.risk_params = risk_params
        self.order_manager = order_manager
        self.datastore = datastore
        self.cfg = cfg
        self.price_stream = price_stream
        self.binance_client = binance_client

    # =============================
    # INDICATORS & SIGNALS
    # =============================

    def compute_indicators(self, pair: str):
        """Usa IndicatorEngine para calcular indicadores del par."""
        return self.indicator_engine.compute(pair)

    def strategy_rsi(self, pair: str, indicators: dict, params: dict):
        try:
            rsi_val = indicators.get("rsi")
            if rsi_val is None:
                return None
            period = int(params.get("rsiPeriod", 14))
            overbought = float(params.get("rsiOverbought", 70))
            oversold = float(params.get("rsiOversold", 30))

            if rsi_val > overbought:
                logger.info(f"[RSI] {pair} SELL señal: RSI={rsi_val}")
                return "SELL"
            elif rsi_val < oversold:
                logger.info(f"[RSI] {pair} BUY señal: RSI={rsi_val}")
                return "BUY"
            return None
        except Exception as e:
            logger.error(f"[RSI] Error {pair}: {e}")
            return None

    def strategy_ema(self, pair: str, indicators: dict, params: dict):
        try:
            ema_short = indicators.get("ema_short")
            ema_long = indicators.get("ema_long")
            if ema_short is None or ema_long is None:
                return None

            if ema_short > ema_long:
                logger.info(f"[EMA] {pair} BUY señal: {ema_short}>{ema_long}")
                return "BUY"
            elif ema_short < ema_long:
                logger.info(f"[EMA] {pair} SELL señal: {ema_short}<{ema_long}")
                return "SELL"
            return None
        except Exception as e:
            logger.error(f"[EMA] Error {pair}: {e}")
            return None

    def strategy_macd(self, pair: str, indicators: dict, params: dict):
        try:
            macd_val = indicators.get("macd")
            signal_val = indicators.get("signal")
            if macd_val is None or signal_val is None:
                return None

            if macd_val > signal_val:
                logger.info(f"[MACD] {pair} BUY señal: {macd_val}>{signal_val}")
                return "BUY"
            elif macd_val < signal_val:
                logger.info(f"[MACD] {pair} SELL señal: {macd_val}<{signal_val}")
                return "SELL"
            return None
        except Exception as e:
            logger.error(f"[MACD] Error {pair}: {e}")
            return None

    def strategy_ai(self, pair: str, indicators: dict):
        try:
            signal = self.ai_signaler.signal(pair, indicators)
            if signal:
                logger.info(f"[AI] {pair} señal: {signal}")
            return signal
        except Exception as e:
            logger.error(f"[AI] Error {pair}: {e}")
            return None

    # =============================
    # RISK MANAGEMENT + DECISION
    # =============================

    def decide(self, pair: str, method: str, indicators: dict, params: dict):
        """Decide BUY/SELL/HOLD basado en el método elegido en TradingConfig."""
        if method == "RSI":
            return self.strategy_rsi(pair, indicators, params)
        elif method == "EMA":
            return self.strategy_ema(pair, indicators, params)
        elif method == "MACD":
            return self.strategy_macd(pair, indicators, params)
        elif method == "AI":
            return self.strategy_ai(pair, indicators)
        return None

    def execute_decision(self, pair: str, signal: str, price: float):
        """
        Ejecuta BUY/SELL si hay señal válida.
        Aplica los límites de riesgo configurados.
        """
        if not signal:
            return None

        if signal == "BUY":
            return self.order_manager.open_buy(pair, price, self.risk_params)
        elif signal == "SELL":
            return self.order_manager.open_sell(pair, price, self.risk_params)
        return None

    def get_price(self, pair: str):
        return self.price_stream.get_price(pair)
