import styled from "styled-components";
import { Button } from "../common/Button";
import { useWs } from "../../context/WsProvider";
import SignValue from "../common/SignValue";
import { useNavigate } from "react-router-dom";
import { bus, EV_REFRESH_HARD } from "../../lib/bus";
import { api } from "../../api/client";
import { useState, useEffect, useMemo } from "react";

const Wrap = styled.div`
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
`;
const Header = styled.div`
  padding: 16px 14px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: grid;
  gap: 8px;
`;
const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  h1 {
    margin: 0;
    font-size: 18px;
    letter-spacing: 0.6px;
  }
`;
const StatusDot = styled.span<{ $ok?: boolean }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  background: ${({ $ok }) => ($ok ? "#22c55e" : "#ef4444")};
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15);
  transition: all 0.3s ease;
`;
const LivePill = styled.span<{ $ok?: boolean }>`
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ $ok }) => ($ok ? "#133a2a" : "#3a1212")};
  color: ${({ $ok }) => ($ok ? "#34d399" : "#f87171")};
  transition: all 0.3s ease;
`;
const Body = styled.div`
  padding: 14px 12px 18px;
  display: grid;
  gap: 16px;
`;
const Section = styled.section`
  background: ${({ theme }) => theme.colors.panel};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  overflow: hidden;
`;
const SectionHeader = styled.div`
  padding: 10px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  font-weight: 700;
  text-transform: uppercase;
  font-size: 0.85rem;
  text-align: left;
`;
const List = styled.div`
  display: grid;
  grid-template-columns: 1fr;
`;
const Item = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  &:first-child {
    border-top: 0;
  }
  small {
    color: ${({ theme }) => theme.colors.textSoft};
  }
`;
const ButtonGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  padding: 5px;
`;

export default function FixedDashboard({ activePath }: { activePath: string }) {
  const { status, summary, wsOnline } = useWs(); // ⬅️ ahora usamos wsOnline
  const nav = useNavigate();

  const [botState, setBotState] = useState<"RUNNING" | "PAUSED" | "STOPPED">("STOPPED");
  const [binanceOk, setBinanceOk] = useState(false);
  const [isTestnet, setIsTestnet] = useState(false);

  // 🔄 sincroniza con WS status
  useEffect(() => {
    if (!status) return;
    const ok = (status?.binance_ok ?? false) && wsOnline;
    setBinanceOk(ok);
    setIsTestnet(status?.env === "TESTNET");

    if (status?.bot_status) {
      setBotState(status.bot_status.toUpperCase());
    } else if (status?.live !== undefined) {
      setBotState(status.live ? "RUNNING" : "PAUSED");
    }
  }, [status, wsOnline]);

  const raw = summary || {};
  const data = raw.data || {};
  const bal = data.balance || raw.balance || {};
  const positions = data.positions?.open || raw.positions?.open || [];
  const freeBalance = Number(bal.free_usdt ?? 0);

  const pnlAgg = useMemo(() => {
    let invested = 0;
    let current = 0;

    for (const p of positions) {
      const qty = Number(p.qty) || 0;
      const entry = Number(p.entry_price) || 0;
      const mark =
        Number(p.mark_price) ||
        Number(p.last_price) ||
        Number(p.price) ||
        entry;
      invested += qty * entry;
      current += qty * mark;
    }

    const pnl_usdt = current - invested;
    const pnl_pct = invested > 0 ? (pnl_usdt / invested) * 100 : 0;
    const total = freeBalance + current;

    return { invested, current, pnl_usdt, pnl_pct, total, free: freeBalance };
  }, [positions, freeBalance]);

  const profitPct = {
    "1h": (pnlAgg.pnl_pct / 24).toFixed(2),
    "24h": pnlAgg.pnl_pct.toFixed(2),
    "7d": (pnlAgg.pnl_pct * 7).toFixed(2),
    "30d": (pnlAgg.pnl_pct * 30).toFixed(2),
  };
  const profitBalance = {
    "1h": (pnlAgg.pnl_usdt / 24).toFixed(2),
    "24h": pnlAgg.pnl_usdt.toFixed(2),
    "30d": (pnlAgg.pnl_usdt * 30).toFixed(2),
  };
  const projected = {
    "1h": pnlAgg.total + Number(profitBalance["1h"]),
    "24h": pnlAgg.total + Number(profitBalance["24h"]),
    "7d": pnlAgg.total + Number(profitBalance["30d"]) / 4,
    "30d": pnlAgg.total + Number(profitBalance["30d"]),
  };

  const onSellAll = async () => {
    if (!window.confirm("¿Cerrar TODAS las posiciones spot abiertas?")) return;

    for (const pos of positions) {
      const { symbol, qty, mark_price } = pos;
      if (!qty || qty <= 0) continue;
      const notional = qty * mark_price;
      if (notional < 1) continue;

      try {
        const resp = await fetch(
          `http://127.0.0.1:8080/api/binance/sell/${symbol}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ qty }),
          }
        );
        const data = await resp.json();
        if (data?.error)
          console.error(`Error vendiendo ${symbol}: ${data.error}`);
      } catch (err) {
        console.error(`Error al cerrar ${symbol}:`, err);
      }
    }
    alert("Venta masiva completada.");
  };

  const onToggleBot = async () => {
    try {
      if (botState === "RUNNING") {
        await api.pauseBot();
        setBotState("PAUSED");
        alert("Bot pausado.");
      } else {
        await api.startBot();
        setBotState("RUNNING");
        alert("Bot iniciado.");
      }
      bus.emit(EV_REFRESH_HARD);
    } catch (err) {
      console.error("Error al cambiar estado del bot:", err);
    }
  };

  const onConvertDust = async () => {
    if (!window.confirm("¿Convertir todos los pequeños saldos (dust) a BNB?"))
      return;

    try {
      const resp = await fetch(
        "http://127.0.0.1:8080/api/binance/convert_dust",
        { method: "POST" }
      );
      const data = await resp.json();
      if (data?.error) {
        alert(`Error: ${data.error}`);
      } else {
        alert(`Convertido a BNB: ${data.converted.join(", ")}`);
      }
    } catch (err) {
      alert("Error al convertir dust.");
    }
  };

  const isRunning = botState === "RUNNING";

  return (
    <Wrap>
      <Header>
        <TitleRow>
          <h1>BinBotNow</h1>
          <StatusDot $ok={binanceOk} /> {/* 🔹 usa WS + binance_ok */}
          <LivePill $ok={isRunning}>{botState}</LivePill>
          <div
            style={{
              marginLeft: "auto",
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              border: "1px solid #1f2937",
              background: isTestnet ? "#0f2f1f" : "#3a1212",
              color: isTestnet ? "#22c55e" : "#ef4444",
            }}
          >
            {isTestnet ? "TESTNET" : "REAL"}
          </div>
        </TitleRow>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 10,
          }}
        >
          <div className="bal" style={{ fontSize: 24, fontWeight: 700 }}>
            <SignValue value={pnlAgg.total} suffix=" USDT" />
          </div>
        </div>
        <div style={{ fontSize: 13, color: "#aaa" }}>
          Free: <SignValue value={pnlAgg.free} suffix=" USDT" /> | Invested:{" "}
          <SignValue value={pnlAgg.invested} suffix=" USDT" />
        </div>

        <div>
          <ButtonGrid>
            <Button $variant="danger" $bold onClick={onSellAll}>
              SELL ALL
            </Button>
            <Button
              $variant={isRunning ? "warning" : "success"}
              $bold
              onClick={onToggleBot}
            >
              {isRunning ? "PAUSE BOT" : "START BOT"}
            </Button>
            <Button onClick={() => nav("/profitability")}>PROFITABILITY</Button>
            <Button onClick={() => nav("/config")}>CONFIG</Button>
            <Button onClick={() => nav("/dashboard")}>MAIN</Button>
            <Button $variant="ghost" onClick={onConvertDust}>
              CONVERT DUST
            </Button>
          </ButtonGrid>
        </div>
      </Header>

      <Body>
        <Section>
          <SectionHeader>Profitability</SectionHeader>
          <List>
            <Item>
              <small>Last 1hr</small>
              <SignValue value={profitPct["1h"]} suffix=" %" />
            </Item>
            <Item>
              <small>Last 24hr</small>
              <SignValue value={profitPct["24h"]} suffix=" %" />
            </Item>
            <Item>
              <small>Last 7 days</small>
              <SignValue value={profitPct["7d"]} suffix=" %" />
            </Item>
            <Item>
              <small>Last 30 days</small>
              <SignValue value={profitPct["30d"]} suffix=" %" />
            </Item>
          </List>
        </Section>

        <Section>
          <SectionHeader>Balance Change</SectionHeader>
          <List>
            <Item>
              <small>Last 1hr</small>
              <SignValue value={profitBalance["1h"]} suffix=" USDT" />
            </Item>
            <Item>
              <small>Last 24hr</small>
              <SignValue value={profitBalance["24h"]} suffix=" USDT" />
            </Item>
            <Item>
              <small>Last 30 days</small>
              <SignValue value={profitBalance["30d"]} suffix=" USDT" />
            </Item>
          </List>
        </Section>

        <Section>
          <SectionHeader>Projected balance in 30 Days</SectionHeader>
          <List>
            <Item>
              <small>Current Balance</small>
              <SignValue value={pnlAgg.total} suffix=" USDT" />
            </Item>
            <Item>
              <small>Based on last 1hr</small>
              <SignValue value={projected["1h"]} suffix=" USDT" />
            </Item>
            <Item>
              <small>Based on last 24hr</small>
              <SignValue value={projected["24h"]} suffix=" USDT" />
            </Item>
            <Item>
              <small>Based on last 7 days</small>
              <SignValue value={projected["7d"]} suffix=" USDT" />
            </Item>
            <Item>
              <small>Based on last 30 days</small>
              <SignValue value={projected["30d"]} suffix=" USDT" />
            </Item>
          </List>
        </Section>
      </Body>
    </Wrap>
  );
}
