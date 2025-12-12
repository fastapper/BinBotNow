// dashboard-react/src/components/DistributionPie.tsx

import React, { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Label,
} from "recharts";
import { theme } from "../theme";
import { useWs } from "../context/WsProvider";

export default function DistributionPie() {
  const { summary } = useWs();
  const positions = summary?.positions?.open || [];
  const pnlByToken = summary?.pnl_by_token || [];

  const { data, total } = useMemo(() => {
    // 🔸 Opción 1: usar pnl_by_token (preferido)
    let raw = Array.isArray(pnlByToken)
      ? pnlByToken
          .filter((i) => i && i.qty > 0 && i.price > 0 && typeof i.symbol === "string")
          .map((i) => ({
            name: i.symbol,
            value: Number(i.qty) * Number(i.price),
          }))
      : [];

    // 🔸 Opción 2: fallback a positions.open
    if (raw.length === 0 && Array.isArray(positions)) {
      raw = positions
        .filter((p) => p.qty > 0 && (p.mark_price ?? 0) > 0)
        .map((p) => ({
          name: p.symbol,
          value: Number(p.qty) * Number(p.mark_price ?? 0),
        }));
    }

    // 🔸 Opcional: incluir USDT libre como porción
    // const free = Number(summary?.balance?.free_usdt ?? 0);
    // if (free > 0) raw.push({ name: "USDT", value: free });

    // 🔸 Limpiar, ordenar y totalizar
    const cleaned = raw.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
    const sum = cleaned.reduce((acc, d) => acc + d.value, 0);

    return { data: cleaned, total: sum };
  }, [pnlByToken, positions, summary?.balance]);

  const COLORS = [
    theme.colors.accent,
    theme.colors.success,
    theme.colors.warning,
    theme.colors.danger,
    "#845EC2",
    "#FF6F91",
    "#FFC75F",
    "#008F7A",
  ];

  return (
    <div style={{ width: "100%", height: "100%", minHeight: "280px" }}>
      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="40%"
              outerRadius="65%"
              paddingAngle={3}
              dataKey="value"
              label={({ name, value }) => `${name} ${Number(value).toFixed(2)} USDT`}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
              <Label
                value={`Total: ${Number(total).toFixed(2)} USDT`}
                position="center"
                style={{
                  fontSize: "12px",
                  fontWeight: "bold",
                  fill: theme.colors.text,
                  textAnchor: "middle",
                }}
              />
            </Pie>
            <Tooltip
              formatter={(val, name) => [`${Number(val).toFixed(2)} USDT`, String(name)]}
              contentStyle={{ fontSize: "11px" }}
            />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <p style={{ textAlign: "center", color: theme.colors.textSoft }}>
          No data to display
        </p>
      )}
    </div>
  );
}

