/** Coerces a raw cell value (string, number, empty, Swedish decimal comma) to a number, defaulting to 0. */
export function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Wide format: one row per item, one column per month. `orderedColumns`
 * must already be in chronological order (last = latest month) — the user
 * picks that order in the UI, this just reads it out.
 */
export function buildSeriesFromWide(row: Record<string, unknown>, orderedColumns: string[]): number[] {
  return orderedColumns.map((column) => toNumber(row[column]))
}

export interface LongRow {
  id: string
  period: string
  value: number
}

export interface LongSeries {
  periods: string[]
  series: number[]
}

/** Long format: a period column + a value column. Periods sort ascending as text. */
export function groupLongFormat(rows: LongRow[]): Map<string, LongSeries> {
  const byId = new Map<string, LongRow[]>()
  for (const row of rows) {
    const existing = byId.get(row.id)
    if (existing) existing.push(row)
    else byId.set(row.id, [row])
  }

  const result = new Map<string, LongSeries>()
  for (const [id, entries] of byId) {
    const sorted = [...entries].sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0))
    result.set(id, {
      periods: sorted.map((e) => e.period),
      series: sorted.map((e) => e.value),
    })
  }
  return result
}

const SWEDISH_MONTHS: Record<string, number> = {
  januari: 1, jan: 1,
  februari: 2, feb: 2,
  mars: 3, mar: 3,
  april: 4, apr: 4,
  maj: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  augusti: 8, aug: 8,
  september: 9, sep: 9,
  oktober: 10, okt: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
}

interface ParsedMonth {
  year: number
  month: number
}

function normalizeYear(rawYear: number): number {
  if (rawYear >= 100) return rawYear
  return rawYear >= 70 ? 1900 + rawYear : 2000 + rawYear
}

/** Best-effort parse of a month-like column header. Returns null when the header isn't recognized as a month. */
export function parseMonthColumn(name: string): ParsedMonth | null {
  const trimmed = name.trim().toLowerCase().replace(/\.$/, '')

  // 2024-01, 2024-01-01
  let match = trimmed.match(/^(\d{4})-(\d{1,2})(-\d{1,2})?$/)
  if (match) return { year: Number(match[1]), month: Number(match[2]) }

  // 2024/01 or 01/2024, 2024.01
  match = trimmed.match(/^(\d{4})[/.](\d{1,2})$/)
  if (match) return { year: Number(match[1]), month: Number(match[2]) }

  match = trimmed.match(/^(\d{1,2})[/.-](\d{4})$/)
  if (match) return { year: Number(match[2]), month: Number(match[1]) }

  // 202401 (YYYYMM)
  match = trimmed.match(/^(\d{4})(\d{2})$/)
  if (match) {
    const month = Number(match[2])
    if (month >= 1 && month <= 12) return { year: Number(match[1]), month }
  }

  // Swedish month name + year: "januari 2024", "jan-24", "jan24"
  match = trimmed.match(/^([a-zåäö]+)[\s-]?(\d{2,4})$/)
  if (match) {
    const monthNumber = SWEDISH_MONTHS[match[1]]
    if (monthNumber) return { year: normalizeYear(Number(match[2])), month: monthNumber }
  }

  return null
}

/** "Gissa"-button helper: filters and chronologically sorts the month-like columns among all headers. */
export function guessMonthColumns(columnNames: string[]): string[] {
  const parsed = columnNames
    .map((name) => ({ name, parsed: parseMonthColumn(name) }))
    .filter((entry): entry is { name: string; parsed: ParsedMonth } => entry.parsed !== null)

  parsed.sort((a, b) => a.parsed.year - b.parsed.year || a.parsed.month - b.parsed.month)
  return parsed.map((entry) => entry.name)
}
