// dashboard-react/src/components/HoldingsPie.jsx
import React, { useEffect, useMemo, useState } from "react";
import { fetchPositions } from "../api";

export default function HoldingsPie() {
    const [pos, setPos] = useState([]);

    useEffect(() => {
        let alive = true;
        const load = async () => {
            const data = await fetchPositions();
            if (alive) setPos(data || []);
        };
        load();
        const id = setInterval(load, 6000);
        return () => { alive = false; clearInterval(id); };
    }, []);

    const rows = useMemo(() => {
        const total = (pos || []).reduce((acc, p) => acc + (p.market_value || 0), 0);
        return (pos || [])
            .map(p => {
                const mv = p.market_value || 0;
                return { symbol: p.symbol, mv, pct: total > 0 ? (mv / total * 100) : 0 };
            })
            .sort((a, b) => b.pct - a.pct);
    }, [pos]);

    return (
        <div className="card">
            <h3>Distribución de tenencias</h3>
            {!rows.length ? (
                <div>— sin posiciones —</div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {rows.map(r => (
                        <div key={r.symbol}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <strong>{r.symbol}</strong>
                                <span>{r.pct.toFixed(2)}%</span>
                            </div>
                            <div style={{ height: 8, background: "#eee" }}>
                                <div style={{ height: 8, width: `${r.pct}%`, background: "#888" }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
