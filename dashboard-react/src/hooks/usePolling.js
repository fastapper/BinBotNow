// dashboard-react/src/hooks/usePolling.js
import { useEffect, useRef, useState } from "react";

export function usePolling(fetcher, intervalMs = 2000, deps = []) {
  const [data, setData] = useState(null);
  const timer = useRef();

  useEffect(() => {
    let stopped = false;

    async function tick() {
      try {
        const result = await fetcher();
        if (!stopped) setData(result);
      } catch (e) {
        // opcional: console.error(e);
      }
      timer.current = setTimeout(tick, intervalMs);
    }

    tick();

    return () => {
      stopped = true;
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps); // control fino fuera

  return data;
}
