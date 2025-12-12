// dashboard-react/src/components/OpenPositionsTable.tsx

import React, { useMemo } from "react";
import { theme } from "../theme";
import { Button } from "./common/Button";
import { useWs } from "../context/WsProvider";

interface Position {
  id?: string;
  symbol: string;
  side?: "BUY" | "SELL";
  qty?: number;
  entry_price?: number;
  mark_price?: number;
  price?: number;
  last_price?: number;
  invested_usdt?: number;
  current_value_usdt?: number;
  pnl_usdt?: number;
  pnl_pct?: number;
  opened_at?: string;
  method?: string;
}

type Props = {
  positions?: any;
  onClosed?: (symbol: string) => void;
};

export default function OpenPositionsTable({ positions = [], onClosed }: Props) {
  const { summary } = useWs();
  const wsPositions = summary?.positions?.open || [];

  const closePosition = async (symbol: string, maxQty?: number) => {
    const input = prompt(`¿Cuánto deseas vender de ${symbol}?`, maxQty?.toString() || "0.0");
    const qty = Number(input);

    if (!qty || qty <= 0) {
      alert("Cantidad inválida.");
      return;
    }

    try {
      const resp = await fetch(`http://127.0.0.1:8080/api/binance/sell/${symbol}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ qty }),
      });
      const data = await resp.json();
      if (data?.error) {
        alert("Error: " + data.error);
      } else {
        alert(`✅ Vendido ${symbol}: ${data.qty_sold.toFixed(4)} @ ${data.avg_price}`);
        if (onClosed) onClosed(symbol);
      }
    } catch (err: any) {
      console.error("Error:", err);
      alert("Error ejecutando venta: " + err.message);
    }
  };

  const formatDate = (ts?: string) => {
    if (!ts) return "-";
    const d = new Date(ts);
    return d.toLocaleDateString("es-ES") + " " + d.toLocaleTimeString("es-ES", { hour12: false });
  };

  const calcAging = (ts?: string) => {
    if (!ts) return "-";
    const now = new Date();
    const opened = new Date(ts);
    const diffMin = Math.floor((now.getTime() - opened.getTime()) / 60000);
    return diffMin + " min";
  };

  const rows = useMemo(() => {
    const source = wsPositions.length > 0 ? wsPositions : positions || [];

    return (Array.isArray(source) ? source : [])
      .filter((p) => p && p.symbol)
      .map((p) => {
        const qty = Number(p.qty ?? 0);
        const entry = Number(p.entry_price ?? 0);
        const mark = Number(p.mark_price ?? p.last_price ?? p.price ?? entry) || 0;
        const invested = qty * entry;
        const current = qty * mark;
        const pnl_usdt = current - invested;
        const pnl_pct = invested > 0 ? (pnl_usdt / invested) * 100 : 0;

        return {
          ...p,
          qty,
          entry_price: entry,
          mark_price: mark,
          invested_usdt: invested,
          current_value_usdt: current,
          pnl_usdt,
          pnl_pct,
        };
      });
  }, [wsPositions, positions]);

  return (
    <div className="card">
      <div className="card__title">
        Open Positions (WebSocket Live)
      </div>
      <div className="card__body table-wrap">
        <table className="table" style={{ borderSpacing: "0 2px" }}>
          <thead style={{ backgroundColor: theme.colors.headerdk, color: "#fff" }}>
            <tr>
              {[
                "ID",
                "Symbol",
                "Side",
                "Qty",
                "Entry Price",
                "Mark Price",
                "Invested (USDT)",
                "Current (USDT)",
                "PnL (USDT)",
                "PnL %",
                "Opened At",
                "Aging",
                "Method",
                "Actions",
              ].map((h) => (
                <th key={h} style={{ padding: "4px 8px", textAlign: "left", fontSize: "12px" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={row.id || row.symbol}>
                  <td>{row.id || "-"}</td>
                  <td>{row.symbol}</td>
                  <td
                    style={{
                      color:
                        row.side === "BUY"
                          ? theme.colors.success
                          : row.side === "SELL"
                          ? theme.colors.danger
                          : theme.colors.textSoft,
                    }}
                  >
                    {row.side || "-"}
                  </td>
                  <td>{row.qty.toFixed(4)}</td>
                  <td>{row.entry_price.toFixed(4)}</td>
                  <td>{row.mark_price.toFixed(4)}</td>
                  <td>{row.invested_usdt.toFixed(2)}</td>
                  <td>{row.current_value_usdt.toFixed(2)}</td>
                  <td
                    style={{
                      color: row.pnl_usdt >= 0 ? theme.colors.success : theme.colors.danger,
                    }}
                  >
                    {row.pnl_usdt.toFixed(2)}
                  </td>
                  <td
                    style={{
                      color: row.pnl_pct >= 0 ? theme.colors.success : theme.colors.danger,
                    }}
                  >
                    {row.pnl_pct.toFixed(2)}%
                  </td>
                  <td>{formatDate(row.opened_at)}</td>
                  <td>{calcAging(row.opened_at)}</td>
                  <td>{row.method || "BINANCE_REAL"}</td>
                  <td>
                    <Button $variant="danger" onClick={() => closePosition(row.symbol, row.qty)}>
                      Sell
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={14}
                  style={{
                    textAlign: "center",
                    color: theme.colors.textSoft,
                    padding: "6px",
                    fontSize: "12px",
                  }}
                >
                  No open positions
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
