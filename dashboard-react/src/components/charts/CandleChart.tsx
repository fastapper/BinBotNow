import React from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  BarElement,
} from "chart.js";
import { Chart } from "react-chartjs-2";
import "chartjs-adapter-date-fns";
import { CandlestickController, CandlestickElement } from "chartjs-chart-financial";

// ❌ Eliminado: import annotationPlugin from "chartjs-plugin-annotation";

ChartJS.register(
  CategoryScale,
  LinearScale,
  TimeScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  BarElement,
  CandlestickController,
  CandlestickElement
  // ❌ Eliminado: annotationPlugin
);

interface CandleChartProps {
  candles?: { x: number; o: number; h: number; l: number; c: number }[];
  ema20?: { x: number; y: number }[];
  rsi14?: { x: number; y: number }[];
  macd?: { x: number; y: number }[];
  signal?: { x: number; y: number }[];
}

const CandleChart: React.FC<CandleChartProps> = ({
  candles = [],
  ema20 = [],
  rsi14 = [],
  macd = [],
  signal = [],
}) => {
  if (!candles.length) return <p>No hay datos</p>;

  const candlesTrimmed = candles.slice(-500);

  const times = candlesTrimmed.map((c) => c.x);
  const minX = Math.min(...times);
  const maxX = Math.max(...times);

  // --- datasets ---
  const candleDataset = {
    label: "Price",
    data: candlesTrimmed.map((c) => ({ x: c.x, o: c.o, h: c.h, l: c.l, c: c.c })),
    type: "candlestick" as const,
    color: {
      up: "rgba(0, 200, 0, 0.9)",
      down: "rgba(200, 0, 0, 0.9)",
      unchanged: "rgba(120,120,120,0.9)",
    },
    xAxisID: "sharedX",
  };

  const emaDataset = {
    label: "EMA20",
    data: ema20.map((p) => ({ x: p.x, y: p.y })),
    type: "line" as const,
    borderColor: "#1d4ed8",
    borderWidth: 2,
    pointRadius: 0,
    tension: 0.25,
    xAxisID: "sharedX",
  };

  const rsiDataset = {
    label: "RSI14",
    data: rsi14.map((p) => ({ x: p.x, y: p.y })),
    type: "line" as const,
    borderColor: "#8b5cf6",
    borderWidth: 1.5,
    pointRadius: 0,
    xAxisID: "sharedX",
  };

  const macdDataset = {
    label: "MACD",
    data: macd.map((p) => ({ x: p.x, y: p.y })),
    type: "line" as const,
    borderColor: "#f59e0b",
    borderWidth: 1.5,
    pointRadius: 0,
    xAxisID: "sharedX",
  };

  const signalDataset = {
    label: "Signal",
    data: signal.map((p) => ({ x: p.x, y: p.y })),
    type: "line" as const,
    borderColor: "#ec4899",
    borderWidth: 1.5,
    pointRadius: 0,
    xAxisID: "sharedX",
  };

  const signalMap = new Map(signal.map((s) => [s.x, s.y]));
  const histogramDataset = {
    label: "Histogram",
    data: macd.map((p) => ({
      x: p.x,
      y: p.y - (signalMap.get(p.x) ?? 0),
    })),
    type: "bar" as const,
    backgroundColor: (ctx: any) =>
      ctx.raw.y >= 0 ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)",
    borderWidth: 0,
    xAxisID: "sharedX",
  };

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index" as const, intersect: false },
    scales: {
      sharedX: {
        type: "time" as const,
        axis: "x" as const,
        min: minX,
        max: maxX,
        ticks: { source: "data", maxRotation: 0, autoSkip: true },
        grid: { color: "rgba(200,200,200,0.15)" },
      },
      y: {
        axis: "y" as const,
        position: "left" as const,
        grid: { color: "rgba(200,200,200,0.1)" },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { mode: "index" as const, intersect: false },
    },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      {/* 📈 Velas + EMA */}
      <div style={{ flex: 3, minHeight: "320px" }}>
        <Chart
          type="candlestick"
          data={{ datasets: [candleDataset, emaDataset] }}
          options={{
            ...baseOptions,
            scales: {
              sharedX: baseOptions.scales.sharedX,
              y: { ...baseOptions.scales.y, beginAtZero: false },
            },
          }}
        />
      </div>

      {/* 📊 RSI */}
      <div style={{ flex: 1, minHeight: "160px" }}>
        <Chart
          type="line"
          data={{ datasets: [rsiDataset] }}
          options={{
            ...baseOptions,
            scales: {
              sharedX: baseOptions.scales.sharedX,
              y: { axis: "y" as const, min: 0, max: 100 },
            },
          }}
        />
      </div>

      {/* 📊 MACD */}
      <div style={{ flex: 1, minHeight: "160px" }}>
        <Chart
          type="bar"
          data={{ datasets: [histogramDataset, macdDataset, signalDataset] }}
          options={{
            ...baseOptions,
            scales: {
              sharedX: baseOptions.scales.sharedX,
              y: baseOptions.scales.y,
            },
          }}
        />
      </div>
    </div>
  );
};

export default CandleChart;
