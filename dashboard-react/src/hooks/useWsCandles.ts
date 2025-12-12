// src/hooks/useWsCandles.ts
import { useEffect, useRef } from "react";
import { wsManager } from "../api/WsManager";

type UseWsCandlesProps = {
  symbols: string[];
  intervals: Record<string, string>;
  onData: (data: any) => void;
};

// 🧭 Configuración global de debounce
const DEBOUNCE_MS = 300;

export function useWsCandles({ symbols, intervals, onData }: UseWsCandlesProps) {
  const subsRef = useRef<Record<string, () => void>>({});
  const keyRef = useRef<string>("");
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!symbols || symbols.length === 0) return;

    // 🔑 Generar firma única para detectar cambios reales
    const signature = JSON.stringify(symbols) + JSON.stringify(intervals);

    // 🧩 Evita repetir si no hubo cambios
    if (keyRef.current === signature) return;
    keyRef.current = signature;

    // 🕒 Limpiar debounce anterior
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    // 🧠 Aplicar debounce antes de re-suscribir
    debounceTimer.current = setTimeout(() => {
      console.log(
        `%c[useWsCandles] 🔗 Subscribiendo WS candles (debounced ${DEBOUNCE_MS}ms)`,
        "color: cyan;"
      );

      // 🧹 Cancelar suscripciones previas
      Object.values(subsRef.current).forEach((unsub) => unsub());
      subsRef.current = {};

      // 📡 Suscribir cada símbolo individualmente
      symbols.forEach((sym) => {
        const interval = intervals[sym] || "1m";
        const query = `${sym}&interval=${interval}`;
        const key = `${sym}-${interval}`;
        const unsub = wsManager.subscribe("candles", onData, query);
        subsRef.current[key] = unsub;
      });
    }, DEBOUNCE_MS);

    // 💀 Limpieza total al desmontar o re-render
    return () => {
      console.log("%c[useWsCandles] 💀 Cleanup total", "color: red;");
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      Object.values(subsRef.current).forEach((unsub) => unsub());
      subsRef.current = {};
      keyRef.current = "";
    };
  }, [JSON.stringify(symbols), JSON.stringify(intervals)]);
}
