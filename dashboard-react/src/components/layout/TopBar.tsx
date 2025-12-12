// app/dashboard-react/src/components/layout/TopBar.tsx
import styled, { keyframes, css } from "styled-components";
import { useNavigate } from "react-router-dom";
import SignValue from "../common/SignValue";
import { useEffect, useMemo, useState, useRef } from "react";
import { useWs } from "../../context/WsProvider";

// ----------------- styled -----------------
const Bar = styled.div`
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.panelAlt};
  padding: 12px 14px;
`;
const Layout = styled.div`
  display: grid;
  gap: 12px;
  align-items: stretch;
  grid-template-columns: 360px 1fr;
`;
const Block = styled.div`
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 190px;
`;
const Title = styled.div`
  padding: 8px 10px;
  text-align: center;
  font-weight: 700;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
`;
const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  padding: 6px 8px 10px;
  gap: 6px;
`;
const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1px;
  padding: 6px 6px;
  small {
    color: ${({ theme }) => theme.colors.textSoft};
  }
  strong {
    font-weight: 600;
  }
`;
const TokensWrap = styled.div`
  padding: 10px;
  display: grid;
  align-content: start;
  grid-template-columns: repeat(5, minmax(140px, 1fr));
  gap: 8px;
`;
const TokenCard = styled.div`
  background: ${({ theme }) => theme.colors.panelAlt};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.xs};
  padding: 8px 10px;
  display: grid;
  grid-template-rows: auto auto;
  row-gap: 4px;
  .line1 {
    color: ${({ theme }) => theme.colors.textSoft};
    display: flex;
    justify-content: space-between;
  }
  .line2 {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .ops {
    font-size: 0.85rem;
    font-weight: 500;
  }
`;
const Dot = styled.span<{ $t: "buy" | "sell" | "keep" | "up" | "down" | "flat" }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 6px;
  background: ${({ $t }) =>
    $t === "buy"
      ? "#22c55e"
      : $t === "sell"
      ? "#ef4444"
      : $t === "keep"
      ? "#6b7280"
      : $t === "up"
      ? "#22c55e"
      : $t === "down"
      ? "#ef4444"
      : "#6b7280"};
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.04);
`;
const StatusDot = styled.span<{ $ok?: boolean }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  background: ${({ $ok }) => ($ok ? "#22c55e" : "#ef4444")};
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15);
`;

const flashUp = keyframes`
  from { background-color: rgba(34, 197, 94, 0.25); }
  to { background-color: transparent; }
`;
const flashDown = keyframes`
  from { background-color: rgba(239, 68, 68, 0.25); }
  to { background-color: transparent; }
`;

const FlashBox = styled.div<{ $trend?: "up" | "down" | null }>`
  ${({ $trend }) =>
    $trend === "up" &&
    css`
      animation: ${flashUp} 0.6s ease;
    `}
  ${({ $trend }) =>
    $trend === "down" &&
    css`
      animation: ${flashDown} 0.6s ease;
    `}
`;


// ----------------- componente -----------------
export default function TopBar() {
  const nav = useNavigate();
  const { status, summary, wsOnline } = useWs();

  const raw = summary || {};
  const positions = raw?.positions?.open || [];

  const prevTotalRef = useRef(0);
  const prevTokenMap = useRef<Record<string, number>>({});
  const [trend, setTrend] = useState<"up" | "down" | null>(null);
  const [tokenTrends, setTokenTrends] = useState<Record<string, "up" | "down" | null>>({});

  const symbols = status?.symbols || [];

  // ✅ BLOQUE 1: Cálculo global desde summary
  const opened = useMemo(() => {
    let invested = 0;
    let currentValue = 0;

    for (const p of positions) {
      const qty = Number(p.qty || 0);
      const entry = Number(p.entry_price || 0);
      const mark = Number(p.mark_price || 0);
      invested += qty * entry;
      currentValue += qty * mark;
    }

    const curUsdt = currentValue - invested;
    const curPct = invested > 0 ? ((currentValue / invested - 1) * 100) : 0;

    return {
      nr: positions.length,
      invested,
      currentValue,
      curUsdt,
      curPct,
    };
  }, [positions]);

  // ⚡ BLOQUE 2: Parpadeo global
  useEffect(() => {
    const diff = opened.curUsdt - prevTotalRef.current;
    if (Math.abs(diff) > 0.01) {
      setTrend(diff > 0 ? "up" : "down");
      prevTotalRef.current = opened.curUsdt;
      const t = setTimeout(() => setTrend(null), 600);
      return () => clearTimeout(t);
    }
  }, [opened.curUsdt]);

  // ✅ BLOQUE 3: Agregación de rentabilidad por token desde summary.pnl_by_token
  const tokenAgg = useMemo(() => {
    const tokenMap = new Map<string, { invested: number; current: number; count: number; flag?: string }>();

    for (const p of positions) {
      const sym = p.symbol;
      const qty = Number(p.qty || 0);
      const entry = Number(p.entry_price || 0);
      const mark = Number(p.mark_price || 0);
      const flag = p.flag || "KEEP";

      if (!sym || !qty) continue;
      if (!tokenMap.has(sym)) tokenMap.set(sym, { invested: 0, current: 0, count: 0, flag });

      const t = tokenMap.get(sym)!;
      t.invested += qty * entry;
      t.current += qty * mark;
      t.count += 1;
      t.flag = flag;
    }

    const result = [];
    for (const [symbol, t] of tokenMap.entries()) {
      const pnl_usdt = t.current - t.invested;
      const pnl_pct = t.invested > 0 ? ((t.current / t.invested - 1) * 100) : 0;
      result.push({ symbol, pnl_usdt, pnl_pct, count: t.count, flag: t.flag, invested: t.invested });
    }
    return result;
  }, [positions]);


  // 🔄 BLOQUE 4: Parpadeo por token - solo si realmente cambió
  useEffect(() => {
    const prevMap = prevTokenMap.current;
    const nextTrends: Record<string, "up" | "down" | null> = {};
    let changed = false;

    for (const { symbol, pnl_usdt } of tokenAgg) {
      const oldVal = prevMap[symbol] ?? 0;
      const diff = pnl_usdt - oldVal;
      const trend = diff > 0.01 ? "up" : diff < -0.01 ? "down" : null;

      if (tokenTrends[symbol] !== trend) {
        changed = true;
      }

      nextTrends[symbol] = trend;
      prevMap[symbol] = pnl_usdt;
    }

    if (changed) {
      setTokenTrends((prev) => ({ ...prev, ...nextTrends }));
    }
  }, [tokenAgg]);

  const pnlMap = new Map(tokenAgg.map((x) => [x.symbol, x.pnl_usdt]));
  const aggMap = new Map(tokenAgg.map((x) => [x.symbol, x]));
  const list = tokenAgg.map((x) => x.symbol).slice(0, 10);

  return (

    <Bar>
      <Layout>
        <Block>
          <Title>
            Opened Positions
            <StatusDot
              $ok={wsOnline}
              title={wsOnline ? "WebSocket connected" : "WebSocket offline"}
            />
          </Title>
          <Grid>
            <Row>
              <small>Nr. Operations Open</small>
              <strong>{opened.nr}</strong>
            </Row>
            <Row>
              <small>Total Invested</small>
              <SignValue value={opened.invested} suffix=" USDT" />
            </Row>
            <Row>
              <small>Current Value</small>
              <SignValue value={opened.currentValue} suffix=" USDT" />
            </Row>
            <FlashBox $trend={trend}>
              <Row>
                <small>Current Profitability</small>
                <div style={{ display: "flex", gap: 10 }}>
                  <SignValue value={opened.curUsdt} suffix=" USDT" />
                  <SignValue value={opened.curPct} suffix=" %" />
                </div>
              </Row>
            </FlashBox>
          </Grid>
        </Block>

        <Block>
          <Title>Profitability by Token - Open positions</Title>
          <TokensWrap>
            {list.map((symbol) => {
              const v = pnlMap.get(symbol) ?? 0;
              const a = aggMap.get(symbol) || { pnl_pct: 0, count: 0, flag: "KEEP" };
              const flag = (a.flag || "KEEP").toUpperCase();
              const dotType = flag === "BUY" ? "buy" : flag === "SELL" ? "sell" : "keep";
              const opsColor = a.count > 0 ? "#ef4444" : "#6b7280";

              return (
                <FlashBox key={symbol} $trend={tokenTrends[symbol] || null}>
                  <TokenCard>
                    <div className="line1">
                      <span>
                        <Dot $t={dotType as any} /> {symbol}
                      </span>
                      <span className="line1">
                        {Number(a.invested || 0).toFixed(2)} USDT
                      </span>
                    </div>
                    <div className="line2">
                      <SignValue value={v} suffix=" USDT" />
                      <SignValue value={Number(a.pnl_pct) || 0} suffix=" %" />
                    </div>
                  </TokenCard>
                </FlashBox>
              );
            })}
          </TokensWrap>
        </Block>
      </Layout>
    </Bar>
  );
}