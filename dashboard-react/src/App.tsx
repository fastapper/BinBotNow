import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import styled, { ThemeProvider } from "styled-components";
import { GlobalStyle } from "./styles/GlobalStyle";
import { theme } from "./theme";
import FixedDashboard from "./components/layout/FixedDashboard";
import TopBar from "./components/layout/TopBar";
import MainDashboard from "./pages/MainDashboard";
import ProfitabilityPage from "./pages/Profitability";
import ConfigTradingPage from "./pages/ConfigTrading";
import ErrorBoundary from "./ErrorBoundary";
import { WsProvider } from "./context/WsProvider"; // ✅ reemplaza ConnectionGuard

// ---------- styled layout ----------
const Shell = styled.div`
  display: grid;
  grid-template-columns: 320px 1fr;
  height: 100vh;
  overflow: hidden;
`;

const Main = styled.main`
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
`;

// ---------- router frame ----------
function Frame() {
  const loc = useLocation();
  return (
    <Shell>
      <FixedDashboard activePath={loc.pathname} />
      <Main>
        <TopBar />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<MainDashboard />} />
          <Route path="/profitability" element={<ProfitabilityPage />} />
          <Route path="/config" element={<ConfigTradingPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Main>
    </Shell>
  );
}

// ---------- root component ----------
export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <BrowserRouter>
        <ErrorBoundary>
          <WsProvider>
            <Frame />
          </WsProvider>
        </ErrorBoundary>
      </BrowserRouter>
    </ThemeProvider>
  );
}
