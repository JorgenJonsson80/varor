import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import fs from 'node:fs'
import JSZip from 'jszip'
import { classifyHeatmapZones } from '../heatmap'
import { getStation } from '../location'

const REAL_FILE = '/Users/jorgenjonsson/Downloads/Copy of Heatmap line 1 2 4 6.xlsx'

describe.skipIf(!fs.existsSync(REAL_FILE))('smoke test against the real heatmap file (not committed, local only)', () => {
  it('matches the manually-validated counts from the one-off analysis', async () => {
    const buffer = fs.readFileSync(REAL_FILE)
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const sheetName = workbook.SheetNames.find((n) => !/summ/i.test(n)) ?? workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]

    const zip = await JSZip.loadAsync(buffer)
    const sheetIndex = workbook.SheetNames.indexOf(sheetName)
    const entry = zip.file(`xl/worksheets/sheet${sheetIndex + 1}.xml`)
    const sheetXml = await entry!.async('string')

    const results = classifyHeatmapZones(sheet, sheetXml)
    const green = results.filter((r) => r.zone === 'green')
    const red = results.filter((r) => r.zone === 'red')

    // Hand-validated in the original Node investigation: 135 green, 181 red, 316 total.
    expect(results.length).toBe(316)
    expect(green.length).toBe(135)
    expect(red.length).toBe(181)

    // Spot checks from the manual walkthrough.
    const byLoc = Object.fromEntries(results.map((r) => [r.loc, r]))
    expect(byLoc['P6060-03--A-']).toMatchObject({ zone: 'red', value: 1 })
    expect(byLoc['P6060-05--B-']).toMatchObject({ zone: 'green', value: 350 })

    // Station 10-67 minus 36/50 scoping shouldn't drop anything for this file
    // (it doesn't cover those stations anyway) — sanity check the filter itself.
    const inScope = results.filter((r) => {
      const station = getStation(r.loc, 4, 5)
      if (station === '36' || station === '50') return false
      const n = Number(station)
      return n >= 10 && n <= 67
    })
    expect(inScope.length).toBe(316)
  })
})
