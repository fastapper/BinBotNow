import React from 'react'
import { fmt } from '../api'

// "Gráfico" de torta súper simple con CSS (sin libs)
export default function PieAllocation({ data }) {
  const pie = data?.pie || { available: 0, restricted: 0, invested: 0 }
  const total = Math.max(1e-9, Number(pie.available) + Number(pie.restricted) + Number(pie.invested))
  const a = 360 * Number(pie.available) / total
  const r = 360 * Number(pie.restricted) / total
  const i = 360 * Number(pie.invested) / total

  // usamos 3 conic-gradients anidados
  const bg = `conic-gradient(#16a34a 0deg ${a}deg, #ddd ${a}deg 360deg)`
  const bg2 = `conic-gradient(#f59e0b 0deg ${r}deg, transparent ${r}deg 360deg)`
  const bg3 = `conic-gradient(#2563eb 0deg ${i}deg, transparent ${i}deg 360deg)`

  return (
    <div>
      <h3>Distribución de capital</h3>
      <div style={{ display:'flex', gap:20, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ position:'relative', width:180, height:180 }}>
          <div style={{ position:'absolute', inset:0, borderRadius:'50%', background: bg }} />
          <div style={{ position:'absolute', inset:'6% 6% 6% 6%', borderRadius:'50%', background: bg2 }} />
          <div style={{ position:'absolute', inset:'12% 12% 12% 12%', borderRadius:'50%', background: bg3 }} />
          <div style={{
            position:'absolute', inset:'28% 28% 28% 28%', background:'#fff', borderRadius:'50%',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, color:'#555'
          }}>
            Total ${fmt.n(total,2)}
          </div>
        </div>
        <div>
          <div><span style={{ display:'inline-block', width:12, height:12, background:'#16a34a', marginRight:6 }} /> Disponible: ${fmt.n(pie.available,2)}</div>
          <div><span style={{ display:'inline-block', width:12, height:12, background:'#f59e0b', marginRight:6 }} /> Restringido: ${fmt.n(pie.restricted,2)}</div>
          <div><span style={{ display:'inline-block', width:12, height:12, background:'#2563eb', marginRight:6 }} /> Invertido: ${fmt.n(pie.invested,2)}</div>
        </div>
      </div>
    </div>
  )
}
