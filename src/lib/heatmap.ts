import * as XLSX from 'xlsx'
import JSZip from 'jszip'

const LOCATION_RE = /^P\d{4}-(\d{2})--([A-Z])-/

export interface HeatmapZoneResult {
  loc: string
  zone: 'green' | 'red'
  value: number
}

interface LocationValue {
  loc: string
  stationPart: string
  total: number
  /** Cell used to look up which conditional-formatting rule applies (the first cell that carried a real value). */
  representativeAddr: string
}

/**
 * Extracts (location, pick-value) pairs from a "heatmap" export sheet: the
 * location label (`P####-##--X-`) and its value sit in a visual grid mimicking
 * the physical rack layout, not a normal table — the value is exactly 2 rows
 * below the label, same column. Two things are NOT real data, and both get
 * excluded exactly like a genuinely empty cell:
 *   - cells with no value at all (no pick activity that period)
 *   - text-typed cells whose "value" exactly mirrors the location's own
 *     embedded station number (with or without a leading zero) — a stray
 *     layout artifact from how this sheet was built, confirmed by checking
 *     there's nothing further below it either. This check only applies to
 *     text cells, not numbers: every confirmed artifact was stored as a
 *     string, while genuine pick counts are native Excel numbers — a real
 *     numeric value that happens to coincidentally equal its own station
 *     number (confirmed to occur, e.g. a real count of 3 at station "03")
 *     is kept. Checking the value alone regardless of cell type would
 *     silently drop real data.
 * A location appearing more than once (seen in real exports, e.g. a pallet
 * position visited by more than one loop) has its values summed.
 */
export function extractLocationValues(sheet: XLSX.WorkSheet): Map<string, LocationValue> {
  const ref = sheet['!ref']
  const result = new Map<string, LocationValue>()
  if (!ref) return result

  const range = XLSX.utils.decode_range(ref)
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = sheet[addr]
      if (!cell || typeof cell.v !== 'string') continue
      const m = cell.v.match(LOCATION_RE)
      if (!m) continue
      const stationPart = m[1]

      const valueAddr = XLSX.utils.encode_cell({ r: r + 2, c })
      const valueCell = sheet[valueAddr]
      const raw = valueCell ? valueCell.v : null
      if (raw === '' || raw == null) continue

      let asNum: number
      if (typeof raw === 'number') {
        asNum = raw // native number: trust it, even if it coincidentally equals the station number
      } else {
        const parsed = Number(raw)
        if (!Number.isFinite(parsed)) continue
        if (parsed === Number(stationPart)) continue // text mirroring the station number: artifact, not real data
        asNum = parsed
      }

      const existing = result.get(cell.v)
      if (existing) existing.total += asNum
      else result.set(cell.v, { loc: cell.v, stationPart, total: asNum, representativeAddr: valueAddr })
    }
  }
  return result
}

export interface ColorScaleRule {
  ranges: string[]
  priority: number
  minColor: string
  maxColor: string
}

const CF_BLOCK_RE = /<conditionalFormatting sqref="([^"]+)">([\s\S]*?)<\/conditionalFormatting>/g
const CF_RULE_RE = /<cfRule type="colorScale" priority="(\d+)">\s*<colorScale>([\s\S]*?)<\/colorScale>\s*<\/cfRule>/g

/**
 * Parses Excel's colorScale conditional-formatting rules straight from the
 * worksheet XML — SheetJS's cell API doesn't expose these. Real files can
 * have TWO rules on the identical range with opposite polarity (min=red vs
 * min=green) and different priority numbers, left over from someone editing
 * the scale after the fact; Excel resolves that by lowest-priority-number-
 * wins, applied globally across the sheet, not scoped to one block — so
 * every rule is returned flat with its own priority rather than grouped.
 */
export function parseColorScaleRules(sheetXml: string): ColorScaleRule[] {
  const rules: ColorScaleRule[] = []
  CF_BLOCK_RE.lastIndex = 0
  let blockMatch: RegExpExecArray | null
  while ((blockMatch = CF_BLOCK_RE.exec(sheetXml))) {
    const ranges = blockMatch[1].trim().split(/\s+/)
    const body = blockMatch[2]
    CF_RULE_RE.lastIndex = 0
    let ruleMatch: RegExpExecArray | null
    while ((ruleMatch = CF_RULE_RE.exec(body))) {
      const priority = Number(ruleMatch[1])
      const colorMatches = [...ruleMatch[2].matchAll(/<color rgb="FF([0-9A-Fa-f]{6})"\/>/g)]
      if (colorMatches.length !== 3) continue // only the standard 3-stop scale is handled
      const colors = colorMatches.map((cm) => cm[1].toUpperCase())
      rules.push({ ranges, priority, minColor: colors[0], maxColor: colors[2] })
    }
  }
  return rules
}

function cellsInRange(rangeStr: string): { r: number; c: number }[] {
  const decoded = XLSX.utils.decode_range(rangeStr)
  const out: { r: number; c: number }[] = []
  for (let r = decoded.s.r; r <= decoded.e.r; r++) {
    for (let c = decoded.s.c; c <= decoded.e.c; c++) out.push({ r, c })
  }
  return out
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

const GREEN = '63BE7B'
const RED = 'F8696B'

/**
 * Classifies every location as green or red zone: the color scale is
 * percentile-based and applied per local section (many small, separate
 * ranges, not one global scale), so a value counts as "green" only relative
 * to its own neighbourhood's median — the same value could be green in one
 * section and red in another. Locations with no applicable formatting, or
 * whose winning rule resolves to the middle (yellow) color, are omitted
 * rather than guessed at.
 */
export function classifyHeatmapZones(sheet: XLSX.WorkSheet, sheetXml: string): HeatmapZoneResult[] {
  const locationValues = extractLocationValues(sheet)
  const rules = parseColorScaleRules(sheetXml)

  const addrToRuleIdxs = new Map<string, number[]>()
  for (let ri = 0; ri < rules.length; ri++) {
    for (const rangeStr of rules[ri].ranges) {
      for (const { r, c } of cellsInRange(rangeStr)) {
        const addr = XLSX.utils.encode_cell({ r, c })
        const list = addrToRuleIdxs.get(addr)
        if (list) list.push(ri)
        else addrToRuleIdxs.set(addr, [ri])
      }
    }
  }

  const medianCache = new Map<number, number | null>()
  function localMedianFor(ruleIdx: number): number | null {
    if (medianCache.has(ruleIdx)) return medianCache.get(ruleIdx)!
    const values: number[] = []
    for (const rangeStr of rules[ruleIdx].ranges) {
      for (const { r, c } of cellsInRange(rangeStr)) {
        const addr = XLSX.utils.encode_cell({ r, c })
        const cell = sheet[addr]
        if (cell && typeof cell.v === 'number') values.push(cell.v)
      }
    }
    const med = median(values)
    medianCache.set(ruleIdx, med)
    return med
  }

  const results: HeatmapZoneResult[] = []
  for (const lv of locationValues.values()) {
    const ruleIdxs = addrToRuleIdxs.get(lv.representativeAddr)
    if (!ruleIdxs || ruleIdxs.length === 0) continue

    let winningIdx = ruleIdxs[0]
    for (const idx of ruleIdxs) if (rules[idx].priority < rules[winningIdx].priority) winningIdx = idx
    const rule = rules[winningIdx]
    const localMedian = localMedianFor(winningIdx)
    if (localMedian == null) continue

    const rgb = lv.total >= localMedian ? rule.maxColor : rule.minColor
    if (rgb !== GREEN && rgb !== RED) continue
    results.push({ loc: lv.loc, zone: rgb === GREEN ? 'green' : 'red', value: lv.total })
  }
  return results
}

/**
 * Reads the raw XML for one worksheet out of an uploaded .xlsx file — needed
 * because SheetJS's normal cell-reading API doesn't expose conditional
 * formatting. An xlsx file is a zip archive; `xl/worksheets/sheetN.xml`
 * files are numbered in workbook order, which SheetJS's own `SheetNames`
 * also reflects, so `sheetIndex` (0-based, matching `SheetNames`) maps to
 * `sheet{sheetIndex + 1}.xml` for files that haven't been unusually
 * restructured — true for normal Excel-saved files.
 */
export async function extractSheetXml(file: File, sheetIndex: number): Promise<string> {
  const zip = await JSZip.loadAsync(file)
  const entry = zip.file(`xl/worksheets/sheet${sheetIndex + 1}.xml`)
  if (!entry) throw new Error(`Kunde inte hitta blad ${sheetIndex + 1} i filen.`)
  return entry.async('string')
}

export interface PrefixMatchResult {
  matched: string[]
  unmatchedPrefixes: string[]
}

/**
 * A heatmap location label is a PREFIX of the real location code, not a
 * complete identifier — e.g. the heatmap's "P1010-01--A-" corresponds to
 * the real locations "P1010-01--A-2-" and "P1010-01--A-3-" (different
 * shelf levels within the same bay+letter), which the label itself doesn't
 * distinguish. Treating the label as if it WERE a plats would stage a tag
 * for a location that doesn't exist. This matches every real, already-known
 * location whose plats starts with the heatmap's prefix instead — a prefix
 * with no match at all means those specific shelf-level locations haven't
 * been imported into the platskarta yet, so it's reported rather than
 * silently dropped or invented.
 */
export function matchHeatmapPrefixesToLocations(prefixes: string[], allPlats: string[]): PrefixMatchResult {
  const matched: string[] = []
  const unmatchedPrefixes: string[] = []
  for (const prefix of prefixes) {
    const matches = allPlats.filter((plats) => plats.startsWith(prefix))
    if (matches.length > 0) matched.push(...matches)
    else unmatchedPrefixes.push(prefix)
  }
  return { matched, unmatchedPrefixes }
}
