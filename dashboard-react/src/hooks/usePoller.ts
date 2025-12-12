import { useEffect, useRef } from 'react'

type Task = () => Promise<void> | void

export function usePoller(tasks: Task[], intervalMs: number, opts?: {
  immediate?: boolean
  jitterPct?: number      // 0..0.5 => agrega +-jitter al intervalo
  enabled?: boolean
}) {
  const { immediate = true, jitterPct = 0.1, enabled = true } = opts || {}
  const alive = useRef(true)
  const timer = useRef<any>(null)
  const running = useRef(false)

  useEffect(() => {
    alive.current = true

    const base = Math.max(500, intervalMs)
    const jitter = () => {
      const j = Math.max(0, Math.min(0.5, jitterPct))
      const delta = base * j
      return base + (Math.random() * 2 * delta - delta)
    }

    const step = async () => {
      if (!alive.current || !enabled) return schedule()
      if (document.hidden) return schedule() // pausa en background
      if (running.current) return schedule()
      running.current = true
      try {
        for (const t of tasks) {
          if (!alive.current) break
          try { await t() } catch (e) { /* swallow por estabilidad */ }
        }
      } finally {
        running.current = false
        schedule()
      }
    }

    const schedule = () => {
      if (!alive.current) return
      clearTimeout(timer.current)
      timer.current = setTimeout(step, jitter())
    }

    if (immediate) step()
    else schedule()

    return () => {
      alive.current = false
      clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, enabled, /* no depend tasks para no redefinir timers */])
}
