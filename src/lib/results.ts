import { paretoClassify, computeBestKlassHistory } from './varuklass'
import { computeTrend, type TrendConfig } from './trend'
import { evaluatePeriodGood, type PeriodGoodConfig } from './periodgoods'
import { determinePlatsklass } from './location'
import { classifySignal, type SignalType } from './signals'
import type { Klass, ParetoThresholds, PlatsklassConfig, PlatsklassSource, Trend } from './types'

export interface ResultItemInput {
  id: string
  /** The item's current location — the plats from its most recent period. */
  plats: string
  series: number[]
}

export interface ResultConfig {
  pareto: ParetoThresholds
  trend: TrendConfig
  periodGood: PeriodGoodConfig
}

export interface ResultRow {
  id: string
  plats: string
  series: number[]
  latestVolume: number
  varuklass: Klass
  platsklass: Klass
  platsklassSource: PlatsklassSource
  trend: Trend
  changePct: number | null
  isPeriodGood: boolean
  concentration: number | null
  topMonthIndex: number | null
  bestKlass: Klass
  bestPeriod: string | null
  periodGoodProtected: boolean
  signal: SignalType
}

/**
 * Combines every classification primitive into one row per item: varuklass
 * (Pareto across all items' latest month), platsklass (of the item's
 * current location), trend, period-good status, and the resulting signal.
 * Rows are never dropped for zero volume — a location with nothing picked
 * this month is still a real placement to evaluate.
 */
export function buildResultRows(
  items: ResultItemInput[],
  periodLabels: string[],
  platsklassConfig: PlatsklassConfig,
  config: ResultConfig,
): ResultRow[] {
  const latestVolumes = items.map((item) => ({
    id: item.id,
    volume: item.series[item.series.length - 1] ?? 0,
  }))
  const varuklassById = new Map(paretoClassify(latestVolumes, config.pareto).map((r) => [r.id, r.klass]))

  const bestKlassById = new Map(
    computeBestKlassHistory(
      items.map((item) => ({ id: item.id, series: item.series })),
      periodLabels,
      config.pareto,
    ).map((r) => [r.id, r]),
  )

  return items.map((item) => {
    const latestVolume = item.series[item.series.length - 1] ?? 0
    const varuklass = varuklassById.get(item.id) ?? 'C'
    const best = bestKlassById.get(item.id) ?? { bestKlass: 'C' as Klass, bestPeriod: null }
    const trendResult = computeTrend(item.series, config.trend)
    const periodGood = evaluatePeriodGood(item.series, config.periodGood)
    const platsResult = determinePlatsklass(item.plats, platsklassConfig)
    const periodGoodProtected = periodGood.isPeriodGood && best.bestKlass === 'A'

    const signal = classifySignal({
      varuklass,
      platsklass: platsResult.klass,
      latestVolume,
      trend: trendResult.trend,
      isPeriodGood: periodGood.isPeriodGood,
      periodGoodProtected,
    })

    return {
      id: item.id,
      plats: item.plats,
      series: item.series,
      latestVolume,
      varuklass,
      platsklass: platsResult.klass,
      platsklassSource: platsResult.source,
      trend: trendResult.trend,
      changePct: trendResult.changePct,
      isPeriodGood: periodGood.isPeriodGood,
      concentration: periodGood.concentration,
      topMonthIndex: periodGood.topMonthIndex,
      bestKlass: best.bestKlass,
      bestPeriod: best.bestPeriod,
      periodGoodProtected,
      signal,
    }
  })
}

export interface RawVolumeRow {
  itemId: string
  plats: string
  period: string
  volume: number
}

/**
 * Turns raw (item, plats, period, volume) rows — one row per item per
 * period, as fetched straight from vp_item_monthly_volume — into the
 * per-item series buildResultRows expects. An item's "current location" is
 * the plats from the latest period THAT ITEM has a row for, not the
 * dataset's latest period overall, since history can be sparse (an item
 * introduced mid-year has no earlier rows at all).
 */
export function groupRawVolumeRows(rows: RawVolumeRow[]): {
  periodLabels: string[]
  items: ResultItemInput[]
} {
  const periodSet = new Set<string>()
  for (const row of rows) periodSet.add(row.period)
  const periodLabels = Array.from(periodSet).sort()

  const byItem = new Map<string, { platsByPeriod: Map<string, string>; volumeByPeriod: Map<string, number> }>()
  for (const row of rows) {
    let entry = byItem.get(row.itemId)
    if (!entry) {
      entry = { platsByPeriod: new Map(), volumeByPeriod: new Map() }
      byItem.set(row.itemId, entry)
    }
    entry.platsByPeriod.set(row.period, row.plats)
    entry.volumeByPeriod.set(row.period, row.volume)
  }

  const items: ResultItemInput[] = []
  for (const [id, entry] of byItem) {
    const series = periodLabels.map((p) => entry.volumeByPeriod.get(p) ?? 0)
    let plats = ''
    for (let i = periodLabels.length - 1; i >= 0; i--) {
      const p = entry.platsByPeriod.get(periodLabels[i])
      if (p) {
        plats = p
        break
      }
    }
    items.push({ id, plats, series })
  }

  return { periodLabels, items }
}
