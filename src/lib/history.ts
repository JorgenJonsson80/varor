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

/** Canonicalizes a recognized month column header to sortable 'YYYY-MM'; passes through unrecognized headers as-is. */
export function normalizeMonthLabel(column: string): string {
  const parsed = parseMonthColumn(column)
  if (!parsed) return column
  return `${parsed.year}-${String(parsed.month).padStart(2, '0')}`
}

export interface PlockstatistikRow {
  itemId: string
  plats: string
  period: string
  volume: number
}

/**
 * Collapses duplicate (itemId, period) rows down to one, keeping the row
 * with the most picks that month.
 *
 * A wide-format export has one row per vara+plats, so an item that has
 * moved appears on several rows, one per location it has been picked
 * from, each carrying the full set of month columns. For any given month
 * the location it was actually picked from is the one with volume on it;
 * the other rows are that month's zeros from locations it wasn't at.
 * Taking the largest is what tells those apart. Row order cannot: the
 * export doesn't put old and new locations in a consistent order, and
 * going by order also let both rows reach the database and race each
 * other in parallel upsert chunks. Ties (typically all-zero months) keep
 * the last row, so the outcome stays deterministic either way.
 */
export function dedupeVolumeRows(rows: PlockstatistikRow[]): PlockstatistikRow[] {
  const byKey = new Map<string, PlockstatistikRow>()
  for (const row of rows) {
    const key = row.itemId + " " + row.period
    const existing = byKey.get(key)
    if (!existing || row.volume >= existing.volume) byKey.set(key, row)
  }
  return Array.from(byKey.values())
}

/**
 * Plockstatistik rows carry vara+plats per the source file (an item's
 * current location comes bundled with its pick volume, not from a separate
 * register). Wide format: one row per vara+plats, one column per month.
 * Rows missing an item id or location are dropped rather than imported
 * with a blank key.
 */
export function normalizeWideRows(
  rows: Record<string, unknown>[],
  itemColumn: string,
  platsColumn: string,
  monthColumns: string[],
): PlockstatistikRow[] {
  const result: PlockstatistikRow[] = []
  for (const row of rows) {
    const itemId = String(row[itemColumn] ?? '').trim()
    const plats = String(row[platsColumn] ?? '').trim()
    if (!itemId || !plats) continue
    for (const column of monthColumns) {
      result.push({ itemId, plats, period: normalizeMonthLabel(column), volume: toNumber(row[column]) })
    }
  }
  return result
}

/** Long format: one row per vara+plats+period, with a separate value column. */
export function normalizeLongRows(
  rows: Record<string, unknown>[],
  itemColumn: string,
  platsColumn: string,
  periodColumn: string,
  volumeColumn: string,
): PlockstatistikRow[] {
  const result: PlockstatistikRow[] = []
  for (const row of rows) {
    const itemId = String(row[itemColumn] ?? '').trim()
    const plats = String(row[platsColumn] ?? '').trim()
    const period = String(row[periodColumn] ?? '').trim()
    if (!itemId || !plats || !period) continue
    result.push({ itemId, plats, period, volume: toNumber(row[volumeColumn]) })
  }
  return result
}

export interface ItemPlacement {
  itemId: string
  plats: string
}

/**
 * Works out where each article currently sits, straight from the imported
 * list — the file is the authority on placement, so this is what gets
 * written down rather than inferred from history later.
 *
 * A wide-format export has one row per vara+plats, so an article that has
 * moved appears once per location it has been picked from. The one it sits
 * on now is the one with picks in the newest month the file covers; when
 * that month is only part-way through, most articles have no picks in it
 * at all, so the comparison walks back month by month until something
 * separates them. An article never picked anywhere in the file falls back
 * to its last listed location, so an idle article still has a placement.
 */
export function resolveImportedPlacements(rows: PlockstatistikRow[]): ItemPlacement[] {
  const periods = Array.from(new Set(rows.map((r) => r.period))).sort()

  const byItem = new Map<string, Map<string, Map<string, number>>>()
  for (const row of rows) {
    let perPlats = byItem.get(row.itemId)
    if (!perPlats) {
      perPlats = new Map()
      byItem.set(row.itemId, perPlats)
    }
    let perPeriod = perPlats.get(row.plats)
    if (!perPeriod) {
      perPeriod = new Map()
      perPlats.set(row.plats, perPeriod)
    }
    perPeriod.set(row.period, (perPeriod.get(row.period) ?? 0) + row.volume)
  }

  const placements: ItemPlacement[] = []
  for (const [itemId, perPlats] of byItem) {
    const platser = Array.from(perPlats.keys())
    let winner = platser[platser.length - 1]

    for (let i = periods.length - 1; i >= 0; i--) {
      const period = periods[i]
      let best = ''
      let bestVolume = 0
      for (const plats of platser) {
        const volume = perPlats.get(plats)?.get(period) ?? 0
        if (volume > bestVolume) {
          best = plats
          bestVolume = volume
        }
      }
      if (best !== '') {
        winner = best
        break
      }
    }

    placements.push({ itemId, plats: winner })
  }

  return placements
}

/**
 * Returns the 'YYYY-MM' period `monthsBack` months before `referenceDate`
 * — used to bound a rolling fetch window. The day-of-month is reset to 1
 * before subtracting months: without that, subtracting from e.g. March
 * 31st lands on "September 31st", which doesn't exist, and JS Date
 * silently rolls it forward into October — a month later than intended.
 */
export function periodCutoff(monthsBack: number, referenceDate: Date = new Date()): string {
  const d = new Date(referenceDate)
  d.setDate(1)
  d.setMonth(d.getMonth() - monthsBack)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
