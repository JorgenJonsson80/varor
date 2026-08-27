import { describe, expect, it } from 'vitest'
import type * as XLSXType from 'xlsx'
import {
  classifyHeatmapZones,
  extractLocationValues,
  matchHeatmapPrefixesToLocations,
  parseColorScaleRules,
} from '../heatmap'

type Sheet = XLSXType.WorkSheet

function makeSheet(cells: Record<string, string | number>, ref: string): Sheet {
  const sheet: Sheet = { '!ref': ref } as Sheet
  for (const [addr, v] of Object.entries(cells)) {
    ;(sheet as Record<string, unknown>)[addr] = { v, t: typeof v === 'number' ? 'n' : 's' }
  }
  return sheet
}

describe('extractLocationValues', () => {
  it('reads the value exactly 2 rows below the location label, same column', () => {
    const sheet = makeSheet({ B1: 'P6060-01--A-', B3: 10 }, 'A1:D10')
    const result = extractLocationValues(sheet)
    expect(result.get('P6060-01--A-')).toMatchObject({ loc: 'P6060-01--A-', total: 10, representativeAddr: 'B3' })
  })

  it('treats a missing or empty value cell as no data', () => {
    const sheet = makeSheet({ B1: 'P6060-07--A-' }, 'A1:D10')
    const result = extractLocationValues(sheet)
    expect(result.size).toBe(0)
  })

  it('excludes a TEXT value that exactly mirrors the location\'s own station number (mirror artifact)', () => {
    // Station part is "05"; a text value of "5" here is a layout artifact, not real data.
    const sheet = makeSheet({ B1: 'P6060-05--A-', B3: '5' }, 'A1:D10')
    const result = extractLocationValues(sheet)
    expect(result.size).toBe(0)
  })

  it('keeps a NUMBER value that coincidentally equals the station number — confirmed to occur in real data', () => {
    // Real example found in the source file: station "03" with a genuine
    // native-number pick count of 3. Every confirmed artifact was
    // text-typed; a real number shouldn't be discarded on a coincidence.
    const sheet = makeSheet({ B1: 'P6060-03--A-', B3: 3 }, 'A1:D10')
    const result = extractLocationValues(sheet)
    expect(result.get('P6060-03--A-')?.total).toBe(3)
  })

  it('keeps a real value even when it happens to be a numeric string, if it does not match the station', () => {
    const sheet = makeSheet({ B1: 'P6060-05--A-', B3: '42' }, 'A1:D10')
    const result = extractLocationValues(sheet)
    expect(result.get('P6060-05--A-')?.total).toBe(42)
  })

  it('sums values for a location that appears more than once, keeping the first cell as representative', () => {
    const sheet = makeSheet({ B1: 'P6060-01--A-', B3: 10, F1: 'P6060-01--A-', F3: 5 }, 'A1:H10')
    const result = extractLocationValues(sheet)
    expect(result.get('P6060-01--A-')).toMatchObject({ total: 15, representativeAddr: 'B3' })
  })
})

describe('parseColorScaleRules', () => {
  it('parses a single-rule conditionalFormatting block', () => {
    const xml =
      '<conditionalFormatting sqref="J7:CU8"><cfRule type="colorScale" priority="8">' +
      '<colorScale><cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>' +
      '<color rgb="FFF8696B"/><color rgb="FFFFEB84"/><color rgb="FF63BE7B"/></colorScale>' +
      '</cfRule></conditionalFormatting>'
    const rules = parseColorScaleRules(xml)
    expect(rules).toEqual([{ ranges: ['J7:CU8'], priority: 8, minColor: 'F8696B', maxColor: '63BE7B' }])
  })

  it('parses both rules of a dual-rule (overridden-polarity) block, each with its own priority', () => {
    const xml =
      '<conditionalFormatting sqref="A1:A2">' +
      '<cfRule type="colorScale" priority="127"><colorScale><cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>' +
      '<color rgb="FFF8696B"/><color rgb="FFFFEB84"/><color rgb="FF63BE7B"/></colorScale></cfRule>' +
      '<cfRule type="colorScale" priority="128"><colorScale><cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>' +
      '<color rgb="FF63BE7B"/><color rgb="FFFFEB84"/><color rgb="FFF8696B"/></colorScale></cfRule>' +
      '</conditionalFormatting>'
    const rules = parseColorScaleRules(xml)
    expect(rules).toEqual([
      { ranges: ['A1:A2'], priority: 127, minColor: 'F8696B', maxColor: '63BE7B' },
      { ranges: ['A1:A2'], priority: 128, minColor: '63BE7B', maxColor: 'F8696B' },
    ])
  })
})

describe('classifyHeatmapZones', () => {
  const xml =
    '<conditionalFormatting sqref="B3:C3"><cfRule type="colorScale" priority="1">' +
    '<colorScale><cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>' +
    '<color rgb="FFF8696B"/><color rgb="FFFFEB84"/><color rgb="FF63BE7B"/></colorScale>' +
    '</cfRule></conditionalFormatting>'

  it('classifies above the local median as green and below as red', () => {
    const sheet = makeSheet(
      { B1: 'P6060-01--A-', B3: 10, C1: 'P6060-03--A-', C3: 90 },
      'A1:D10',
    )
    const results = classifyHeatmapZones(sheet, xml)
    expect(results).toEqual(
      expect.arrayContaining([
        { loc: 'P6060-01--A-', zone: 'red', value: 10 },
        { loc: 'P6060-03--A-', zone: 'green', value: 90 },
      ]),
    )
  })

  it('resolves overlapping rules by lowest priority number, not first-declared', () => {
    const overlapXml =
      '<conditionalFormatting sqref="B3:C3"><cfRule type="colorScale" priority="99">' +
      '<colorScale><cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>' +
      '<color rgb="FF63BE7B"/><color rgb="FFFFEB84"/><color rgb="FFF8696B"/></colorScale>' + // reversed: min=green
      '</cfRule></conditionalFormatting>' +
      '<conditionalFormatting sqref="B3:C3"><cfRule type="colorScale" priority="1">' +
      '<colorScale><cfvo type="min"/><cfvo type="percentile" val="50"/><cfvo type="max"/>' +
      '<color rgb="FFF8696B"/><color rgb="FFFFEB84"/><color rgb="FF63BE7B"/></colorScale>' + // standard: min=red
      '</cfRule></conditionalFormatting>'
    const sheet = makeSheet({ B1: 'P6060-01--A-', B3: 10, C1: 'P6060-03--A-', C3: 90 }, 'A1:D10')
    const results = classifyHeatmapZones(sheet, overlapXml)
    // Priority 1 (standard polarity) must win over priority 99, regardless of declaration order.
    expect(results).toEqual(
      expect.arrayContaining([
        { loc: 'P6060-01--A-', zone: 'red', value: 10 },
        { loc: 'P6060-03--A-', zone: 'green', value: 90 },
      ]),
    )
  })

  it('omits a location with no conditional formatting covering its cell', () => {
    const sheet = makeSheet({ Z1: 'P6060-09--A-', Z3: 50 }, 'A1:Z10')
    const results = classifyHeatmapZones(sheet, xml)
    expect(results.find((r) => r.loc === 'P6060-09--A-')).toBeUndefined()
  })
})

describe('matchHeatmapPrefixesToLocations', () => {
  it('expands a heatmap prefix to every real location that starts with it', () => {
    const allPlats = ['P1010-01--A-2-', 'P1010-01--A-3-', 'P1010-01--B-2-']
    const { matched, unmatchedPrefixes } = matchHeatmapPrefixesToLocations(['P1010-01--A-'], allPlats)
    expect(matched.sort()).toEqual(['P1010-01--A-2-', 'P1010-01--A-3-'])
    expect(unmatchedPrefixes).toEqual([])
  })

  it('does not treat the prefix itself as a real location, even if nothing matches', () => {
    const { matched, unmatchedPrefixes } = matchHeatmapPrefixesToLocations(['P9999-01--A-'], ['P1010-01--A-2-'])
    expect(matched).toEqual([])
    expect(unmatchedPrefixes).toEqual(['P9999-01--A-'])
  })

  it('handles a mix of matched and unmatched prefixes', () => {
    const allPlats = ['P1010-01--A-2-', 'P1010-03--B-2-']
    const result = matchHeatmapPrefixesToLocations(['P1010-01--A-', 'P1010-99--Z-'], allPlats)
    expect(result.matched).toEqual(['P1010-01--A-2-'])
    expect(result.unmatchedPrefixes).toEqual(['P1010-99--Z-'])
  })
})
