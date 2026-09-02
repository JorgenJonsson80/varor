import { describe, expect, it } from 'vitest'
import {
  buildSeriesFromWide,
  dedupeVolumeRows,
  groupLongFormat,
  guessMonthColumns,
  normalizeLongRows,
  normalizeMonthLabel,
  normalizeWideRows,
  parseMonthColumn,
  periodCutoff,
  toNumber,
} from '../history'

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

describe('normalizeMonthLabel', () => {
  it('canonicalizes a recognized month header to YYYY-MM', () => {
    expect(normalizeMonthLabel('jan-24')).toBe('2024-01')
    expect(normalizeMonthLabel('december 2023')).toBe('2023-12')
  })

  it('passes through an unrecognized header unchanged', () => {
    expect(normalizeMonthLabel('Artikelnummer')).toBe('Artikelnummer')
  })
})

describe('normalizeWideRows', () => {
  it('expands each vara+plats row into one row per month, with canonical period labels', () => {
    const rows = [{ vara: 'A1', plats: 'P1010-05--A-2-', 'jan-24': '10', 'feb-24': '20' }]
    const result = normalizeWideRows(rows, 'vara', 'plats', ['jan-24', 'feb-24'])
    expect(result).toEqual([
      { itemId: 'A1', plats: 'P1010-05--A-2-', period: '2024-01', volume: 10 },
      { itemId: 'A1', plats: 'P1010-05--A-2-', period: '2024-02', volume: 20 },
    ])
  })

  it('drops rows missing an item id or location', () => {
    const rows = [
      { vara: '', plats: 'P1', 'jan-24': '10' },
      { vara: 'A1', plats: '', 'jan-24': '10' },
      { vara: 'A2', plats: 'P1', 'jan-24': '10' },
    ]
    const result = normalizeWideRows(rows, 'vara', 'plats', ['jan-24'])
    expect(result).toEqual([{ itemId: 'A2', plats: 'P1', period: '2024-01', volume: 10 }])
  })
})

describe('dedupeVolumeRows', () => {
  it('keeps the last occurrence when the same vara+period appears twice, e.g. after a mid-period move', () => {
    const rows = [
      { itemId: 'A1', plats: 'OLD-LOC', period: '2024-01', volume: 5 },
      { itemId: 'A1', plats: 'NEW-LOC', period: '2024-01', volume: 12 },
    ]
    expect(dedupeVolumeRows(rows)).toEqual([{ itemId: 'A1', plats: 'NEW-LOC', period: '2024-01', volume: 12 }])
  })

  it('does not conflate the same vara across different periods, or different varor in the same period', () => {
    const rows = [
      { itemId: 'A1', plats: 'P1', period: '2024-01', volume: 5 },
      { itemId: 'A1', plats: 'P1', period: '2024-02', volume: 6 },
      { itemId: 'A2', plats: 'P2', period: '2024-01', volume: 7 },
    ]
    expect(dedupeVolumeRows(rows)).toEqual(rows)
  })

  it('leaves a list with no duplicates untouched, same order', () => {
    const rows = [
      { itemId: 'A1', plats: 'P1', period: '2024-01', volume: 5 },
      { itemId: 'A2', plats: 'P2', period: '2024-01', volume: 7 },
    ]
    expect(dedupeVolumeRows(rows)).toEqual(rows)
  })
})

describe('normalizeLongRows', () => {
  it('maps vara+plats+period+antal rows straight through', () => {
    const rows = [
      { vara: 'A1', plats: 'P1', period: '2024-01', antal: '5' },
      { vara: 'A1', plats: 'P1', period: '2024-02', antal: '7' },
    ]
    const result = normalizeLongRows(rows, 'vara', 'plats', 'period', 'antal')
    expect(result).toEqual([
      { itemId: 'A1', plats: 'P1', period: '2024-01', volume: 5 },
      { itemId: 'A1', plats: 'P1', period: '2024-02', volume: 7 },
    ])
  })

  it('drops rows missing an item id, location, or period', () => {
    const rows = [
      { vara: 'A1', plats: 'P1', period: '', antal: '5' },
      { vara: 'A1', plats: 'P1', period: '2024-01', antal: '5' },
    ]
    const result = normalizeLongRows(rows, 'vara', 'plats', 'period', 'antal')
    expect(result).toEqual([{ itemId: 'A1', plats: 'P1', period: '2024-01', volume: 5 }])
  })
})

describe('periodCutoff', () => {
  // Local-component constructor throughout (not an ISO date string) to
  // avoid the test's own result depending on the runner's timezone.
  it('subtracts months, including across a year boundary', () => {
    expect(periodCutoff(18, new Date(2026, 7, 20))).toBe('2025-02') // Aug 2026 - 18mo
    expect(periodCutoff(3, new Date(2026, 0, 15))).toBe('2025-10') // Jan 2026 - 3mo
  })

  it('does not overflow into the wrong month when the target month is shorter', () => {
    // May 31 minus 1 month naively lands on "April 31", which doesn't
    // exist — without resetting the day first, JS Date rolls that forward
    // to May 1, silently cancelling the subtraction out entirely.
    expect(periodCutoff(1, new Date(2026, 4, 31))).toBe('2026-04')
  })
})
