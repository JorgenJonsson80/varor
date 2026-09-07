import { toNumber } from './history'

export interface StationDayRow {
  station: string
  /** ISO date, 'YYYY-MM-DD'. */
  datum: string
  rader: number
}

/**
 * Coerces whatever the export puts in a date cell to 'YYYY-MM-DD'.
 * Handles ISO already, Swedish d/m/yyyy and d.m.yyyy, and Excel serial
 * numbers (days since 1899-12-30, the epoch Excel actually counts from).
 * Returns null when it isn't a date, so the caller can drop the row rather
 * than inventing one — a mis-parsed date silently lands the lines on the
 * wrong day.
 */
export function parseDayCell(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 1 || value > 60000) return null
    const ms = Math.round(value) * 86400000
    return new Date(Date.UTC(1899, 11, 30) + ms).toISOString().slice(0, 10)
  }

  const text = String(value).trim()
  if (text === '') return null

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`

  const swedish = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (swedish) return `${swedish[3]}-${swedish[2].padStart(2, '0')}-${swedish[1].padStart(2, '0')}`

  return null
}

/** "Gissa"-helper: the columns that look like dates, in chronological order. */
export function guessDayColumns(columnNames: string[]): string[] {
  return columnNames
    .map((name) => ({ name, day: parseDayCell(name) }))
    .filter((entry): entry is { name: string; day: string } => entry.day !== null)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((entry) => entry.name)
}

/** Wide: one row per station, one column per day. */
export function normalizeWideStationDays(
  rows: Record<string, unknown>[],
  stationColumn: string,
  dayColumns: string[],
): StationDayRow[] {
  const result: StationDayRow[] = []
  for (const row of rows) {
    const station = String(row[stationColumn] ?? '').trim()
    if (!station) continue
    for (const column of dayColumns) {
      const datum = parseDayCell(column)
      if (!datum) continue
      result.push({ station, datum, rader: toNumber(row[column]) })
    }
  }
  return result
}

/** Long: one row per station+day, with a separate count column. */
export function normalizeLongStationDays(
  rows: Record<string, unknown>[],
  stationColumn: string,
  dayColumn: string,
  raderColumn: string,
): StationDayRow[] {
  const result: StationDayRow[] = []
  for (const row of rows) {
    const station = String(row[stationColumn] ?? '').trim()
    const datum = parseDayCell(row[dayColumn])
    if (!station || !datum) continue
    result.push({ station, datum, rader: toNumber(row[raderColumn]) })
  }
  return result
}

/**
 * Collapses duplicate station+day rows by summing them — an export split by
 * shift or by picker gives several rows for the same station and day, and
 * those are all lines picked there that day.
 */
export function sumStationDays(rows: StationDayRow[]): StationDayRow[] {
  const byKey = new Map<string, StationDayRow>()
  for (const row of rows) {
    const key = row.station + ' ' + row.datum
    const existing = byKey.get(key)
    if (existing) existing.rader += row.rader
    else byKey.set(key, { ...row })
  }
  return Array.from(byKey.values())
}

export interface StationLoad {
  station: string
  /** Total lines across every imported day. */
  total: number
  /** Days with data for this station — the divisor behind perDay. */
  days: number
  /** Lines per day, which is what makes a part-way-through month comparable to a full one. */
  perDay: number
}

/**
 * Lines per day per station.
 *
 * Per day rather than per month on purpose: a month that is three days old
 * has a tenth of the lines a finished one has, and comparing those two
 * totals says nothing. Dividing by the days actually covered makes any
 * stretch comparable to any other.
 */
export function summarizeStationLoad(rows: StationDayRow[]): StationLoad[] {
  const byStation = new Map<string, { total: number; days: Set<string> }>()
  for (const row of rows) {
    let entry = byStation.get(row.station)
    if (!entry) {
      entry = { total: 0, days: new Set() }
      byStation.set(row.station, entry)
    }
    entry.total += row.rader
    entry.days.add(row.datum)
  }

  return Array.from(byStation.entries())
    .map(([station, { total, days }]) => ({
      station,
      total,
      days: days.size,
      perDay: days.size > 0 ? total / days.size : 0,
    }))
    .sort((a, b) => b.perDay - a.perDay || a.station.localeCompare(b.station, undefined, { numeric: true }))
}
