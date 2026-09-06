import type { Klass } from './types'

/**
 * What a station is for, which decides whether it wants heavy or light
 * articles on top of where a location sits within it:
 *
 * - `tunnel` — high-throughput picking, wants as many lines as it can take
 * - `vanlig` — an ordinary station, no pull either way
 * - `vagnsplock` — cart picking, wants as few lines as possible
 * - `temperatur` — temperature-controlled, same: keep the line count down
 * - `aframe` — automated dispensing; what goes in it is a separate decision
 *   with its own criteria, so it is left out of move suggestions entirely
 */
export type StationType = 'tunnel' | 'vanlig' | 'vagnsplock' | 'temperatur' | 'aframe'

export const STATION_TYPES: StationType[] = ['tunnel', 'vanlig', 'vagnsplock', 'temperatur', 'aframe']

export const STATION_TYPE_LABELS: Record<StationType, string> = {
  tunnel: 'Tunnel (vill ha många rader)',
  vanlig: 'Vanlig',
  vagnsplock: 'Vagnsplock (vill ha få rader)',
  temperatur: 'Temperatur (vill ha få rader)',
  aframe: 'A-Frame (utesluts)',
}

const STATION_BIAS: Record<StationType, number | null> = {
  tunnel: 1,
  vanlig: 0,
  vagnsplock: -1,
  temperatur: -1,
  aframe: null,
}

const KLASS_SCORE: Record<Klass, number> = { A: 3, B: 2, C: 1 }

/**
 * How good a spot a location is, combining the two things that make one
 * good: where it sits within its station (platsklass — distance, height)
 * and what the station as a whole wants to carry. A tunnel C-plats and an
 * ordinary B-plats come out level, which is the intent: the tunnel wants
 * the traffic, so a middling spot there beats a middling spot elsewhere.
 *
 * Returns null for a location that shouldn't be moved into or out of at
 * all (A-Frame), so callers can leave it out entirely.
 */
export function locationScore(platsklass: Klass, stationType: StationType): number | null {
  const bias = STATION_BIAS[stationType]
  return bias === null ? null : KLASS_SCORE[platsklass] + bias
}

/**
 * Why a suggested move can't be carried out. The reason decides how widely
 * it applies, which is the point of recording it rather than just hiding
 * the row: a location that doesn't exist shouldn't be proposed to anyone
 * ever again, while a box that won't fit one particular slot says nothing
 * about the next article.
 */
export type DismissalReason =
  | 'kartong_for_stor'
  | 'plats_saknas'
  | 'plats_blockerad'
  | 'fel_plockmetod'
  | 'kraver_pallplats'
  | 'kraver_temperatur'
  | 'vara_utgar'
  | 'annat'

export type DismissalScope = 'pair' | 'plats' | 'vara'

export const DISMISSAL_REASONS: DismissalReason[] = [
  'kartong_for_stor',
  'plats_saknas',
  'plats_blockerad',
  'fel_plockmetod',
  'kraver_pallplats',
  'kraver_temperatur',
  'vara_utgar',
  'annat',
]

export const DISMISSAL_REASON_LABELS: Record<DismissalReason, string> = {
  kartong_for_stor: 'Kartong för stor',
  plats_saknas: 'Plats finns ej i verkligheten',
  plats_blockerad: 'Platsen trasig eller blockerad',
  fel_plockmetod: 'Fel plockmetod för varan',
  kraver_pallplats: 'Varan kräver pallplats',
  kraver_temperatur: 'Varan kräver kyla/temperatur',
  vara_utgar: 'Varan ska utgå',
  annat: 'Annat',
}

/**
 * How far a dismissal reaches by default, from what the reason is really
 * about.
 *
 * A location that isn't real, or is out of service, is no use to anybody.
 * Needing a pallet slot, cold storage, or a particular picking method is a
 * property of the ARTICLE, not of one slot — blocking only the combination
 * just moves the same impossible suggestion to the next location, which is
 * exactly what it did before these were widened. Only a box that won't fit
 * one specific slot, and free-text "annat", stay narrow.
 *
 * This is a default, not a rule: the person dismissing can widen or narrow
 * it, since they know things the reason list doesn't.
 */
export const DISMISSAL_SCOPES: Record<DismissalReason, DismissalScope> = {
  kartong_for_stor: 'pair',
  plats_saknas: 'plats',
  plats_blockerad: 'plats',
  fel_plockmetod: 'vara',
  kraver_pallplats: 'vara',
  kraver_temperatur: 'vara',
  vara_utgar: 'vara',
  annat: 'pair',
}

export const DISMISSAL_SCOPE_LABELS: Record<DismissalScope, string> = {
  pair: 'Bara denna vara till denna plats',
  plats: 'Platsen — för alla varor',
  vara: 'Varan — till alla platser',
}

export interface MoveBlocks {
  /** Never proposed as a destination. Still fine as a source — getting an article off a broken slot is worth suggesting. */
  platser: Set<string>
  /** Never moved at all. */
  varor: Set<string>
  /** `itemId|plats` — this article specifically can't go into this location. */
  par: Set<string>
}

export function pairKey(itemId: string, plats: string): string {
  return itemId + '|' + plats
}

export const NO_BLOCKS: MoveBlocks = { platser: new Set(), varor: new Set(), par: new Set() }

export interface PlacedArticle {
  itemId: string
  plats: string
  /** Picks for the period being judged — what a move is worth is proportional to this. */
  volume: number
}

export interface MoveSuggestion {
  kind: 'swap' | 'move'
  itemId: string
  fromPlats: string
  toPlats: string
  /** The article that moves the other way; only set for a swap. */
  swapWithItemId?: string
  /** Picks × score steps gained. Comparable between suggestions, not a time. */
  gain: number
}

interface Candidate {
  article: PlacedArticle
  score: number
}

/**
 * Ranks the moves worth making, best first.
 *
 * The idea is the one a picker would describe: the articles that run the
 * most, sitting in poor spots, should change places with the ones that
 * barely move but occupy the good ones. Gain is picks × score steps —
 * for a swap it's the DIFFERENCE in picks between the two articles, since
 * whatever the low mover loses eats into what the high mover gains.
 *
 * Greedy by design: it takes the biggest mover first and gives it the best
 * spot still going, then moves on. That isn't the mathematically optimal
 * assignment, but it produces a list that can be worked top-down and
 * stopped at any point, which is how the list actually gets used. Each
 * article and each location appears at most once, so the suggestions can
 * be carried out in any order without invalidating each other.
 *
 * Locations absent from `scoreByPlats` are excluded (A-Frame, or anything
 * whose station type isn't set yet) — never suggested as a source or a
 * target.
 */
export function suggestMoves(params: {
  placed: PlacedArticle[]
  emptyLocations: string[]
  scoreByPlats: Map<string, number>
  limit: number
  blocks?: MoveBlocks
  /**
   * Keeps every suggested move inside one group — a station, or a line.
   * Omit to let articles move anywhere in the warehouse. A location with no
   * group can't be moved to or from while grouping is on, since there is
   * nothing to say it belongs with anything.
   */
  groupByPlats?: Map<string, string>
}): MoveSuggestion[] {
  const { placed, emptyLocations, scoreByPlats, limit, blocks = NO_BLOCKS, groupByPlats } = params
  if (limit <= 0) return []

  const sameGroup = (a: string, b: string): boolean => {
    if (!groupByPlats) return true
    const groupA = groupByPlats.get(a)
    return groupA !== undefined && groupA === groupByPlats.get(b)
  }

  const eligible: Candidate[] = []
  for (const article of placed) {
    if (blocks.varor.has(article.itemId)) continue
    const score = scoreByPlats.get(article.plats)
    if (score !== undefined) eligible.push({ article, score })
  }

  const byVolumeDesc = [...eligible].sort(
    (a, b) => b.article.volume - a.article.volume || a.article.itemId.localeCompare(b.article.itemId),
  )
  const byVolumeAsc = [...byVolumeDesc].reverse()

  const emptyByScoreDesc = emptyLocations
    .filter((plats) => scoreByPlats.has(plats) && !blocks.platser.has(plats))
    .sort((a, b) => scoreByPlats.get(b)! - scoreByPlats.get(a)! || a.localeCompare(b))

  const usedItems = new Set<string>()
  const usedPlats = new Set<string>()
  const suggestions: MoveSuggestion[] = []

  for (const high of byVolumeDesc) {
    if (suggestions.length >= limit) break
    if (usedItems.has(high.article.itemId) || usedPlats.has(high.article.plats)) continue

    // Best free spot going: empties are sorted best-first, so the first one
    // still available that beats where the article sits now is the best one.
    let bestEmpty: string | null = null
    for (const plats of emptyByScoreDesc) {
      if (scoreByPlats.get(plats)! <= high.score) break
      if (usedPlats.has(plats)) continue
      if (blocks.par.has(pairKey(high.article.itemId, plats))) continue
      if (!sameGroup(high.article.plats, plats)) continue
      bestEmpty = plats
      break
    }

    // Best article to trade with: the one that runs least while sitting
    // somewhere better. Scanning from the bottom finds it first.
    let bestSwap: Candidate | null = null
    for (const low of byVolumeAsc) {
      if (low.article.volume >= high.article.volume) break
      if (usedItems.has(low.article.itemId) || usedPlats.has(low.article.plats)) continue
      if (low.score <= high.score) continue
      // Both articles change places, so a block either way rules it out.
      if (blocks.platser.has(low.article.plats) || blocks.platser.has(high.article.plats)) continue
      if (blocks.par.has(pairKey(high.article.itemId, low.article.plats))) continue
      if (blocks.par.has(pairKey(low.article.itemId, high.article.plats))) continue
      if (!sameGroup(high.article.plats, low.article.plats)) continue
      bestSwap = low
      break
    }

    const emptyGain = bestEmpty === null ? 0 : high.article.volume * (scoreByPlats.get(bestEmpty)! - high.score)
    const swapGain =
      bestSwap === null ? 0 : (high.article.volume - bestSwap.article.volume) * (bestSwap.score - high.score)

    if (emptyGain <= 0 && swapGain <= 0) continue

    if (emptyGain >= swapGain && bestEmpty !== null) {
      suggestions.push({
        kind: 'move',
        itemId: high.article.itemId,
        fromPlats: high.article.plats,
        toPlats: bestEmpty,
        gain: emptyGain,
      })
      usedItems.add(high.article.itemId)
      usedPlats.add(high.article.plats)
      usedPlats.add(bestEmpty)
    } else if (bestSwap !== null) {
      suggestions.push({
        kind: 'swap',
        itemId: high.article.itemId,
        fromPlats: high.article.plats,
        toPlats: bestSwap.article.plats,
        swapWithItemId: bestSwap.article.itemId,
        gain: swapGain,
      })
      usedItems.add(high.article.itemId)
      usedItems.add(bestSwap.article.itemId)
      usedPlats.add(high.article.plats)
      usedPlats.add(bestSwap.article.plats)
    }
  }

  return suggestions.sort((a, b) => b.gain - a.gain || a.itemId.localeCompare(b.itemId))
}
