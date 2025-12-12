import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "styled-components";
import { theme } from "./theme";
import { GlobalStyle } from "./styles/GlobalStyle";
import { TradingConfigProvider } from "./context/TradingConfigContext";
import { WsProvider } from "./context/WsProvider";

// ⚙️ Producción estable — sin React.StrictMode ni duplicación de Router
const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <WsProvider>
    <TradingConfigProvider>
      <ThemeProvider theme={theme}>
        <GlobalStyle />
        <App />
      </ThemeProvider>
    </TradingConfigProvider>
  </WsProvider>
);
