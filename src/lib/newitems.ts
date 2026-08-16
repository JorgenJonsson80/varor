import { klassRank, type Klass } from './types'

export interface ProxyCandidate {
  id: string
  atc5: string
  packageSize: string
  klass: Klass
}

export interface NewItem {
  id: string
  atc5: string
  packageSize: string
}

export interface ProxyInheritanceResult {
  klass: Klass
  source: 'proxy' | 'default'
  matchedIds: string[]
}

/**
 * New pharma items are rarely truly unknown — most are a repackaging,
 * generic, or new supplier of something already stocked. The simple rule
 * from the domain (same ATC-5 + same package size → inherit that class)
 * covers most cases; no ML needed. When several relatives match with
 * different classes, majority wins, ties broken toward the better class —
 * a real proxy match is a real signal, not a guess, so it isn't capped at B.
 *
 * With no match at all, there's no signal to inherit, so it falls back to
 * the documented default: B, never straight to A or C. The cost is
 * asymmetric — a too-generous placement half-wastes a good slot, a
 * too-stingy one costs at every pick until someone notices.
 */
export function inheritKlassFromRelatives(
  newItem: NewItem,
  candidates: ProxyCandidate[],
): ProxyInheritanceResult {
  const matches = candidates.filter(
    (c) => c.atc5 === newItem.atc5 && c.packageSize === newItem.packageSize,
  )

  if (matches.length === 0) {
    return { klass: 'B', source: 'default', matchedIds: [] }
  }

  const counts = new Map<Klass, number>()
  for (const match of matches) {
    counts.set(match.klass, (counts.get(match.klass) ?? 0) + 1)
  }

  let bestKlass: Klass = 'C'
  let bestCount = -1
  for (const [klass, count] of counts) {
    const better =
      count > bestCount || (count === bestCount && klassRank[klass] > klassRank[bestKlass])
    if (better) {
      bestKlass = klass
      bestCount = count
    }
  }

  return { klass: bestKlass, source: 'proxy', matchedIds: matches.map((m) => m.id) }
}

/** When a new item is an explicit replacement for an outgoing article, it inherits that article's whole history. */
export function inheritHistoryFromReplacedItem(
  replacesId: string | undefined,
  historyById: Map<string, number[]>,
): number[] | null {
  if (!replacesId) return null
  return historyById.get(replacesId) ?? null
}

/** Bevakningslista: has this new item's volume passed the watch threshold at any point? */
export function hasPassedWatchThreshold(series: number[], threshold: number): boolean {
  return series.some((value) => value >= threshold)
}
