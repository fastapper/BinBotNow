// src/hooks/useWsGlobal.ts
import { useEffect, useRef, useState } from "react";
import { wsManager } from "../api/WsManager";

export function useWsGlobal() {
  const [status, setStatus] = useState<any>(null);
  const [summary, setSummary] = useState<any>(() => {
    // 🧠 Recuperar último summary guardado (persistencia)
    try {
      const saved = localStorage.getItem("bot_summary_cache");
      return saved
        ? JSON.parse(saved)
        : { positions: { open: [], closed: [] }, balance: {} };
    } catch {
      return { positions: { open: [], closed: [] }, balance: {} };
    }
  });
  const [balance, setBalance] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [wsOnline, setWsOnline] = useState<boolean>(false);

  // 🔒 ref para evitar doble suscripción (StrictMode)
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return; // ⛔ evita segunda ejecución por StrictMode
    mounted.current = true;

    console.log("[useWsGlobal] 🔗 Subscribing shared WS channels");

    // STATUS
    const unsubStatus = wsManager.subscribe("status", (data: any) => {
      setStatus(data);
    });

    // SUMMARY
    const unsubSummary = wsManager.subscribe("summary", (data: any) => {
      try {
        if (!data) return;

        // 🔹 Recuperar lo anterior guardado
        const prev = summary || { positions: { open: [], closed: [] } };

        // 🔹 Función para fusionar posiciones sin duplicar
        const mergePositions = (newList: any[], oldList: any[]) => {
          const merged = [...oldList];
          newList.forEach((pos) => {
            const idx = merged.findIndex((p) => p.id === pos.id);
            if (idx >= 0) merged[idx] = { ...merged[idx], ...pos };
            else merged.push(pos);
          });
          return merged;
        };

        const newOpen = data.positions?.open || [];
        const newClosed = data.positions?.closed || [];

        const mergedOpen = mergePositions(newOpen, prev.positions.open).filter(
          (p) => p.status === "OPEN"
        );
        const mergedClosed = mergePositions(newClosed, prev.positions.closed).filter(
          (p) => p.status === "CLOSED"
        );

        const mergedSummary = {
          ...prev,
          ...data,
          positions: {
            open: mergedOpen,
            closed: mergedClosed,
          },
        };

        setSummary(mergedSummary);
        localStorage.setItem("bot_summary_cache", JSON.stringify(mergedSummary));
      } catch (err) {
        console.error("[useWsGlobal] Error merging summary:", err);
      }
    });

    // BALANCE
    const unsubBalance = wsManager.subscribe("balance", (data: any) => {
      setBalance(data);
    });

    // HEALTH
    const unsubHealth = wsManager.subscribe("health", (data: any) => {
      setHealth(data);
    });

    // 🧩 Monitor WS Online cada 2.5s
    const interval = setInterval(() => {
      const sockets = Object.values((wsManager as any).sockets || {});
      const open = sockets.some((s: WebSocket) => s.readyState === WebSocket.OPEN);
      setWsOnline(open);
    }, 2500);

    return () => {
      console.log("[useWsGlobal] 🧹 Unsubscribing shared WS channels");
      unsubStatus();
      unsubSummary();
      unsubBalance();
      unsubHealth();
      clearInterval(interval);
      mounted.current = false;
    };
  }, []);

  return { status, summary, balance, health, wsOnline };
}
