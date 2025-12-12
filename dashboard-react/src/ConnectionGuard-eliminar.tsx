import { useEffect, useRef, useState } from "react";
import { api } from "./api/client";

export default function ConnectionGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const [offline, setOffline] = useState(false);
  const failStreak = useRef(0);
  const okStreak = useRef(0);
  const backoff = useRef(1500); // ms
  const timer = useRef<any>(null);
  const alive = useRef(true);
  const running = useRef(false); // ✅ evita solapamiento

  useEffect(() => {
    alive.current = true;

    const tick = async () => {
      if (!alive.current || running.current) return; // evita duplicación
      running.current = true;

      try {
        const result = await api.health(); // true / false / null
        if (result === true) {
          okStreak.current += 1;
          failStreak.current = 0;
          if (offline && okStreak.current >= 2) setOffline(false);
          if (!offline) setOffline(false);
          backoff.current = 1500; // reset backoff
        } else if (result === false) {
          failStreak.current += 1;
          okStreak.current = 0;
          if (!offline && failStreak.current >= 3) setOffline(true);
          backoff.current = Math.min(backoff.current * 1.6, 10000);
        } else {
          // null = cancelado → no contamos como error
          console.debug("[ConnectionGuard] ⏸️ Health check cancelado");
        }
      } catch (err) {
        console.warn("[ConnectionGuard] ⚠️ Error inesperado:", err);
        failStreak.current += 1;
        okStreak.current = 0;
        if (!offline && failStreak.current >= 3) setOffline(true);
        backoff.current = Math.min(backoff.current * 1.6, 10000);
      } finally {
        running.current = false;
        if (alive.current) {
          clearTimeout(timer.current);
          timer.current = setTimeout(tick, backoff.current);
        }
      }
    };

    tick();
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (offline) {
    return (
      <div
        style={{
          height: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0b1220",
          color: "#e5e7eb",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 520 }}>
          <div
            style={{
              fontSize: 24,
              fontWeight: 800,
              marginBottom: 8,
            }}
          >
            No connection to backend
          </div>
          <div style={{ opacity: 0.8, marginBottom: 16 }}>
            Verifica que el backend responde en{" "}
            <code>http://localhost:8080/health</code>
          </div>
          <div
            style={{
              fontFamily: "monospace",
              opacity: 0.8,
              marginBottom: 10,
            }}
          >
            VITE_BACKEND_URL:{" "}
            {import.meta.env.VITE_BACKEND_URL ||
              "(default http://localhost:8080)"}
          </div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            Intentando reconectar… (backoff dinámico)
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
