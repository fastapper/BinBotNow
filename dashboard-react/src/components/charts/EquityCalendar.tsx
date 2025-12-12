// src/components/charts/EquityCalendar.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import anychart from "anychart";
import "anychart/dist/css/anychart-ui.min.css";
import "anychart/dist/js/anychart-bundle.min.js";

const toEpoch = (s: string): number => {
    if (!s) return 0;
    const trimmed = s.replace(/(\.\d{3})\d+$/, "$1").trim();
    const d = new Date(trimmed.includes(" ") ? trimmed.replace(" ", "T") : trimmed);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
};

const pickNum = (obj: any, keys: string[], fallback = 0): number => {
    for (const k of keys) {
        const v = obj?.[k];
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (typeof v === "string" && v.trim() !== "" && Number.isFinite(+v)) return +v;
    }
    return fallback;
};

const pickTs = (obj: any): string =>
    obj?.ts || obj?.timestamp || obj?.created_at || obj?.time || "";

type RangeKey = "30d" | "90d" | "6m" | "12m" | "all";
type DailyPoint = { date: string; value: number };

export default function EquityCalendar() {
    const [range, setRange] = useState<RangeKey>("12m");
    const chartRef = useRef<any | null>(null);
    const containerId = useMemo(() => "equityCalendar_" + Math.random().toString(36).slice(2), []);

    useEffect(() => {
        load(range);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [range]);

    async function load(r: RangeKey) {
        try {
            const aggregate = r.includes("h") ? "hourly" : "daily";
            const url = `http://127.0.0.1:8080/equity/history?range=${encodeURIComponent(
                r
            )}&aggregate=${aggregate}&_=${Date.now()}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();

            const rows = (Array.isArray(json) ? json : [])
                .map((p: any) => {
                    const ts = pickTs(p);
                    const free = pickNum(p, ["free_usdt", "free"], 0);
                    let total = pickNum(p, ["total", "avg_total_usdt", "max_total_usdt", "min_total_usdt"], NaN);
                    let invested = pickNum(p, ["invested_usdt", "invested"], NaN);
                    if (!Number.isFinite(total)) total = free + invested;
                    if (!Number.isFinite(invested)) invested = total - free;
                    return { ts, __x: toEpoch(ts), free, invested, total };
                })
                .filter((p: any) => p.ts && Number.isFinite(p.total))
                .sort((a: any, b: any) => a.__x - b.__x);

            const daily: DailyPoint[] = [];
            for (let i = 1; i < rows.length; i++) {
                const prev = rows[i - 1].total;
                const curr = rows[i].total;
                if (prev && Number.isFinite(prev)) {
                    const changePct = ((curr - prev) / prev) * 100;
                    daily.push({
                        date: new Date(rows[i].__x).toISOString().slice(0, 10),
                        value: changePct,
                    });
                }
            }
            render(daily);
        } catch (e) {
            console.error("[EquityCalendar] ❌", e);
            render([]);
        }
    }

    function render(data: DailyPoint[]) {
        if (!chartRef.current) {
            const chart = anychart.calendar(data);

            // Fondo oscuro siempre
            chart.background().fill("#0f172a");

            // Escala pérdida ↔ neutro ↔ ganancia
            const scale = anychart.scales.linearColor();
            scale.colors(["#b91c1c", "#374151", "#16a34a"]);
            chart.colorScale(scale);

            // Tooltip
            chart.tooltip().format(function () {
                const v = Number(this.getData("value") || 0);
                return `${this.getData("date")}\nRentabilidad: ${v.toFixed(2)}%`;
            });

            // Mensaje "sin datos" (solo label)
            const nd = chart.noData();
            nd.label().enabled(true);
            nd.label().text("Sin datos para el rango seleccionado");
            nd.label().fontColor("#94a3b8");
            nd.label().fontSize(12);

            chart.container(containerId);
            chart.draw();
            chartRef.current = chart;
        } else {
            chartRef.current.data(data);
            chartRef.current.draw();
        }
    }

    return (
        <div style={{ width: "100%" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: 12, color: "#cbd5e1" }}>Rango:</label>
                <select
                    value={range}
                    onChange={(e) => setRange(e.target.value as RangeKey)}
                    style={{
                        fontSize: 14,
                        background: "#0f172a",
                        border: "1px solid #334155",
                        color: "#e2e8f0",
                        borderRadius: 6,
                        padding: "4px 8px",
                    }}
                >
                    <option value="30d">Últimos 30 días</option>
                    <option value="90d">Últimos 90 días</option>
                    <option value="6m">Últimos 6 meses</option>
                    <option value="12m">Últimos 12 meses</option>
                    <option value="all">Todos</option>
                </select>
            </div>

            <div
                id={containerId}
                style={{
                    width: "100%",
                    height: 260,
                    backgroundColor: "#0f172a",   // oscuro constante
                    borderRadius: 12,
                }}
            />
        </div>
    );
}
