import React, { useMemo } from "react";
import { theme } from "../theme";

type ClosedPosition = {
  id?: string;
  symbol?: string;
  qty?: number;
  entry_price?: number;
  exit_price?: number;
  pnl_usdt?: number;
  pnl_pct?: number;
  fees_total?: number;
  closed_at?: string;
  method?: string;
  realized?: number;
  invested_usdt?: number;
};

type Props = {
  positions?: any;
};

export default function ClosedOpsTable({ positions = [] }: Props) {
  // ✅ Asegurar compatibilidad con WS summary, API o estructura anidada
  const rows = useMemo(() => {
    const base =
      positions?.closed ||
      positions?.positions?.closed ||
      positions?.data?.positions?.closed ||
      positions ||
      [];

    return (Array.isArray(base) ? base : [])
      .filter((r) => r && r.symbol)
      .map((r) => {
        const pnl_usdt =
          r.pnl_usdt ??
          r.realized ??
          (r.exit_price && r.entry_price && r.qty
            ? (r.exit_price - r.entry_price) * r.qty
            : 0);

        const pnl_pct =
          r.pnl_pct ??
          (r.entry_price && r.exit_price
            ? ((r.exit_price - r.entry_price) / r.entry_price) * 100
            : 0);

        return {
          ...r,
          id: r.id || r.trade_id || `${r.symbol}-${r.closed_at || ""}`,
          qty: Number(r.qty ?? r.quantity ?? 0),
          entry_price: Number(r.entry_price ?? r.buy_price ?? 0),
          exit_price: Number(r.exit_price ?? r.sell_price ?? 0),
          pnl_usdt: Number(pnl_usdt ?? 0),
          pnl_pct: Number(pnl_pct ?? 0),
          fees_total: Number(r.fees_total ?? r.fees ?? 0),
          method: r.method || r.strategy || "AUTO",
          closed_at: r.closed_at || r.updated_at || r.sold_at || null,
        };
      });
  }, [positions]);

  const safe = (val: any, decimals = 2) =>
    typeof val === "number" && !isNaN(val)
      ? val.toFixed(decimals)
      : val
      ? String(val)
      : "-";

  const formatDate = (ts?: string) => {
    if (!ts) return "-";
    const d = new Date(ts);
    return (
      d.toLocaleDateString("es-ES") +
      " " +
      d.toLocaleTimeString("es-ES", { hour12: false })
    );
  };

  return (
    <div className="card">
      <div className="card__title">Closed Positions</div>
      <div className="card__body table-wrap">
        <table className="table" style={{ fontSize: "0.75rem" }}>
          <thead style={{ backgroundColor: theme.colors.headerdk, color: "#fff" }}>
            <tr>
              {[
                "ID",
                "Symbol",
                "Qty",
                "Entry",
                "Exit",
                "PnL (USDT)",
                "PnL %",
                "Fees",
                "Method",
                "Closed At",
              ].map((h) => (
                <th key={h} style={{ padding: "6px 10px", textAlign: "left" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row, idx) => (
                <tr key={`${row.id}-${idx}`}>
                  <td>{row.id || "-"}</td>
                  <td>{row.symbol || "-"}</td>
                  <td>{safe(row.qty, 4)}</td>
                  <td>{safe(row.entry_price, 4)}</td>
                  <td>{safe(row.exit_price, 4)}</td>
                  <td
                    style={{
                      color:
                        (row.pnl_usdt ?? 0) >= 0
                          ? theme.colors.success
                          : theme.colors.danger,
                    }}
                  >
                    {safe(row.pnl_usdt, 2)}
                  </td>
                  <td
                    style={{
                      color:
                        (row.pnl_pct ?? 0) >= 0
                          ? theme.colors.success
                          : theme.colors.danger,
                    }}
                  >
                    {safe(row.pnl_pct, 2)}%
                  </td>
                  <td>{safe(row.fees_total, 3)}</td>
                  <td>{row.method || "-"}</td>
                  <td>{formatDate(row.closed_at)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={10}
                  style={{
                    textAlign: "center",
                    color: theme.colors.textSoft,
                    padding: "8px",
                  }}
                >
                  No closed trades found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
