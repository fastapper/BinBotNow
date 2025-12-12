//src/pages/EquityDashboard.tsx

import styled from "styled-components";
import { Card, CardBody, CardHeader } from "../components/common/Card";
import EquityChart from "../components/EquityChart";
import EquityCalendar from "../components/charts/EquityCalendar";

const Wrap = styled.div`
  padding: 18px;
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(12, 1fr);
  overflow-y: auto;
  max-height: calc(100vh - 80px);
`;

const Full = styled(Card)`
  grid-column: span 12;
`;

const ResponsiveBody = styled(CardBody)`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
`;

export default function EquityDashboard() {
    return (
        <Wrap>
            <Full>
                <CardHeader>Equity Curve</CardHeader>
                <ResponsiveBody>
                    <div style={{ flex: 1, minHeight: 320 }}>
                        <EquityChart />
                    </div>
                </ResponsiveBody>
            </Full>

            <Full>
                <CardHeader>Rentabilidad Diaria (GitHub Calendar)</CardHeader>
                <ResponsiveBody>
                    <EquityCalendar />
                </ResponsiveBody>
            </Full>
        </Wrap>
    );
}
