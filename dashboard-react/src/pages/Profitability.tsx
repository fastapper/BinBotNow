import styled from "styled-components";
import { Card, CardBody, CardHeader } from "../components/common/Card";
import EquityChart from "../components/EquityChart";
import DistributionPie from "../components/DistributionPie";
import OpenPositionsTable from "../components/OpenPositionsTable";
import ClosedOpsTable from "../components/ClosedOpsTable";
import { useMemo } from "react";
import { api } from "../api/client";
import { useWs } from "../context/WsProvider";

// ---------- styled blocks ----------
const Wrap = styled.div`
  padding: 18px;
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(12, 1fr);
  overflow-y: auto;
  max-height: calc(100vh - 80px);
`;

const Wide = styled(Card)`
  grid-column: span 12;
`;
const Third = styled(Card)`
  grid-column: span 12;
  @media (min-width: 1200px) {
    grid-column: span 4;
  }
`;
const TwoThirds = styled(Card)`
  grid-column: span 12;
  @media (min-width: 1200px) {
    grid-column: span 8;
  }
`;

const BalanceGrid = styled.div`
  display: grid;
  margin-top: 3px;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 8px;
  text-align: center;
`;

const BalanceBox = styled.div`
  background: ${({ theme }) => theme.colors.panelAlt};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.sm};
  padding: 8px;
  font-size: 1rem;
  strong {
    display: block;
    font-size: 1.2rem;
    margin-top: 3px;
  }
`;

const ResponsiveBody = styled(CardBody)`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`;

const ScrollableBody = styled(CardBody)`
  max-height: 300px;
  overflow-y: auto;
  table {
    font-size: 0.8rem;
    white-space: nowrap;
  }
`;

// ---------- main component ----------
export default function ProfitabilityScreen() {
  const { summary } = useWs();

  // ✅ Todo viene ya del WebSocket summary
  const data = summary?.data || {};
  const balance = data.balance || {};
  const stats = data.stats || {}; // ✅ antes se pedía por HTTP

  const openOps = useMemo(
    () =>
      (data.positions?.open || []).filter(
        (p: any) => Number(p.qty ?? 0) > 0
      ),
    [data]
  );
  const closedOps = useMemo(() => data.positions?.closed || [], [data]);

  const handleManualClose = async (symbol: string) => {
    console.log(`[ProfitabilityScreen] 🔥 Cierre manual solicitado para ${symbol}`);
    try {
      await api.closeSymbol(symbol);
    } catch (err: any) {
      console.error("Error cerrando posición manualmente:", err);
      alert("Error cerrando posición manualmente: " + err.message);
    }
  };

  return (
    <Wrap>
      {/* ---- BALANCE ---- */}
      <Wide>
        <CardHeader>Balance Overview</CardHeader>
        <CardBody>
          <BalanceGrid>
            <BalanceBox>
              Free USDT
              <strong>{balance?.free_usdt?.toFixed?.(2) || "0.00"} USDT</strong>
            </BalanceBox>
            <BalanceBox>
              Invested in Tokens
              <strong>{balance?.invested_usdt?.toFixed?.(2) || "0.00"} USDT</strong>
            </BalanceBox>
            <BalanceBox>
              Total Balance
              <strong>{balance?.total_usdt?.toFixed?.(2) || "0.00"} USDT</strong>
            </BalanceBox>
            <BalanceBox>
              Win Rate
              <strong>{stats.winrate_30d?.toFixed?.(1) ?? "0"}%</strong>
            </BalanceBox>
            <BalanceBox>
              24h Activity
              <strong>{stats.winrate_24h?.toFixed?.(1) ?? "0"}%</strong>
            </BalanceBox>
            <BalanceBox>
              1h Activity
              <strong>{stats.winrate_1h?.toFixed?.(1) ?? "0"}%</strong>
            </BalanceBox>
            <BalanceBox>
              Últimas 5 ops
              <strong>
                {stats.last_5_ops?.length
                  ? stats.last_5_ops.map((v: number, i: number) => (
                      <span
                        key={i}
                        style={{
                          color: v > 0 ? "green" : "red",
                          marginLeft: 4,
                        }}
                      >
                        {v > 0 ? "▲" : "▼"}
                      </span>
                    ))
                  : "-"}
              </strong>
            </BalanceBox>
          </BalanceGrid>
        </CardBody>
      </Wide>

      {/* ---- CHARTS ---- */}
      <TwoThirds>
        <CardHeader>Equity Curve</CardHeader>
        <ResponsiveBody>
          <div style={{ flex: 1, minHeight: 320 }}>
            <EquityChart />
          </div>
        </ResponsiveBody>
      </TwoThirds>

      <Third>
        <CardHeader>Portfolio Distribution</CardHeader>
        <ResponsiveBody>
          <DistributionPie />
        </ResponsiveBody>
      </Third>

      {/* ---- POSITIONS ---- */}
      <TwoThirds>
        <CardHeader>Open Positions</CardHeader>
        <ScrollableBody>
          <OpenPositionsTable
            positions={openOps}
            onClosed={handleManualClose}
          />
        </ScrollableBody>
      </TwoThirds>

      <Third>
        <CardHeader>Closed Trades</CardHeader>
        <ScrollableBody>
          <ClosedOpsTable positions={closedOps} />
        </ScrollableBody>
      </Third>
    </Wrap>
  );
}
