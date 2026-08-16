import type { Trend, TrendResult } from './types'

export interface TrendConfig {
  precedingMonths: number
  threshold: number
}

export const DEFAULT_TREND_CONFIG: TrendConfig = { precedingMonths: 3, threshold: 0.25 }

/**
 * Compares the latest month against the average of the N preceding months.
 * An increase from a zero average can't be expressed as a percentage
 * (division by zero), so changePct is left null rather than invented —
 * the trend itself is still reported as rising.
 */
export function computeTrend(series: number[], config: TrendConfig = DEFAULT_TREND_CONFIG): TrendResult {
  if (series.length === 0) {
    return { trend: 'stable', changePct: null }
  }

  const latest = series[series.length - 1]
  const precedingStart = Math.max(0, series.length - 1 - config.precedingMonths)
  const preceding = series.slice(precedingStart, series.length - 1)

  if (preceding.length === 0) {
    return { trend: 'stable', changePct: null }
  }

  const avg = preceding.reduce((sum, v) => sum + v, 0) / preceding.length

  if (avg === 0) {
    return latest > 0 ? { trend: 'rising', changePct: null } : { trend: 'stable', changePct: 0 }
  }

  const changePct = (latest - avg) / avg
  let trend: Trend = 'stable'
  if (changePct >= config.threshold) trend = 'rising'
  else if (changePct <= -config.threshold) trend = 'falling'

  return { trend, changePct }
}
