import { describe, expect, it } from 'vitest'
import { computeBestKlassHistory, paretoClassify } from '../varuklass'

describe('paretoClassify', () => {
  it('classifies A up to 80%, B up to 95%, C after, on cumulative share', () => {
    // Total = 100. Cumulative: 50 (50%), 80 (80%), 95 (95%), 100 (100%)
    const items = [
      { id: 'a', volume: 50 },
      { id: 'b', volume: 30 },
      { id: 'c', volume: 15 },
      { id: 'd', volume: 5 },
    ]
    const result = paretoClassify(items)
    const byId = Object.fromEntries(result.map((r) => [r.id, r.klass]))
    expect(byId.a).toBe('A') // 50%
    expect(byId.b).toBe('A') // 80%, boundary inclusive
    expect(byId.c).toBe('B') // 95%, boundary inclusive
    expect(byId.d).toBe('C') // 100%
  })

  it('respects configurable thresholds', () => {
    const items = [
      { id: 'a', volume: 60 },
      { id: 'b', volume: 40 },
    ]
    const result = paretoClassify(items, { a: 0.5, b: 0.9 })
    expect(result.find((r) => r.id === 'a')!.klass).toBe('B') // 60% > 50% threshold
    expect(result.find((r) => r.id === 'b')!.klass).toBe('C') // 100% > 90%
  })

  it('classes zero-volume items as C directly, excluded from the cumulative share', () => {
    const items = [
      { id: 'a', volume: 80 },
      { id: 'b', volume: 20 },
      { id: 'zero', volume: 0 },
    ]
    const result = paretoClassify(items)
    const byId = Object.fromEntries(result.map((r) => [r.id, r]))
    expect(byId.zero.klass).toBe('C')
    expect(byId.zero.cumulativeShare).toBeNull()
    // Excluding zero, a=80% of 100 (a+b) -> still A at exactly the 80% boundary
    expect(byId.a.klass).toBe('A')
    expect(byId.a.cumulativeShare).toBeCloseTo(0.8)
  })

  it('does not divide by zero when every item has zero volume', () => {
    const items = [
      { id: 'a', volume: 0 },
      { id: 'b', volume: 0 },
    ]
    const result = paretoClassify(items)
    expect(result.every((r) => r.klass === 'C')).toBe(true)
  })
})

describe('computeBestKlassHistory', () => {
  it('keeps the best class an item ever achieved and which period it happened in', () => {
    // Month 0: item 'x' dominates (70% cumulative share) -> A. Month 1: item 'y' dominates -> x drops to C.
    const items = [
      { id: 'x', series: [70, 30] },
      { id: 'y', series: [30, 70] },
    ]
    const result = computeBestKlassHistory(items, ['2024-01', '2024-02'])
    const byId = Object.fromEntries(result.map((r) => [r.id, r]))

    expect(byId.x.bestKlass).toBe('A')
    expect(byId.x.bestPeriod).toBe('2024-01')
    expect(byId.y.bestKlass).toBe('A')
    expect(byId.y.bestPeriod).toBe('2024-02')
  })
})
