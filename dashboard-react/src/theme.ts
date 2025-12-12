export const theme = {
  name: 'dark',
  colors: {
    bg: '#0d1117',
    panel: '#111827',
    panelAlt: '#0b1220',
    border: '#1f2937',
    text: '#e5e7eb',
    textSoft: '#9ca3af',
    primary: '#38bdf8',
    success: '#22c55e',
    danger: '#ef4444',
    warning: '#f59e0b',
    headerdk: '#1A0349',
    accent: '#14b8a6',
    chip: '#1f2937'
  },
  radii: {
    xs: '6px',
    sm: '10px',
    md: '14px'
  },
  shadow: {
    soft: '0 6px 20px rgba(0,0,0,.35)'
  },
  spacing: (n = 1) => `${n * 8}px`
}
export type AppTheme = typeof theme
