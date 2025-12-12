// dashboard-react/src/api/index.js
const BASE =
  import.meta.env.VITE_BACKEND_URL?.replace(/\/+$/, "") || "http://localhost:8080";

async function get(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

export async function fetchMetrics() {
  // { balance_usdt, invested_usdt, pnl_realized_usdt, equity_usdt }
  return get("/metrics");
}

export async function fetchEquity(days = 30) {
  // { days, series: [] }
  return get(`/equity?days=${days}`);
}

export async function fetchPositions() {
  // [ { id, symbol, qty, entry_price, sl_price, tp_price, last_price, ... } ]
  return get("/positions");
}

export async function fetchClosedOrders(limit = 50) {
  // [ { id, symbol, side, qty, entry_price, exit_price, pnl, ... } ]
  return get(`/orders/closed?limit=${limit}`);
}

export async function fetchTickers(symbols = []) {
  if (!symbols.length) return {};
  const q = symbols.map(s => `symbols=${encodeURIComponent(s)}`).join("&");
  return get(`/tickers?${q}`);
}

export async function fetchHealth() {
  return get("/health");
}
