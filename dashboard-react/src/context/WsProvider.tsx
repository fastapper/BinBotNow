// ✅ FIX 2.1: WsProvider — versión optimizada con debounce y polling inteligente
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { wsManager } from "../api/WsManager";
import { api } from "../api/client";

interface WsContextType {
  status: any;
  summary: any;
  balance: any;
  health: any;
  wsOnline: boolean;
  reloadBinancePositions: () => Promise<void>;
}

const WsContext = createContext<WsContextType | undefined>(undefined);
const DEBOUNCE_MS = 300;
const POLL_POSITIONS_MS = 20000;

export const WsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [status, setStatus] = useState<any>({});
  const [summary, setSummary] = useState<any>({});
  const [balance, setBalance] = useState<any>({});
  const [health, setHealth] = useState<any>({});
  const [wsOnline, setWsOnline] = useState(false);
  const [binancePositions, setBinancePositions] = useState<any[]>([]);

  const lastSummaryRef = useRef<number>(0);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // ---------------------------------------
  // 🔹 STATUS
  // ---------------------------------------
  const handleStatus = useCallback((data: any) => {
    setStatus((prev: any) => ({ ...prev, ...data }));
  }, []);

  // ---------------------------------------
  // 🔹 SUMMARY (con debounce)
  // ---------------------------------------
  const handleSummary = useCallback((data: any) => {
    const now = Date.now();
    if (now - lastSummaryRef.current < DEBOUNCE_MS) return; // 🧠 Evita spam visual
    lastSummaryRef.current = now;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      console.log("[WsProvider] 📊 Summary update:", data);
      setSummary(data || {});
    }, DEBOUNCE_MS);
  }, []);

  // ---------------------------------------
  // 🔹 BALANCE
  // ---------------------------------------
  const handleBalance = useCallback((data: any) => {
    setBalance((prev: any) => ({ ...prev, ...data }));
  }, []);

  // ---------------------------------------
  // 🔹 HEALTH
  // ---------------------------------------
  const handleHealth = useCallback((data: any) => {
    setHealth((prev: any) => ({ ...prev, ...data }));
  }, []);

  // ---------------------------------------
  // 🔹 Cargar posiciones reales de Binance
  // ---------------------------------------
  const reloadBinancePositions = useCallback(async () => {
    try {
      const resp = await fetch("http://127.0.0.1:8080/api/binance/open_positions");
      const data = await resp.json();
      if (data?.positions) {
        console.log(`[WsProvider] 🔁 Binance positions (${data.positions.length})`);
        setBinancePositions(data.positions);
      } else {
        setBinancePositions([]);
      }
    } catch (err) {
      console.error("[WsProvider] ❌ Error loading Binance positions:", err);
      setBinancePositions([]);
    }
  }, []);

  // ---------------------------------------
  // 🔹 Inicialización y suscripciones WS
  // ---------------------------------------
  useEffect(() => {
    if ((window as any).__wsProviderMounted) {
      console.log("[WsProvider] ⏭️ Ya montado, evitando duplicado");
      return;
    }
    (window as any).__wsProviderMounted = true;

    console.log("[WsProvider] 🔗 Subscribing shared WS channels");
    const unsubStatus = wsManager.subscribe("status", handleStatus);
    const unsubSummary = wsManager.subscribe("summary", handleSummary);
    const unsubBalance = wsManager.subscribe("balance", handleBalance);
    const unsubHealth = wsManager.subscribe("health", handleHealth);

    // 🔄 Poll Binance positions solo si WS no envía datos
    reloadBinancePositions();
    const interval = setInterval(() => {
      const sockets = Object.values((wsManager as any).sockets || {});
      const online = sockets.some((s: WebSocket) => s.readyState === WebSocket.OPEN);
      if (!online) {
        console.log("[WsProvider] 🕐 WS offline, ejecutando fallback polling...");
        reloadBinancePositions();
      }
    }, POLL_POSITIONS_MS);

    return () => {
      console.log("[WsProvider] 🧹 Unsubscribing shared WS channels");
      unsubStatus();
      unsubSummary();
      unsubBalance();
      unsubHealth();
      clearInterval(interval);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      (window as any).__wsProviderMounted = false;
    };
  }, [handleStatus, handleSummary, handleBalance, handleHealth, reloadBinancePositions]);

  // ---------------------------------------
  // 🔹 Monitoreo conexión WS
  // ---------------------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      const sockets = Object.values((wsManager as any).sockets || {});
      const online = sockets.some((s: WebSocket) => s.readyState === WebSocket.OPEN);
      setWsOnline(online);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // ---------------------------------------
  // 🔹 Merge automático WS summary + Binance fallback
  // ---------------------------------------
  const mergedSummary = useMemo(() => {
    const base = summary?.data || summary;
    const openPositions =
      binancePositions.length > 0 ? binancePositions : base?.positions?.open || [];

    let invested = 0;
    let currentValue = 0;

    for (const p of openPositions) {
      const qty = Number(p.qty) || 0;
      const entry = Number(p.entry_price) || 0;
      const mark =
        Number(p.mark_price) || Number(p.last_price) || Number(p.price) || 0;
      invested += qty * entry;
      currentValue += qty * mark;
    }

    const free_usdt = Number(base?.balance?.free_usdt ?? 0);
    const total_usdt = free_usdt + currentValue;
    const pnl_usdt = currentValue - invested;
    const pnl_pct = invested > 0 ? (pnl_usdt / invested) * 100 : 0;

    const merged = {
      ...base,
      data: {
        ...base?.data,
        balance: {
          free_usdt,
          invested_usdt: invested,
          total_usdt,
          pnl_usdt,
          pnl_pct,
        },
        positions: {
          ...(base?.positions || {}),
          open: openPositions,
        },
      },
    };

    return merged;
  }, [summary, binancePositions]);

  const value: WsContextType = {
    status,
    summary: mergedSummary,
    balance,
    health,
    wsOnline,
    reloadBinancePositions,
  };

  return <WsContext.Provider value={value}>{children}</WsContext.Provider>;
};

// ---------------------------------------
// Hook personalizado
// ---------------------------------------
export const useWs = () => {
  const ctx = useContext(WsContext);
  if (!ctx) throw new Error("useWs must be used within a WsProvider");
  return ctx;
};
