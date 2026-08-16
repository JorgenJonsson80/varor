interface Props {
  series: number[]
  width?: number
  height?: number
}

/** Minimal inline SVG sparkline — distinguishes "steady volume" from "one-off spike" at a glance, no chart library needed. */
export function Sparkline({ series, width = 80, height = 20 }: Props) {
  if (series.length === 0) return null

  const max = Math.max(...series, 0)
  const min = Math.min(...series, 0)
  const range = max - min || 1
  const step = series.length > 1 ? width / (series.length - 1) : 0
  const points = series.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`).join(' ')

  return (
    <svg width={width} height={height} className="sparkline" role="img" aria-label="Månadsserie">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
