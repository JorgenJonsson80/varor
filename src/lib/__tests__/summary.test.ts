import { describe, expect, it } from 'vitest'
import { buildKlassMatrix, countBySignal } from '../summary'
import type { ResultRow } from '../results'

function row(overrides: Partial<ResultRow>): ResultRow {
  return {
    id: 'X',
    plats: 'P',
    series: [10, 10, 10, 10],
    latestVolume: 10,
    varuklass: 'B',
    platsklass: 'B',
    platsklassSource: 'base',
    trend: 'stable',
    changePct: 0,
    isPeriodGood: false,
    concentration: null,
    topMonthIndex: null,
    bestKlass: 'B',
    bestPeriod: null,
    periodGoodProtected: false,
    signal: 'OK',
    ...overrides,
  }
}

describe('countBySignal', () => {
  it('counts every row into exactly one signal bucket, all buckets present', () => {
    const rows = [row({ signal: 'A_ON_C' }), row({ signal: 'A_ON_C' }), row({ signal: 'OK' })]
    const counts = countBySignal(rows)
    expect(counts.A_ON_C).toBe(2)
    expect(counts.OK).toBe(1)
    expect(counts.MISMATCH).toBe(0)
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(rows.length)
  })
})

describe('buildKlassMatrix', () => {
  it('cross-tabs varuklass against platsklass', () => {
    const rows = [
      row({ varuklass: 'A', platsklass: 'C' }),
      row({ varuklass: 'A', platsklass: 'C' }),
      row({ varuklass: 'C', platsklass: 'A' }),
      row({ varuklass: 'B', platsklass: 'B' }),
    ]
    const matrix = buildKlassMatrix(rows)
    expect(matrix.A.C).toBe(2)
    expect(matrix.C.A).toBe(1)
    expect(matrix.B.B).toBe(1)
    expect(matrix.A.A).toBe(0)
  })
})
