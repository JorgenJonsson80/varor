import { paretoClassify, computeBestKlassHistory } from './varuklass'
import { computeTrend, type TrendConfig } from './trend'
import { evaluatePeriodGood, type PeriodGoodConfig } from './periodgoods'
import { determinePlatsklass } from './location'
import { classifySignal, SIGNAL_TYPES, type SignalType } from './signals'
import type { Klass, ParetoThresholds, PlatsklassConfig, PlatsklassSource, Trend } from './types'

export interface ResultItemInput {
  id: string
  /** The item's current location — the plats from its most recent period. */
  plats: string
  series: number[]
  /** Location per period, aligned to periodLabels; null where the item has no row that period. Only needed for viewMode 'period'. */
  platsSeries?: (string | null)[]
}

export interface ResultConfig {
  pareto: ParetoThresholds
  trend: TrendConfig
  periodGood: PeriodGoodConfig
}

/**
 * Which snapshot of an item's history to classify against: the latest
 * period (today's default view), a single specific period (a clicked
 * month), or the average volume across every entered period ("snitt") —
 * a stable typical-month picture that doesn't jump around on a single
 * spike or dip.
 */
export type ResultViewMode = { type: 'latest' } | { type: 'average' } | { type: 'period'; index: number }

export interface ResultRow {
  id: string
  plats: string
  series: number[]
  latestVolume: number
  viewVolume: number
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

function resolveViewVolume(series: number[], viewMode: ResultViewMode): number {
  if (viewMode.type === 'average') {
    return series.length > 0 ? series.reduce((sum, v) => sum + v, 0) / series.length : 0
  }
  const index = viewMode.type === 'period' ? viewMode.index : series.length - 1
  return series[index] ?? 0
}

/**
 * Which period decides where an item sits: the one being viewed, or the
 * newest one for the latest/average views (an average is still evaluated
 * against where the item is now).
 */
function placementIndex(viewMode: ResultViewMode, periodCount: number): number {
  return viewMode.type === 'period' ? viewMode.index : periodCount - 1
}

/**
 * Where the item sits as of the deciding period: the location it was most
 * recently PICKED FROM, at or before that period. Null when it has no rows
 * at all up to then, and the item is left out of the results entirely.
 *
 * Picks are what identify the real location. The newest month in a file is
 * routinely still empty (an export covering through next month, a month
 * that has barely started), and an item that has moved keeps a row for its
 * old location carrying that month's zeros — so going by the newest row
 * alone puts articles back on slots they left. The last month with actual
 * picks doesn't have that problem.
 *
 * An item with no picks anywhere in the window falls back to whatever
 * location its rows do give, so a genuinely idle article still shows up
 * (and can still be flagged as a nollvara on an A-plats).
 */
function resolvePlacement(item: ResultItemInput, index: number): string | null {
  if (!item.platsSeries) return item.plats === '' ? null : item.plats

  const at = Math.min(index, item.platsSeries.length - 1)
  // Absent from that period's list at all: moved away or gone, not placed.
  if (at < 0 || !item.platsSeries[at]) return null

  for (let i = at; i >= 0; i--) {
    if (item.platsSeries[i] && (item.series[i] ?? 0) > 0) return item.platsSeries[i]!
  }
  return item.platsSeries[at]
}

/**
 * Combines every classification primitive into one row per item: varuklass
 * (Pareto across all items' viewed volume — latest month by default),
 * platsklass (of the item's location in the deciding period), trend,
 * period-good status, and the resulting signal. Rows are never dropped for
 * zero volume — a location with nothing picked this month is still a real
 * placement to evaluate — but an item with no row at all for the deciding
 * period is: it isn't placed anywhere then, so there is nothing to judge.
 */
export function buildResultRows(
  items: ResultItemInput[],
  periodLabels: string[],
  platsklassConfig: PlatsklassConfig,
  config: ResultConfig,
  viewMode: ResultViewMode = { type: 'latest' },
): ResultRow[] {
  const index = placementIndex(viewMode, periodLabels.length)
  const placed: { item: ResultItemInput; plats: string }[] = []
  for (const item of items) {
    const plats = resolvePlacement(item, index)
    if (plats !== null) placed.push({ item, plats })
  }

  // Pareto runs over the items actually placed in that period — an article
  // that has left the warehouse shouldn't shift the A/B/C cut for the ones
  // still in it.
  const viewVolumes = placed.map(({ item }) => ({ id: item.id, volume: resolveViewVolume(item.series, viewMode) }))
  const varuklassById = new Map(paretoClassify(viewVolumes, config.pareto).map((r) => [r.id, r.klass]))

  const bestKlassById = new Map(
    computeBestKlassHistory(
      placed.map(({ item }) => ({ id: item.id, series: item.series })),
      periodLabels,
      config.pareto,
    ).map((r) => [r.id, r]),
  )

  return placed.map(({ item, plats: viewPlats }) => {
    const latestVolume = item.series[item.series.length - 1] ?? 0
    const viewVolume = resolveViewVolume(item.series, viewMode)
    const varuklass = varuklassById.get(item.id) ?? 'C'
    const best = bestKlassById.get(item.id) ?? { bestKlass: 'C' as Klass, bestPeriod: null }
    const trendResult = computeTrend(item.series, config.trend)
    const periodGood = evaluatePeriodGood(item.series, config.periodGood)
    const platsResult = determinePlatsklass(viewPlats, platsklassConfig)
    const periodGoodProtected = periodGood.isPeriodGood && best.bestKlass === 'A'

    const signal = classifySignal({
      varuklass,
      platsklass: platsResult.klass,
      latestVolume: viewVolume,
      trend: trendResult.trend,
      isPeriodGood: periodGood.isPeriodGood,
      periodGoodProtected,
    })

    return {
      id: item.id,
      plats: viewPlats,
      series: item.series,
      latestVolume,
      viewVolume,
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
 *
 * `plats` here is only a convenience for callers that don't track periods;
 * buildResultRows decides placement from platsSeries for the period being
 * viewed, and leaves out items that have no row there at all.
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

  const latestPeriod = periodLabels[periodLabels.length - 1]
  const items: ResultItemInput[] = []
  for (const [id, entry] of byItem) {
    const series = periodLabels.map((p) => entry.volumeByPeriod.get(p) ?? 0)
    const platsSeries = periodLabels.map((p) => entry.platsByPeriod.get(p) ?? null)
    const plats = (latestPeriod ? entry.platsByPeriod.get(latestPeriod) : undefined) ?? ''
    items.push({ id, plats, series, platsSeries })
  }

  return { periodLabels, items }
}

export type ResultSortColumn = 'id' | 'plats' | 'varuklass' | 'platsklass' | 'signal' | 'trend' | 'latestVolume'
export type SortDirection = 'asc' | 'desc'

const SIGNAL_RANK = Object.fromEntries(SIGNAL_TYPES.map((signal, index) => [signal, index])) as Record<
  SignalType,
  number
>

function compareResultRows(a: ResultRow, b: ResultRow, column: ResultSortColumn): number {
  switch (column) {
    case 'id':
      return a.id.localeCompare(b.id)
    case 'plats':
      return a.plats.localeCompare(b.plats)
    case 'varuklass':
      return a.varuklass.localeCompare(b.varuklass)
    case 'platsklass':
      return a.platsklass.localeCompare(b.platsklass)
    case 'signal':
      return SIGNAL_RANK[a.signal] - SIGNAL_RANK[b.signal]
    case 'trend':
      return a.trend.localeCompare(b.trend)
    case 'latestVolume':
      // Sorts on the volume actually shown for the active view (a single
      // picked month, the average, or the true latest month by default),
      // not always the true latest — the column's meaning follows the view.
      return a.viewVolume - b.viewVolume
  }
}

/**
 * Sorts by any result column, ascending or descending. Ties always break
 * on id ascending (regardless of the primary column's direction), so
 * paging stays stable between renders instead of reordering rows that
 * compare equal on the chosen column.
 */
export function sortResultRows(rows: ResultRow[], column: ResultSortColumn, direction: SortDirection): ResultRow[] {
  const sign = direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const primary = compareResultRows(a, b, column)
    if (primary !== 0) return primary * sign
    return a.id.localeCompare(b.id)
  })
}
