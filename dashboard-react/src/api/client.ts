// ==========================================================
// ✅ client.ts — API client robusto y sin bloqueos
// ==========================================================
import axios from "axios";

// 🌐 Base URL del backend
export const API_BASE = "http://127.0.0.1:8080";
console.info("[API] BASE =", API_BASE);

// ---------------------------------------
// 🧩 Función utilitaria de logging
// ---------------------------------------
const log = (...args: any[]) => console.debug("[API]", ...args);
const logWarn = (...args: any[]) => console.warn("[API]", ...args);
const logErr = (...args: any[]) => console.error("[API]", ...args);

// ---------------------------------------
// 🧠 Fetch JSON con timeout + reintento
// ---------------------------------------
async function fetchWithTimeout<T>(
  url: string,
  timeoutMs = 8000,
  retries = 0
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await axios.get<T>(url, { timeout: timeoutMs });
      return response.data;
    } catch (err: any) {
      const isTimeout =
        err.code === "ECONNABORTED" || err.message.includes("timeout");
      if (isTimeout) {
        logWarn("⏱️ Timeout alcanzado:", url);
      } else {
        logErr("❌ Error HTTP:", url, err.message);
      }

      if (attempt < retries) {
        const delay = 500 * (attempt + 1);
        logWarn(`Reintentando en ${delay} ms (${attempt + 1}/${retries})`);
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error("Max retries reached");
}

// ---------------------------------------
// 💡 GET JSON helper
// ---------------------------------------
export async function getJSON<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  return await fetchWithTimeout<T>(url);
}

// ---------------------------------------
// 🩺 Health check con AbortController
// ---------------------------------------
let lastController: AbortController | null = null;
let healthLock = false;

export async function safeHealthCheck(): Promise<boolean | null> {
  if (healthLock) return null; // evita overlap
  healthLock = true;

  if (lastController) {
    lastController.abort(); // cancela request anterior
  }
  lastController = new AbortController();

  try {
    const response = await axios.get(`${API_BASE}/health`, {
      signal: lastController.signal,
      timeout: 5000, // tiempo prudente
    });
    log("✅ Health OK:", response.status);
    return true;
  } catch (error: any) {
    if (axios.isCancel(error)) {
      logWarn("⏸️ Health check cancelado (solapado)");
      return null;
    }
    if (error.code === "ECONNABORTED") {
      logWarn("⏱️ Timeout en health check");
      return false;
    }
    logErr("❌ Health check error:", error.message);
    return false;
  } finally {
    healthLock = false;
  }
}

// ---------------------------------------
// ⚙️ Export principal
// ---------------------------------------
export const api = {
  getJSON,
  health: safeHealthCheck,
};

export default api;
