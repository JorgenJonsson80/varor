import { describe, expect, it } from 'vitest'
import { computeTrend } from '../trend'

describe('computeTrend', () => {
  it('is rising when latest is >= +25% above the preceding average', () => {
    // preceding avg = 100, latest = 130 -> +30%
    const result = computeTrend([100, 100, 100, 130])
    expect(result.trend).toBe('rising')
    expect(result.changePct).toBeCloseTo(0.3)
  })

  it('is falling when latest is <= -25% below the preceding average', () => {
    // preceding avg = 100, latest = 60 -> -40%
    const result = computeTrend([100, 100, 100, 60])
    expect(result.trend).toBe('falling')
    expect(result.changePct).toBeCloseTo(-0.4)
  })

  it('is stable inside the +/-25% band', () => {
    const result = computeTrend([100, 100, 100, 110])
    expect(result.trend).toBe('stable')
    expect(result.changePct).toBeCloseTo(0.1)
  })

  it('counts exactly +25% as rising (boundary is inclusive)', () => {
    const result = computeTrend([100, 100, 100, 125])
    expect(result.trend).toBe('rising')
  })

  it('treats an increase from a zero average as rising with no percentage', () => {
    const result = computeTrend([0, 0, 0, 50])
    expect(result.trend).toBe('rising')
    expect(result.changePct).toBeNull()
  })

  it('is stable when both the average and latest are zero', () => {
    const result = computeTrend([0, 0, 0, 0])
    expect(result.trend).toBe('stable')
    expect(result.changePct).toBe(0)
  })

  it('supports a configurable N and threshold', () => {
    // Only 2 preceding months considered, threshold 10%
    const result = computeTrend([100, 100, 999, 111], { precedingMonths: 2, threshold: 0.1 })
    // preceding = [100, 999], avg = 549.5, latest 111 is way below -> falling
    expect(result.trend).toBe('falling')
  })

  it('uses whatever history is available when shorter than N preceding months', () => {
    // Only 1 preceding month available even though N=3
    const result = computeTrend([100, 130])
    expect(result.changePct).toBeCloseTo(0.3)
    expect(result.trend).toBe('rising')
  })
})
