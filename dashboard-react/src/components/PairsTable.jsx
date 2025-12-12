// dashboard-react/src/components/PairsTable.jsx
import React, { useEffect, useMemo, useState } from "react";
import { fetchPositions, fetchTickers } from "../api";

const DEFAULT_SYMBOLS = [
  "BTCUSDT","ETHUSDT","BNBUSDT","ADAUSDT","XRPUSDT",
  "SOLUSDT","DOGEUSDT","DOTUSDT","MATICUSDT","LTCUSDT"
];

export default function PairsTable() {
  const [positions, setPositions] = useState([]);
  const [prices, setPrices] = useState({});

  // cargar posiciones cada 5s
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const arr = await fetchPositions();
        if (!Array.isArray(arr)) {
          console.warn("[PairsTable] /positions devolvió no array, normalizando a []");
          if (alive) setPositions([]);
        } else if (alive) {
          setPositions(arr);
        }
      } catch (e) {
        console.error("[PairsTable] positions error:", e);
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // cargar tickers cada 3s
  const symbols = useMemo(() => {
    const fromPos = positions.map(p => p.symbol).filter(Boolean);
    const merged = Array.from(new Set([...DEFAULT_SYMBOLS, ...fromPos]));
    return merged;
  }, [positions]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const obj = await fetchTickers(symbols);
        if (obj && typeof obj === "object") {
          if (alive) setPrices(obj);
        } else {
          if (alive) setPrices({});
        }
      } catch (e) {
        console.error("[PairsTable] tickers error:", e);
      }
    };
    if (symbols.length) {
      load();
      const id = setInterval(load, 3000);
      return () => { alive = false; clearInterval(id); };
    }
  }, [symbols]);

  return (
    <div className="card">
      <h3>Pares</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Símbolo</th>
            <th>Qty</th>
            <th>Entry</th>
            <th>SL</th>
            <th>TP</th>
            <th>Last</th>
            <th>Abierta</th>
          </tr>
        </thead>
        <tbody>
          {positions.map(p => (
            <tr key={p.id}>
              <td>{p.symbol}</td>
              <td>{p.qty}</td>
              <td>{p.entry_price}</td>
              <td>{p.sl_price}</td>
              <td>{p.tp_price}</td>
              <td>{prices[p.symbol]?.toFixed ? prices[p.symbol].toFixed(6) : (prices[p.symbol] || 0)}</td>
              <td>{p.is_open ? "Sí" : "No"}</td>
            </tr>
          ))}
          {positions.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: "center" }}>Sin posiciones abiertas</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
