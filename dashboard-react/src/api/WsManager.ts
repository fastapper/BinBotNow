// ✅ FIX 2.2 — WsManager.ts optimizado con backoff progresivo y estabilidad extendida

type Listener = (data: any) => void;

class WsManager {
  private sockets: Record<string, WebSocket> = {};
  private listeners: Record<string, Listener[]> = {};
  private closeTimers: Record<string, any> = {};
  private reconnectTimers: Record<string, any> = {};
  private lastConnect: Record<string, number> = {};
  private manualClose: Set<string> = new Set();
  private reconnectAttempts: Record<string, number> = {};

  /** 🔑 Genera una clave única para cada canal */
  private getKey(channel: string, query?: string) {
    return query ? `${channel}?${query}` : channel;
  }

  /** 🚀 Crea o asegura conexión estable */
  private ensure(key: string, url: string) {
    const existing = this.sockets[key];
    const now = Date.now();

    // ⚙️ Evita reconexiones múltiples en menos de 1.2 s
    if (this.lastConnect[key] && now - this.lastConnect[key] < 1200) {
      console.warn(`%c[WS] ⚠️ Skip duplicate connect: ${key}`, "color: orange;");
      return;
    }
    this.lastConnect[key] = now;

    if (
      existing &&
      (existing.readyState === WebSocket.OPEN ||
        existing.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    try {
      const ws = new WebSocket(url);
      this.sockets[key] = ws;
      this.manualClose.delete(key);
      this.reconnectAttempts[key] = 0; // reset
      clearTimeout(this.reconnectTimers[key]);

      ws.onopen = () => {
        console.log(`%c[WS] ✅ Open: ${url}`, "color: limegreen;");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          (this.listeners[key] || []).forEach((cb) => cb(data));
        } catch (e) {
          console.error(`%c[WS ${key}] ❌ JSON parse error:`, "color: red;", e);
        }
      };

      ws.onclose = (ev) => {
        console.log(`%c[WS] 🔌 Closed: ${key}`, "color: gray;");
        delete this.sockets[key];

        // 🧹 Limpieza de listeners huérfanos
        if (!this.listeners[key] || this.listeners[key].length === 0) {
          delete this.listeners[key];
        }

        // 🚫 Evitar reconexión si fue cierre manual
        if (this.manualClose.has(key)) {
          console.log(`%c[WS] 🙅 Manual close: ${key}, no retry`, "color: salmon;");
          this.manualClose.delete(key);
          return;
        }

        // 🔁 Intentar reconexión solo si aún hay listeners
        const hasActiveListeners =
          this.listeners[key] && this.listeners[key].length > 0;
        if (hasActiveListeners) {
          const attempt = (this.reconnectAttempts[key] || 0) + 1;
          this.reconnectAttempts[key] = attempt;

          // ⏳ Aumenta el backoff progresivamente hasta 10 s
          const delay = Math.min(3000 * attempt, 10000);
          console.warn(
            `%c[WS] 🔁 Unexpected close — retry #${attempt} in ${delay} ms (${key})`,
            "color: gold;"
          );
          clearTimeout(this.reconnectTimers[key]);
          this.reconnectTimers[key] = setTimeout(() => this.ensure(key, url), delay);
        } else {
          console.warn(
            `%c[WS] ⚠️ Closed with no active listeners: ${key}`,
            "color: crimson;"
          );
        }
      };

      ws.onerror = (err) => {
        console.error(`%c[WS ${key}] ❌ Error:`, "color: red;", err);
        try {
          ws.close();
        } catch {}
      };
    } catch (e) {
      console.error(`%c[WS] ❌ Failed to connect ${key}:`, "color: red;", e);
      this.scheduleReconnect(key, url);
    }
  }

  /** 🔁 Reintento seguro con backoff si falla connect */
  private scheduleReconnect(key: string, url: string) {
    if (this.manualClose.has(key)) return; // no reconectar manualmente cerrados

    const attempt = (this.reconnectAttempts[key] || 0) + 1;
    this.reconnectAttempts[key] = attempt;
    const delay = Math.min(3000 * attempt, 10000);
    console.warn(
      `%c[WS] ♻️ Reconnecting ${key} in ${delay} ms (attempt ${attempt})`,
      "color: orange;"
    );

    clearTimeout(this.reconnectTimers[key]);
    this.reconnectTimers[key] = setTimeout(() => this.ensure(key, url), delay);
  }

  /** ➕ Suscribir a un canal */
  subscribe(channel: string, cb: Listener, query?: string) {
    const key = this.getKey(channel, query);
    console.log(`%c[WS] 🔗 Subscribe: ${key}`, "color: cyan;");

    if (!this.listeners[key]) this.listeners[key] = [];
    if (!this.listeners[key].includes(cb)) {
      this.listeners[key].push(cb);
    }

    const url = query
      ? `ws://127.0.0.1:8080/ws/${channel}?symbols=${query}`
      : `ws://127.0.0.1:8080/ws/${channel}`;

    this.ensure(key, url);
    return () => this.unsubscribe(channel, cb, query);
  }

  /** ➖ Desuscribir con limpieza segura */
  unsubscribe(channel: string, cb: Listener, query?: string) {
    const key = this.getKey(channel, query);
    console.log(`%c[WS] 🧹 Unsubscribe: ${key}`, "color: violet;");

    const listeners = this.listeners[key];
    if (!listeners) return;
    this.listeners[key] = listeners.filter((fn) => fn !== cb);

    if (this.listeners[key].length > 0) return; // aún hay otros suscriptores

    const ws = this.sockets[key];
    if (!ws) return;

    // 🔒 Marcar cierre manual antes del cierre físico
    this.manualClose.add(key);

    clearTimeout(this.closeTimers[key]);
    this.closeTimers[key] = setTimeout(() => {
      const stillEmpty = !this.listeners[key] || this.listeners[key].length === 0;
      if (!stillEmpty) return;

      console.log(`%c[WS] ⛔ No more listeners, closing: ${key}`, "color: orange;");
      try {
        ws.close();
      } catch (err) {
        console.error(`[WS] ❗️ Error on manual close: ${key}`, err);
      }

      delete this.sockets[key];
      delete this.listeners[key];
      clearTimeout(this.reconnectTimers[key]);
    }, 800); // 🔄 leve delay más corto y consistente
  }
}

export const wsManager = new WsManager();
