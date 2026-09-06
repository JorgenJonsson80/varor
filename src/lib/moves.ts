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
}): MoveSuggestion[] {
  const { placed, emptyLocations, scoreByPlats, limit } = params
  if (limit <= 0) return []

  const eligible: Candidate[] = []
  for (const article of placed) {
    const score = scoreByPlats.get(article.plats)
    if (score !== undefined) eligible.push({ article, score })
  }

  const byVolumeDesc = [...eligible].sort(
    (a, b) => b.article.volume - a.article.volume || a.article.itemId.localeCompare(b.article.itemId),
  )
  const byVolumeAsc = [...byVolumeDesc].reverse()

  const emptyByScoreDesc = emptyLocations
    .filter((plats) => scoreByPlats.has(plats))
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
      if (usedPlats.has(plats)) continue
      if (scoreByPlats.get(plats)! <= high.score) break
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
