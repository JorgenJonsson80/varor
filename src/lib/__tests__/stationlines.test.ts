import { describe, expect, it } from 'vitest'
import {
  guessDayColumns,
  normalizeLongStationDays,
  normalizeWideStationDays,
  parseDayCell,
  sumStationDays,
  summarizeStationLoad,
} from '../stationlines'

describe('parseDayCell', () => {
  it('passes ISO dates through, zero-padded', () => {
    expect(parseDayCell('2026-09-07')).toBe('2026-09-07')
    expect(parseDayCell('2026-9-7')).toBe('2026-09-07')
  })

  it('reads Swedish day-first dates', () => {
    expect(parseDayCell('7/9/2026')).toBe('2026-09-07')
    expect(parseDayCell('07.09.2026')).toBe('2026-09-07')
  })

  it('reads Excel serial numbers from the epoch Excel actually counts from', () => {
    // 45907 = 2025-09-07 in Excel's 1899-12-30 based numbering.
    expect(parseDayCell(46272)).toBe('2026-09-07')
  })

  it('returns null for anything that is not a date, rather than inventing one', () => {
    expect(parseDayCell('Station')).toBeNull()
    expect(parseDayCell('')).toBeNull()
    expect(parseDayCell(null)).toBeNull()
    expect(parseDayCell(0)).toBeNull()
  })
})

describe('guessDayColumns', () => {
  it('picks the date-like headers and sorts them chronologically', () => {
    expect(guessDayColumns(['Station', '2026-09-03', 'Totalt', '2026-09-01', '2026-09-02'])).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ])
  })
})

describe('normalizeWideStationDays', () => {
  it('expands one row per station into one row per day', () => {
    const rows = [{ stn: '11', '2026-09-01': '1500', '2026-09-02': '1700' }]
    expect(normalizeWideStationDays(rows, 'stn', ['2026-09-01', '2026-09-02'])).toEqual([
      { station: '11', datum: '2026-09-01', rader: 1500 },
      { station: '11', datum: '2026-09-02', rader: 1700 },
    ])
  })

  it('drops rows with no station', () => {
    const rows = [{ stn: '', '2026-09-01': '10' }]
    expect(normalizeWideStationDays(rows, 'stn', ['2026-09-01'])).toEqual([])
  })
})

describe('normalizeLongStationDays', () => {
  it('maps station+datum+rader straight through', () => {
    const rows = [{ stn: '11', dag: '2026-09-01', antal: '1500' }]
    expect(normalizeLongStationDays(rows, 'stn', 'dag', 'antal')).toEqual([
      { station: '11', datum: '2026-09-01', rader: 1500 },
    ])
  })

  it('drops a row whose date cannot be read, rather than guessing a day', () => {
    const rows = [{ stn: '11', dag: 'vecka 36', antal: '1500' }]
    expect(normalizeLongStationDays(rows, 'stn', 'dag', 'antal')).toEqual([])
  })
})

describe('sumStationDays', () => {
  it('adds up several rows for the same station and day', () => {
    // An export split by shift gives one row per shift; together they are
    // the lines picked at that station that day.
    const rows = [
      { station: '11', datum: '2026-09-01', rader: 900 },
      { station: '11', datum: '2026-09-01', rader: 600 },
      { station: '11', datum: '2026-09-02', rader: 1700 },
    ]
    expect(sumStationDays(rows)).toEqual([
      { station: '11', datum: '2026-09-01', rader: 1500 },
      { station: '11', datum: '2026-09-02', rader: 1700 },
    ])
  })
})

describe('summarizeStationLoad', () => {
  it('reports lines per day, so a part-way-through month is comparable to a full one', () => {
    const rows = [
      { station: '11', datum: '2026-09-01', rader: 1500 },
      { station: '11', datum: '2026-09-02', rader: 1700 },
      { station: '36', datum: '2026-09-01', rader: 200 },
    ]
    expect(summarizeStationLoad(rows)).toEqual([
      { station: '11', total: 3200, days: 2, perDay: 1600 },
      { station: '36', total: 200, days: 1, perDay: 200 },
    ])
  })

  it('counts a day once even when the station has several rows for it', () => {
    const rows = [
      { station: '11', datum: '2026-09-01', rader: 900 },
      { station: '11', datum: '2026-09-01', rader: 600 },
    ]
    expect(summarizeStationLoad(rows)[0]).toMatchObject({ days: 1, perDay: 1500 })
  })

  it('puts the busiest station first', () => {
    const rows = [
      { station: '36', datum: '2026-09-01', rader: 200 },
      { station: '11', datum: '2026-09-01', rader: 1500 },
    ]
    expect(summarizeStationLoad(rows).map((r) => r.station)).toEqual(['11', '36'])
  })
})
