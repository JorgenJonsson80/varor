import { describe, expect, it } from 'vitest'
import { buildSeriesFromWide, groupLongFormat, guessMonthColumns, parseMonthColumn, toNumber } from '../history'

describe('toNumber', () => {
  it('coerces plain numbers and numeric strings', () => {
    expect(toNumber(42)).toBe(42)
    expect(toNumber('42')).toBe(42)
  })

  it('treats empty/missing cells as 0, never filters them out', () => {
    expect(toNumber('')).toBe(0)
    expect(toNumber(null)).toBe(0)
    expect(toNumber(undefined)).toBe(0)
  })

  it('handles Swedish decimal comma and thousands spaces', () => {
    expect(toNumber('1 234,5')).toBeCloseTo(1234.5)
    expect(toNumber('12,5')).toBeCloseTo(12.5)
  })

  it('falls back to 0 for garbage input', () => {
    expect(toNumber('n/a')).toBe(0)
  })
})

describe('buildSeriesFromWide', () => {
  it('reads columns in the given chronological order', () => {
    const row = { vara: 'X', jan: '10', feb: '20', mar: '30' }
    expect(buildSeriesFromWide(row, ['jan', 'feb', 'mar'])).toEqual([10, 20, 30])
  })
})

describe('groupLongFormat', () => {
  it('groups by id and sorts periods ascending as text', () => {
    const rows = [
      { id: 'a', period: '2024-03', value: 3 },
      { id: 'a', period: '2024-01', value: 1 },
      { id: 'b', period: '2024-02', value: 20 },
      { id: 'a', period: '2024-02', value: 2 },
    ]
    const result = groupLongFormat(rows)
    expect(result.get('a')).toEqual({ periods: ['2024-01', '2024-02', '2024-03'], series: [1, 2, 3] })
    expect(result.get('b')).toEqual({ periods: ['2024-02'], series: [20] })
  })
})

describe('parseMonthColumn', () => {
  it('parses ISO-style year-month', () => {
    expect(parseMonthColumn('2024-01')).toEqual({ year: 2024, month: 1 })
    expect(parseMonthColumn('2024-01-01')).toEqual({ year: 2024, month: 1 })
  })

  it('parses YYYYMM', () => {
    expect(parseMonthColumn('202401')).toEqual({ year: 2024, month: 1 })
  })

  it('parses MM/YYYY and YYYY/MM', () => {
    expect(parseMonthColumn('01/2024')).toEqual({ year: 2024, month: 1 })
    expect(parseMonthColumn('2024/01')).toEqual({ year: 2024, month: 1 })
  })

  it('parses Swedish month names, full and abbreviated, with 2 or 4 digit years', () => {
    expect(parseMonthColumn('januari 2024')).toEqual({ year: 2024, month: 1 })
    expect(parseMonthColumn('jan-24')).toEqual({ year: 2024, month: 1 })
    expect(parseMonthColumn('dec24')).toEqual({ year: 2024, month: 12 })
  })

  it('returns null for non-month headers', () => {
    expect(parseMonthColumn('Artikelnummer')).toBeNull()
    expect(parseMonthColumn('Beskrivning')).toBeNull()
  })
})

describe('guessMonthColumns', () => {
  it('filters to month-like columns and sorts them chronologically regardless of input order', () => {
    const columns = ['Artikelnummer', 'mar-24', 'Beskrivning', 'jan-24', 'feb-24']
    expect(guessMonthColumns(columns)).toEqual(['jan-24', 'feb-24', 'mar-24'])
  })

  it('works across a year boundary', () => {
    const columns = ['2023-11', '2024-01', '2023-12']
    expect(guessMonthColumns(columns)).toEqual(['2023-11', '2023-12', '2024-01'])
  })
})
