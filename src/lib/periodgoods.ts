export interface PeriodGoodConfig {
  topN: number
  threshold: number
  minPeriods: number
}

export const DEFAULT_PERIOD_GOOD_CONFIG: PeriodGoodConfig = { topN: 2, threshold: 0.6, minPeriods: 4 }

/**
 * Concentration = sum of the N largest months / total volume. Requires at
 * least `minPeriods` of history — with only 4-6 months, the top-N share is
 * naturally high just from sample size, so the ratio stops meaning
 * anything below that. Returns null when there isn't enough history.
 */
export function computeConcentration(series: number[], topN: number, minPeriods: number): number | null {
  if (series.length < minPeriods) return null

  const total = series.reduce((sum, v) => sum + v, 0)
  if (total === 0) return 0

  const sorted = [...series].sort((a, b) => b - a)
  const topSum = sorted.slice(0, topN).reduce((sum, v) => sum + v, 0)
  return topSum / total
}

export interface PeriodGoodResult {
  isPeriodGood: boolean
  concentration: number | null
  topMonthIndex: number | null
}

export function evaluatePeriodGood(
  series: number[],
  config: PeriodGoodConfig = DEFAULT_PERIOD_GOOD_CONFIG,
): PeriodGoodResult {
  const concentration = computeConcentration(series, config.topN, config.minPeriods)

  if (concentration === null) {
    return { isPeriodGood: false, concentration: null, topMonthIndex: null }
  }

  const topMonthIndex = series.reduce(
    (bestIndex, value, index) => (value > series[bestIndex] ? index : bestIndex),
    0,
  )

  return {
    isPeriodGood: concentration >= config.threshold,
    concentration,
    topMonthIndex,
  }
}
