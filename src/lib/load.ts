import type { MoveSuggestion, PlacedArticle } from './moves'

export interface LoadRow {
  group: string
  /** Picks carried today by everything placed in this group. */
  picks: number
  /** Share of all picks, 0-1. */
  share: number
  /** Net picks this group would gain or lose if the listed suggestions were carried out. */
  shift: number
}

/**
 * How the picking load sits across lines or stations today, and how the
 * suggestions currently on the list would shift it.
 *
 * Deliberately a measurement, not a target. The score model already pulls
 * volume towards the stations that want it, but it has no idea when a line
 * has had enough — nothing here knows how many lines line 1 can take. So
 * this shows the numbers and leaves the judgement where the knowledge is.
 * Targets are worth adding once these numbers have been looked at, not
 * before, or they'd just be invented.
 */
export function buildLoadSummary(params: {
  placed: PlacedArticle[]
  groupOf: (plats: string) => string
  suggestions: MoveSuggestion[]
}): LoadRow[] {
  const { placed, groupOf, suggestions } = params

  const picks = new Map<string, number>()
  const volumeByItem = new Map<string, number>()
  for (const article of placed) {
    const group = groupOf(article.plats)
    picks.set(group, (picks.get(group) ?? 0) + article.volume)
    volumeByItem.set(article.itemId, article.volume)
  }

  const shift = new Map<string, number>()
  const move = (group: string, delta: number) => shift.set(group, (shift.get(group) ?? 0) + delta)

  for (const suggestion of suggestions) {
    const from = groupOf(suggestion.fromPlats)
    const to = groupOf(suggestion.toPlats)
    if (from === to) continue

    const volume = volumeByItem.get(suggestion.itemId) ?? 0
    move(from, -volume)
    move(to, volume)

    // A swap sends the other article back the other way, so its picks move too.
    if (suggestion.swapWithItemId) {
      const partnerVolume = volumeByItem.get(suggestion.swapWithItemId) ?? 0
      move(to, -partnerVolume)
      move(from, partnerVolume)
    }
  }

  const total = Array.from(picks.values()).reduce((sum, v) => sum + v, 0)

  return Array.from(picks.entries())
    .map(([group, groupPicks]) => ({
      group,
      picks: groupPicks,
      share: total > 0 ? groupPicks / total : 0,
      shift: shift.get(group) ?? 0,
    }))
    .sort((a, b) => b.picks - a.picks || a.group.localeCompare(b.group, undefined, { numeric: true }))
}
