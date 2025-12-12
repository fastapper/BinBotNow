const BASE = "http://localhost:8080";

export async function fetchMetrics() {
  const r = await fetch(`${BASE}/metrics`);
  return r.json();
}

export async function fetchPositions() {
  const r = await fetch(`${BASE}/positions`);
  return r.json();
}

export async function fetchClosedOrders(limit = 100) {
  const r = await fetch(`${BASE}/orders/closed?limit=${limit}`);
  return r.json();
}

export async function fetchEquity(days = 30) {
  const r = await fetch(`${BASE}/equity?days=${days}`);
  return r.json();
}

export async function fetchTickers(symbols = []) {
  const params = symbols.map(s => `symbols=${encodeURIComponent(s)}`).join("&");
  const r = await fetch(`${BASE}/tickers?${params}`);
  return r.json();
}
