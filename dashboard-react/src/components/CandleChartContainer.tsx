// src/components/CandleChartContainer.tsx
import React, { useEffect, useState } from "react";
import CandleChart from "./CandleChart";
import { wsManager } from "../api/WsManager";

interface CandlePoint {
  x: number;
  o: number;
  h: number;
  l: number;
  c: number;
}
interface LinePoint {
  x: number;
  y: number;
}
interface CandleData {
  candles: CandlePoint[];
  ema20?: LinePoint[];
  rsi14?: LinePoint[];
  macd?: LinePoint[];
  signal?: LinePoint[];
}

export default function CandleChartContainer({ symbol }: { symbol: string }) {
  const [data, setData] = useState<CandleData>({
    candles: [],
    ema20: [],
    rsi14: [],
    macd: [],
    signal: [],
  });

  useEffect(() => {
    // 🔹 Nos suscribimos al canal dinámico "candles:SYMBOL"
    const unsubscribe = wsManager.subscribe(`candles:${symbol}`, (msg: any) => {
      try {
        // Validar estructura mínima
        if (msg && Array.isArray(msg.candles)) {
          setData({
            candles: msg.candles || [],
            ema20: msg.ema20 || [],
            rsi14: msg.rsi14 || [],
            macd: msg.macd || [],
            signal: msg.signal || [],
          });
        }
      } catch (err) {
        console.error("[CandleChartContainer] parse error:", err);
      }
    });

    return unsubscribe;
  }, [symbol]);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <CandleChart
        candles={data.candles}
        ema20={data.ema20}
        rsi14={data.rsi14}
        macd={data.macd}
        signal={data.signal}
      />
    </div>
  );
}
