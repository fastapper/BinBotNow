// src/components/common/SignValue.tsx
import React from 'react'

type Props = {
  value: number | string
  suffix?: string // " USDT" | " %", etc.
  fractionDigits?: number
  as?: keyof JSX.IntrinsicElements
  style?: React.CSSProperties
}

function toNumber(v: number | string): number | null {
  if (typeof v === 'number') return v
  // extrae signo y dígitos (admite comas/puntos)
  const m = (v || '').toString().replace(/[^\d\.\-]/g, '')
  const n = parseFloat(m)
  return Number.isFinite(n) ? n : null
}

function format(n: number, fractionDigits = 2) {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits
  })
}

export default function SignValue({
  value,
  suffix = '',
  fractionDigits = 2,
  as = 'strong',
  style
}: Props) {
  const num = toNumber(value)
  const Comp: any = as
  const color =
    num === null
      ? undefined
      : num < 0
        ? '#ef4444'
        : num > 0
          ? '#22c55e'
          : undefined
  const text =
    num === null ? String(value) : `${format(num, fractionDigits)}${suffix}`

  return <Comp style={{ color, ...style }}>{text}</Comp>
}
