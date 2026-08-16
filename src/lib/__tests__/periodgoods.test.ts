import { describe, expect, it } from 'vitest'
import { computeConcentration, evaluatePeriodGood } from '../periodgoods'

// Validated typfall from the spec's concentration table.
describe('computeConcentration / evaluatePeriodGood — validated typfall', () => {
  it('flags a strong end-of-year spike as a period good (~98%)', () => {
    const series = [0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 80, 120]
    const concentration = computeConcentration(series, 2, 4)
    expect(concentration).toBeCloseTo(0.9756, 3)
    expect(evaluatePeriodGood(series).isPeriodGood).toBe(true)
  })

  it('flags a mid-year two-month spike as a period good (~95%)', () => {
    const series = [0, 0, 90, 110, 10, 0, 0, 0, 0, 0, 0, 0]
    const concentration = computeConcentration(series, 2, 4)
    expect(concentration).toBeCloseTo(0.9524, 3)
    expect(evaluatePeriodGood(series).isPeriodGood).toBe(true)
  })

  it('does not flag flat, even volume (~18%)', () => {
    const series = [40, 42, 38, 41, 39, 40, 43, 38, 41, 40, 39, 42]
    const concentration = computeConcentration(series, 2, 4)
    expect(concentration).toBeCloseTo(0.1760, 3)
    expect(evaluatePeriodGood(series).isPeriodGood).toBe(false)
  })

  it('does not flag genuine gradual decline (~36%) — this should surface as a falling A instead', () => {
    const series = [80, 70, 60, 50, 40, 30, 25, 20, 15, 10, 8, 5]
    const concentration = computeConcentration(series, 2, 4)
    expect(concentration).toBeCloseTo(0.3632, 3)
    expect(evaluatePeriodGood(series).isPeriodGood).toBe(false)
  })
})

describe('minimum history requirement', () => {
  it('returns null concentration with fewer than minPeriods of history', () => {
    expect(computeConcentration([10, 20, 30], 2, 4)).toBeNull()
    const result = evaluatePeriodGood([10, 20, 30])
    expect(result.isPeriodGood).toBe(false)
    expect(result.concentration).toBeNull()
  })

  it('is meaningful right at the minimum of 4 periods', () => {
    // top-2 of 4 is naturally high; still computed, just interpret with care per spec.
    const series = [10, 10, 10, 10]
    expect(computeConcentration(series, 2, 4)).toBeCloseTo(0.5)
  })
})

describe('topMonthIndex', () => {
  it('reports the single highest-volume month', () => {
    const series = [0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 80, 120]
    expect(evaluatePeriodGood(series).topMonthIndex).toBe(11)
  })
})

describe('edge cases', () => {
  it('treats an all-zero series as zero concentration, not a period good', () => {
    const series = [0, 0, 0, 0, 0, 0]
    const result = evaluatePeriodGood(series)
    expect(result.concentration).toBe(0)
    expect(result.isPeriodGood).toBe(false)
  })
})
