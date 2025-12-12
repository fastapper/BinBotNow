// src/components/EquityChart.tsx
import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
} from "recharts"

type EquityPoint = {
  ts: string
  free: number
  invested: number
  total: number
}

const RANGES = [
  { value: "1h", label: "Última 1h" },
  { value: "6h", label: "Últimas 6h" },
  { value: "12h", label: "Últimas 12h" },
  { value: "24h", label: "Últimas 24h" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "90d", label: "Últimos 60 días" },
  { value: "6m", label: "Últimos 6 meses" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "all", label: "Todos" },
] as const

const LS_KEY = "equitychart:v3"

const TwoLineTimeTick: React.FC<{ x?: number; y?: number; payload?: { value: number } }> = ({
  x = 0,
  y = 0,
  payload,
}) => {
  const t = payload?.value ?? 0
  const d = new Date(t)
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  const mon = String(d.getMonth() + 1).padStart(2, "0")
  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fontSize={11} fill="#9CA3AF">
        <tspan x={0} dy={-2}>{`${hh}.${mm}`}</tspan>
        <tspan x={0} dy={14} fontWeight={600} fill="#D1D5DB">{`${day}.${mon}`}</tspan>
      </text>
    </g>
  )
}

function computeAutoYDomain(
  rows: Array<{ free: number; invested: number; total: number }>,
  padPct = 0.1,
  ignoreNeg = true
): [number, number] {
  const vals: number[] = []
  for (const r of rows) {
    for (const v of [r.free, r.invested, r.total]) {
      if (Number.isFinite(v) && (!ignoreNeg || v >= 0)) vals.push(v)
    }
  }
  if (vals.length === 0) return [0, 1]
  let min = Math.min(...vals)
  let max = Math.max(...vals)
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * padPct)
    return [Math.max(0, min - pad), max + pad]
  }
  const span = max - min
  const pad = span * padPct
  return [Math.max(0, min - pad), max + pad]
}

const EquityChart: React.FC = () => {
  const [raw, setRaw] = useState<EquityPoint[]>([])
  const [range, setRange] = useState<(typeof RANGES)[number]["value"]>("30d")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [autoY, setAutoY] = useState(true)
  const [ignoreNeg, setIgnoreNeg] = useState(true)
  const [yMinManual, setYMinManual] = useState("")
  const [yMaxManual, setYMaxManual] = useState("")

  // restore persistencia
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY)
      if (!saved) return
      const obj = JSON.parse(saved)
      setRange(obj.range ?? "30d")
      setAutoY(obj.autoY ?? true)
      setIgnoreNeg(obj.ignoreNeg ?? true)
      setYMinManual(obj.yMinManual ?? "")
      setYMaxManual(obj.yMaxManual ?? "")
    } catch {}
  }, [])

  // guardar persistencia
  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ range, autoY, ignoreNeg, yMinManual, yMaxManual })
      )
    } catch {}
  }, [range, autoY, ignoreNeg, yMinManual, yMaxManual])

  /** 🔧 FIX: normaliza timestamps con microsegundos */
  const safeToEpoch = (val: string): number => {
    if (!val) return 0
    const safeTs = val.replace(/(\.\d{3})\d+$/, "$1")
    const t = new Date(safeTs)
    return isFinite(t.getTime()) ? t.getTime() : 0
  }

  const data = useMemo(() => {
    const mapped = raw
      .map((p) => {
        const __x = safeToEpoch(p.ts || (p as any).created_at || "")
        const free = Number(p.free)
        const invested = Number(p.invested)
        const total = Number(p.total)
        return {
          ...p,
          __x,
          free: Number.isFinite(free) ? free : 0,
          invested: Number.isFinite(invested) ? invested : 0,
          total: Number.isFinite(total) ? total : 0,
        }
      })
      .filter((d) => d.__x > 0 && isFinite(d.total))
      .sort((a, b) => a.__x - b.__x)

    if (mapped.length === 0) console.warn("[EquityChart] ⚠️ No hay datos válidos después del mapeo", raw)
    else console.debug("[EquityChart] ✅ Data procesada:", mapped.length, mapped[0])
    return mapped
  }, [raw])

  const yDomain = useMemo(() => {
    if (!autoY) {
      const yMin = Number(yMinManual)
      const yMax = Number(yMaxManual)
      if (Number.isFinite(yMin) && Number.isFinite(yMax) && yMax > yMin) return [yMin, yMax]
    }
    return computeAutoYDomain(data, 0.1, ignoreNeg)
  }, [autoY, yMinManual, yMaxManual, data, ignoreNeg])

  const abortRef = useRef<AbortController | null>(null)

  const load = async (r: string) => {
    setLoading(true)
    setError(null)
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    try {
      const aggregate = range.includes("h") ? "hourly" : "daily"
      const url = `http://127.0.0.1:8080/equity/history?range=${r}&aggregate=${aggregate}&_=${Date.now()}`
      console.log("[EquityChart] 🔄 Fetch:", url)

      const res = await fetch(url, { signal: ac.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const json = await res.json()
      console.log(`[EquityChart] 📦 Respuesta del backend (${json?.length || 0} puntos):`, json)

      // 🔧 Mapeo con soporte para los nuevos campos del backend
      const mapped: EquityPoint[] = (json || [])
        .map((p: any) => {
          const ts = p.timestamp || p.ts || p.created_at || p.time || ""
          const avg = Number(p.avg_total_usdt ?? 0)
          const min = Number(p.min_total_usdt ?? 0)
          const max = Number(p.max_total_usdt ?? 0)
          const free = Number(p.free_usdt ?? min)
          const invested = Number(
            p.invested_usdt ??
            (max > min ? max - min : 0)
          )

          return {
            ts,
            free: Number.isFinite(free) ? free : 0,
            invested: Number.isFinite(invested) ? invested : 0,
            total: Number.isFinite(avg) ? avg : 0,
          }
        })
        .filter((p) => p.ts && isFinite(p.total) && p.total > 0)
        .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())

      console.log("[EquityChart] ✅ Mapeo ajustado:", mapped.slice(0, 3))
      setRaw(mapped)
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("[EquityChart] ❌ Carga falló:", err)
        setError("No se pudo cargar el histórico de equity.")
      }
    } finally {
      if (!ac.signal.aborted) setLoading(false)
    }
  }


  useEffect(() => {
    load(range)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  const xInterval = useMemo(() => (data.length <= 4 ? 0 : "preserveStartEnd"), [data.length])
  const manualInvalid =
    !autoY &&
    (!Number.isFinite(Number(yMinManual)) ||
      !Number.isFinite(Number(yMaxManual)) ||
      Number(yMaxManual) <= Number(yMinManual))

  return (
    <div className="rounded-xl bg-[rgba(17,24,39,0.6)] backdrop-blur-md border border-gray-700 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-300">Rango:</label>
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as any)}
            className="text-sm bg-gray-900 border border-gray-700 text-gray-200 rounded-md px-2 py-1"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
            <input
              type="checkbox"
              className="accent-yellow-400"
              checked={autoY}
              onChange={(e) => setAutoY(e.target.checked)}
            />
            Auto Y
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
            <input
              type="checkbox"
              className="accent-yellow-400"
              checked={ignoreNeg}
              onChange={(e) => setIgnoreNeg(e.target.checked)}
              disabled={!autoY}
            />
            Ignorar negativos
          </label>

          <div className="flex items-center gap-1">
            <input
              type="number"
              className="bg-gray-900 border border-gray-700 text-gray-200 rounded-md px-2 py-1 w-24 text-sm disabled:opacity-50"
              placeholder="Y min"
              value={yMinManual}
              onChange={(e) => setYMinManual(e.target.value)}
              disabled={autoY}
            />
            <span className="text-gray-500">—</span>
            <input
              type="number"
              className="bg-gray-900 border border-gray-700 text-gray-200 rounded-md px-2 py-1 w-24 text-sm disabled:opacity-50"
              placeholder="Y max"
              value={yMaxManual}
              onChange={(e) => setYMaxManual(e.target.value)}
              disabled={autoY}
            />
          </div>
        </div>
      </div>

      {manualInvalid && (
        <div className="text-xs text-red-400 mb-2">
          Rango manual inválido: ingresa números y asegúrate de que <b>Y max &gt; Y min</b>.
        </div>
      )}

      {error && <div className="text-xs text-red-400 mb-2">{error}</div>}
      {loading ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={data} margin={{ top: 12, right: 18, bottom: 10, left: 0 }} baseValue="dataMin">
            <defs>
              <linearGradient id="freeFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="investedFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.28} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.04} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="__x"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tick={<TwoLineTimeTick />}
              interval={xInterval as any}
              tickMargin={10}
              height={44}
              stroke="#9CA3AF"
            />
            <YAxis
              domain={yDomain as any}
              stroke="#9CA3AF"
              tickFormatter={(v) =>
                Math.abs(v) >= 1e9
                  ? `${Math.round(v / 1e9)}B`
                  : Math.abs(v) >= 1e6
                  ? `${Math.round(v / 1e6)}M`
                  : Math.abs(v) >= 1e3
                  ? `${Math.round(v / 1e3)}k`
                  : `${Math.round(v)}`
              }
            />
            <Tooltip
              contentStyle={{ background: "#0B1220", border: "1px solid #334155", borderRadius: 8 }}
              labelStyle={{ color: "#E5E7EB" }}
              itemStyle={{ color: "#E5E7EB" }}
              labelFormatter={(l) => {
                const d = new Date(Number(l))
                return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1)
                  .toString()
                  .padStart(2, "0")}  ${d.getHours().toString().padStart(2, "0")}.${d
                  .getMinutes()
                  .toString()
                  .padStart(2, "0")}`
              }}
              formatter={(val: any, key: any) => {
                const label = key === "total" ? "Total" : key === "free" ? "Saldo libre" : "Invertido"
                return [
                  Number(val).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }),
                  label,
                ]
              }}
            />
            <Legend
              wrapperStyle={{ color: "#E5E7EB" }}
              formatter={(v) => (v === "total" ? "Total" : v === "free" ? "Saldo libre" : "Invertido")}
            />

            <Area
              type="monotone"
              dataKey="free"
              stackId="1"
              stroke="#10B981"
              strokeWidth={2}
              fill="url(#freeFill)"
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Area
              type="monotone"
              dataKey="invested"
              stackId="1"
              stroke="#3B82F6"
              strokeWidth={2}
              fill="url(#investedFill)"
              dot={false}
              activeDot={{ r: 3 }}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#FBBF24"
              strokeWidth={3}
              fill="transparent"
              dot={false}
              activeDot={{ r: 3 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

export default EquityChart

