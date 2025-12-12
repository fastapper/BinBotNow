// src/pages/MainDashboard.tsx

import styled from 'styled-components';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Card, CardBody, CardHeader } from '../components/common/Card';
import CandleChart from '../components/charts/CandleChart';
import SignValue from '../components/common/SignValue';
import { useTradingConfigs } from '../context/TradingConfigContext';
import { useWs } from '../context/WsProvider';
import { useWsCandles } from '../hooks/useWsCandles';
import { wsManager } from "../api/WsManager";

// ---------- styled ----------
const Page = styled.div`padding: 5px; display: grid; gap: 10px;`;
const Ribbon = styled.div`overflow: hidden;`;
const Track = styled.div`display: flex; gap: 16px; overflow-x: auto;`;
const Tile = styled(Card)`flex: 0 0 700px; scroll-snap-align: start; display: grid; grid-template-rows: auto 1fr;`;
const HeaderInfo = styled.div`display: grid; gap: 5px;`;
const TopMetrics = styled.div`
  display: grid;
  grid-template-columns: repeat(4, auto) 1fr;
  gap: 15px;
  align-items: center;
  background: #0b2436;
  border: 1px solid #163247;
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 6px 8px;
  .kv { font-size: .90rem; font-weight: 500; }
  .kv small { color: #9ca3af; margin-right: 6px; }
  .val { font-weight: 500; }
`;
const SecondRow = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  div {
    background: #0f1524;
    border: 1px solid #1f2937;
    border-radius: 6px;
    padding: 5px 5px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 500;
    font-size: 0.95rem;
    line-height: 1.2;
  }
  small { color: #9ca3af; font-size: 0.75rem; }
`;
const PairHeader = styled.div<{ $type: 'BUY'|'SELL'|'KEEP' }>`
  display: flex; align-items: center; justify-content: space-between;
  .left { font-weight: 700; }
  .right { display: flex; gap: 6px; align-items: center; }
  .flag, .method {
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 6px;
    font-size: 0.9rem;
    border: 1px solid ${({ theme }) => theme.colors.border};
  }
  .flag {
    background: ${({ $type }) => $type === 'BUY' ? '#0f2f1f' : $type === 'SELL' ? '#3a1212' : '#222'};
    color: ${({ $type }) => $type === 'BUY' ? '#22c55e' : $type === 'SELL' ? '#ef4444' : '#9ca3af'};
  }
  .method {
    background: #11324a;
    color: #9ca3af;
  }
`;
const ChartFrame = styled.div`
  margin-top: 8px;
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  height: 750px;
  padding: 2px;
  overflow: hidden;
  display: flex; align-items: left; justify-content: left;
`;
const IntervalSelector = styled.div`
  display: flex; gap: 6px; margin-left: 8px;
  button {
    background: transparent;
    border: none;
    padding: 0;
    font-size: 0.85rem;
    color: #9ca3af;
    cursor: pointer;
  }
  button.active {
    color: #1d4ed8;
    font-weight: 600;
  }
`;

type PairFlag = 'BUY' | 'SELL' | 'KEEP';

export default function MainDashboard() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [cards, setCards] = useState<Record<string, any>>({});
  const [intervals, setIntervals] = useState<Record<string, string>>({});
  const [wsOnline, setWsOnline] = useState(true);

  const { configs } = useTradingConfigs();
  const { summary } = useWs(); // ✅ Asegúrate de tener esto

  const symbols = useMemo(() => summary?.symbols || [], [summary]);
  const statsMap = useMemo(() => summary?.profitability_stats || {}, [summary]);

  // ✅ PnL real desde positions.open
  const openPositionsMap = useMemo(() => {
    const map: Record<string, {
      invested: number;
      pnl: number;
      pnl_pct: number;
      count: number;
    }> = {};

    if (summary?.positions?.open?.length) {
      for (const pos of summary.positions.open) {
        const sym = pos.symbol;
        if (!map[sym]) {
          map[sym] = {
            invested: 0,
            pnl: 0,
            pnl_pct: 0,
            count: 0
          };
        }

        map[sym].invested += pos.invested_usdt ?? 0;
        map[sym].pnl += pos.pnl_usdt ?? 0;
        map[sym].count += 1;
      }

      for (const sym of Object.keys(map)) {
        const inv = map[sym].invested;
        map[sym].pnl_pct = inv > 0 ? (map[sym].pnl / inv) * 100 : 0;
      }
    }

    return map;
  }, [summary]);


  const handleCandles = useCallback((data: any) => {
    console.log("[MainDashboard] 📩 handleCandles recibido:", data);
    const updates: Record<string, any> = {};
    if (data.type === "candles" && Array.isArray(data.data)) {
      data.data.forEach((entry: any) => {
        if (entry.symbol && entry.candles) {
          updates[entry.symbol] = {
            last: entry.last,
            candles: entry.candles,
            ema20: entry.ema20,
            rsi14: entry.rsi14,
            macd: entry.macd,
            signal: entry.signal
          };
        }
      });
    } else if (data.symbol && data.candles) {
      updates[data.symbol] = {
        last: data.last,
        candles: data.candles,
        ema20: data.ema20,
        rsi14: data.rsi14,
        macd: data.macd,
        signal: data.signal
      };
    }

    if (Object.keys(updates).length > 0) {
      setCards(prev => {
        const merged = { ...prev };
        Object.keys(updates).forEach(sym => {
          merged[sym] = { ...(prev[sym] || {}), ...updates[sym] };
        });
        return merged;
      });
    }
  }, []);

  useWsCandles({ symbols, intervals, onData: handleCandles });

  // WS ONLINE CHECK
  useEffect(() => {
    const interval = setInterval(() => {
      const sockets = Object.values((wsManager as any).sockets || {});
      const online = sockets.some((s: WebSocket) => s.readyState === WebSocket.OPEN);
      setWsOnline(online);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Scroll visual
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = Math.max(1, el.scrollWidth - el.clientWidth);
      setScroll(Math.round((el.scrollLeft / max) * 100));
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const onRange = (n: number) => {
    const el = trackRef.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    el.scrollTo({ left: (n / 100) * max, behavior: "smooth" });
    setScroll(n);
  };

  const getInterval = (sym: string) => intervals[sym] || "1m";
  const pretty = (n: number) => n?.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const flagFor = (last: number, ema20: number): PairFlag => {
    if (last > ema20 * 1.002) return "BUY";
    if (last < ema20 * 0.998) return "SELL";
    return "KEEP";
  };

  return (
    <Page>
      <Ribbon>
        <Track ref={trackRef}>
          {symbols.map(sym => {
            const d = cards[sym];
            const last = Number(d?.last ?? 0);
            const ema20 = Number(d?.ema20?.at(-1)?.y ?? last);
            const pf: PairFlag = flagFor(last, ema20);
            const label = sym.replace("USDT", "") + "-USDT";
            const stats = openPositionsMap[sym] || {};
            const method = configs[sym]?.method || "AI";

            return (
              <Tile key={sym}>
                <CardHeader>
                  <PairHeader $type={pf}>
                    <div className="left">{label}</div>
                    <div className="right">
                      <div className="flag">{pf}</div>
                      <div className="method"><b>{method}</b></div>
                      <button style={{
                          background: "#065f46",
                          color: "#fff",
                          border: "none",
                          borderRadius: "6px",
                          padding: "2px 8px",
                          cursor: "pointer",
                          fontSize: "0.8rem",
                        }} onClick={async () => {
                        if (!window.confirm(`¿Comprar ${sym} por 50 USDT?`)) return;
                        const resp = await fetch(`http://127.0.0.1:8080/api/binance/buy/${sym}?amount=50`, { method: "POST" });
                        const data = await resp.json();
                        if (data.error) alert("❌ " + data.error);
                        else alert(`✅ ${data.symbol} comprado por ${data.usdt_spent} USDT @ ${data.avg_price.toFixed(4)}`);
                      }}>
                        Buy
                      </button>
                      <IntervalSelector>
                        {["1m", "5m", "15m", "30m", "1h", "4h", "12h", "1d"].map(i =>
                          <button key={i}
                            className={getInterval(sym) === i ? "active" : ""}
                            onClick={() => setIntervals(prev => ({ ...prev, [sym]: i }))}>
                            {i}
                          </button>
                        )}
                      </IntervalSelector>
                      <div style={{ marginLeft: 8, fontSize: 12, color: wsOnline ? "#22c55e" : "#ef4444" }}>
                        {wsOnline ? "WS ONLINE" : "WS OFFLINE"}
                      </div>
                    </div>
                  </PairHeader>
                </CardHeader>

                <CardBody>
                  <HeaderInfo>
                    <SecondRow>
                      <div className="kv"><small>Price</small><span className="val">{pretty(last)}</span></div>
                      <div className="kv"><small>EMA</small><span className="val">{pretty(ema20)}</span></div>
                      <div className="kv"><small>RSI</small><span className="val">{pretty(d?.rsi14?.at(-1)?.y ?? 50)}</span></div>
                      <div className="kv"><small>MACD</small><span className="val"><SignValue value={d?.macd?.at(-1)?.y ?? 0} /></span></div>
                    </SecondRow>
                    <SecondRow>
                      <div><small>Acc.Profit</small><SignValue value={stats.pnl || 0} suffix=" USDT" /></div>
                      <div><small>PnL%</small><SignValue value={stats.pnl_pct || 0} suffix=" %" /></div>
                      <div><small>Open Ops</small><span>{stats.count || 0}</span></div>
                      <div><small>Invested</small><SignValue value={stats.invested || 0} suffix=" USDT" /></div>
                    </SecondRow>
                  </HeaderInfo>
                  <ChartFrame>
                    {d?.candles
                      ? <CandleChart
                          height={500} width={500}
                          candles={d.candles}
                          ema20={d.ema20}
                          rsi14={d.rsi14}
                          macd={d.macd}
                          signal={d.signal} />
                      : <div style={{ color: '#9ca3af' }}>Loading…</div>}
                  </ChartFrame>
                </CardBody>
              </Tile>
            );
          })}
        </Track>
      </Ribbon>
    </Page>
  );
}
