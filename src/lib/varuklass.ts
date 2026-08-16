import { klassRank, type Klass, type ParetoThresholds } from './types'

export interface VolumeItem {
  id: string
  volume: number
}

export interface ParetoResult {
  id: string
  klass: Klass
  cumulativeShare: number | null
}

export const DEFAULT_PARETO_THRESHOLDS: ParetoThresholds = { a: 0.8, b: 0.95 }

/**
 * Classifies items into A/B/C via cumulative Pareto share of volume.
 * Zero-volume items are classed C directly and excluded from the
 * cumulative-share calculation so they don't dilute the curve for
 * everything else.
 */
export function paretoClassify(
  items: VolumeItem[],
  thresholds: ParetoThresholds = DEFAULT_PARETO_THRESHOLDS,
): ParetoResult[] {
  const results = new Map<string, ParetoResult>()

  for (const item of items) {
    if (item.volume <= 0) {
      results.set(item.id, { id: item.id, klass: 'C', cumulativeShare: null })
    }
  }

  const withVolume = items.filter((item) => item.volume > 0)
  const sorted = [...withVolume].sort((a, b) => b.volume - a.volume)
  const total = sorted.reduce((sum, item) => sum + item.volume, 0)

  let cumulative = 0
  for (const item of sorted) {
    cumulative += item.volume
    const share = total > 0 ? cumulative / total : 0
    const klass: Klass = share <= thresholds.a ? 'A' : share <= thresholds.b ? 'B' : 'C'
    results.set(item.id, { id: item.id, klass, cumulativeShare: share })
  }

  return items.map((item) => results.get(item.id)!)
}

export interface BestKlassResult {
  id: string
  bestKlass: Klass
  bestPeriod: string | null
}

/**
 * Runs the Pareto classification independently for every period and keeps
 * the best class each item ever achieved, plus which period it happened in.
 * This is what lets a period good keep credit for its one good month.
 */
export function computeBestKlassHistory(
  items: { id: string; series: number[] }[],
  periodLabels: string[],
  thresholds: ParetoThresholds = DEFAULT_PARETO_THRESHOLDS,
): BestKlassResult[] {
  const best = new Map<string, BestKlassResult>()
  for (const item of items) {
    best.set(item.id, { id: item.id, bestKlass: 'C', bestPeriod: null })
  }

  for (let periodIndex = 0; periodIndex < periodLabels.length; periodIndex++) {
    const volumes = items.map((item) => ({ id: item.id, volume: item.series[periodIndex] ?? 0 }))
    const classified = paretoClassify(volumes, thresholds)

    for (const result of classified) {
      const current = best.get(result.id)!
      if (klassRank[result.klass] > klassRank[current.bestKlass]) {
        best.set(result.id, {
          id: result.id,
          bestKlass: result.klass,
          bestPeriod: periodLabels[periodIndex],
        })
      }
    }
  }

  return items.map((item) => best.get(item.id)!)
}
