import { describe, expect, it } from 'vitest'
import { buildLoadSummary } from '../load'
import type { MoveSuggestion } from '../moves'

const placed = [
  { itemId: 'A', plats: 'L1-1', volume: 600 },
  { itemId: 'B', plats: 'L1-2', volume: 400 },
  { itemId: 'C', plats: 'L2-1', volume: 100 },
]

const groupOf = (plats: string) => plats.slice(0, 2)

describe('buildLoadSummary', () => {
  it('adds up the picks each group carries and its share of the whole', () => {
    const rows = buildLoadSummary({ placed, groupOf, suggestions: [] })
    expect(rows).toEqual([
      { group: 'L1', picks: 1000, share: 1000 / 1100, shift: 0 },
      { group: 'L2', picks: 100, share: 100 / 1100, shift: 0 },
    ])
  })

  it('shows what a move would take from one group and give to another', () => {
    const suggestions: MoveSuggestion[] = [
      { kind: 'move', itemId: 'A', fromPlats: 'L1-1', toPlats: 'L2-9', gain: 1 },
    ]
    const rows = buildLoadSummary({ placed, groupOf, suggestions })
    expect(rows.find((r) => r.group === 'L1')!.shift).toBe(-600)
    expect(rows.find((r) => r.group === 'L2')!.shift).toBe(600)
  })

  it('counts both articles in a swap, since each goes the other way', () => {
    const suggestions: MoveSuggestion[] = [
      { kind: 'swap', itemId: 'A', fromPlats: 'L1-1', toPlats: 'L2-1', swapWithItemId: 'C', gain: 1 },
    ]
    const rows = buildLoadSummary({ placed, groupOf, suggestions })
    // L1 loses A's 600 but gains C's 100, so it drops by 500 net.
    expect(rows.find((r) => r.group === 'L1')!.shift).toBe(-500)
    expect(rows.find((r) => r.group === 'L2')!.shift).toBe(500)
  })

  it('ignores a move that stays inside one group — the load does not change', () => {
    const suggestions: MoveSuggestion[] = [
      { kind: 'swap', itemId: 'A', fromPlats: 'L1-1', toPlats: 'L1-2', swapWithItemId: 'B', gain: 1 },
    ]
    const rows = buildLoadSummary({ placed, groupOf, suggestions })
    expect(rows.every((r) => r.shift === 0)).toBe(true)
  })

  it('puts the heaviest group first', () => {
    const rows = buildLoadSummary({ placed, groupOf, suggestions: [] })
    expect(rows.map((r) => r.group)).toEqual(['L1', 'L2'])
  })

  it('handles an empty warehouse without dividing by zero', () => {
    expect(buildLoadSummary({ placed: [], groupOf, suggestions: [] })).toEqual([])
  })
})
