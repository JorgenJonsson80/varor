import { describe, expect, it } from 'vitest'
import { buildResultRows, groupRawVolumeRows, sortResultRows, type ResultRow } from '../results'
import type { PlatsklassConfig } from '../types'

const periodLabels = ['2024-01', '2024-02', '2024-03', '2024-04']

// LOC-C locations hit the rule (ends in 'C' -> C). LOC-A is manually tagged
// A. Anything else (e.g. LOC-B) falls through to the base class B.
const platsklassConfig: PlatsklassConfig = {
  manual: { 'LOC-A': 'A' },
  rules: [{ position: 1, values: ['C'], klass: 'C' }],
  baseKlass: 'B',
  stationStart: 4,
  stationEnd: 5,
}

const config = {
  pareto: { a: 0.8, b: 0.95 },
  trend: { precedingMonths: 3, threshold: 0.25 },
  periodGood: { topN: 2, threshold: 0.6, minPeriods: 4 },
}

describe('buildResultRows', () => {
  it('flags an A-vara on a C-plats as the top-priority signal', () => {
    const items = [
      { id: 'A1', plats: 'LOC-C', series: [700, 700, 700, 700] }, // 70% cumulative share -> A
      { id: 'A2', plats: 'LOC-B', series: [300, 300, 300, 300] },
    ]
    const rows = buildResultRows(items, periodLabels, platsklassConfig, config)
    const a1 = rows.find((r) => r.id === 'A1')!
    expect(a1.varuklass).toBe('A')
    expect(a1.platsklass).toBe('C')
    expect(a1.signal).toBe('A_ON_C')
  })

  it('never drops a zero-volume row', () => {
    const items = [
      { id: 'A1', plats: 'LOC-C', series: [700, 700, 700, 700] },
      { id: 'ZERO', plats: 'LOC-B', series: [0, 0, 0, 0] },
    ]
    const rows = buildResultRows(items, periodLabels, platsklassConfig, config)
    expect(rows.map((r) => r.id)).toContain('ZERO')
    expect(rows.find((r) => r.id === 'ZERO')!.varuklass).toBe('C')
  })

  it('flags a zero-volume item sitting on an A-plats', () => {
    const items = [
      { id: 'BIG', plats: 'LOC-B', series: [1000, 1000, 1000, 1000] },
      { id: 'ZERO', plats: 'LOC-A', series: [0, 0, 0, 0] },
    ]
    const rows = buildResultRows(items, periodLabels, platsklassConfig, config)
    const zero = rows.find((r) => r.id === 'ZERO')!
    expect(zero.platsklass).toBe('A')
    expect(zero.signal).toBe('ZERO_ON_A')
  })

  it('marks a period good that reached A in its history as protected', () => {
    // Concentration: top-2 (500+400)/910 ~ 0.989 -> period good.
    // Month 3 (index 2, 500 vs STEADY's constant 150): 500/650 ~ 0.77 -> A.
    const items = [
      { id: 'SEASONAL', plats: 'LOC-B', series: [0, 10, 500, 400] },
      { id: 'STEADY', plats: 'LOC-B', series: [150, 150, 150, 150] },
    ]
    const rows = buildResultRows(items, periodLabels, platsklassConfig, config)
    const seasonal = rows.find((r) => r.id === 'SEASONAL')!
    expect(seasonal.isPeriodGood).toBe(true)
    expect(seasonal.bestKlass).toBe('A')
    expect(seasonal.bestPeriod).toBe('2024-03')
    expect(seasonal.periodGoodProtected).toBe(true)
    // On a non-C plats, the period-good status itself is the reported
    // signal (rule 4) — informational, not a "move it" signal.
    expect(seasonal.signal).toBe('PERIOD_ON_GOOD')
  })

  it('resolves OK when varuklass and platsklass already match and nothing else fires', () => {
    const items = [
      { id: 'X1', plats: 'LOC-A', series: [750, 750, 750, 750] }, // 75% share -> A, manual A-plats
      { id: 'X2', plats: 'LOC-B', series: [200, 200, 200, 200] }, // 95% cumulative -> B, base B-plats
      { id: 'X3', plats: 'LOC-C', series: [50, 50, 50, 50] }, // 100% cumulative -> C, rule C-plats
    ]
    const rows = buildResultRows(items, periodLabels, platsklassConfig, config)
    expect(rows.find((r) => r.id === 'X1')).toMatchObject({ varuklass: 'A', platsklass: 'A', signal: 'OK' })
    expect(rows.find((r) => r.id === 'X2')).toMatchObject({ varuklass: 'B', platsklass: 'B', signal: 'OK' })
    expect(rows.find((r) => r.id === 'X3')).toMatchObject({ varuklass: 'C', platsklass: 'C', signal: 'OK' })
  })
})

describe('buildResultRows — viewMode', () => {
  it("defaults to the latest period, same as before viewMode existed", () => {
    const items = [
      { id: 'A1', plats: 'LOC-B', series: [0, 0, 0, 700] },
      { id: 'A2', plats: 'LOC-B', series: [0, 0, 0, 300] },
    ]
    const rows = buildResultRows(items, periodLabels, platsklassConfig, config)
    expect(rows.find((r) => r.id === 'A1')).toMatchObject({ varuklass: 'A', viewVolume: 700 })
  })

  it('classifies a single picked month independently of the rest of the series', () => {
    // Month index 0: A1=700, A2=300 -> A1 is 70% share -> A.
    // Latest month (index 3) is the reverse, so this only passes if the
    // picked period actually drives the classification.
    const items = [
      { id: 'A1', plats: 'LOC-B', series: [700, 0, 0, 300] },
      { id: 'A2', plats: 'LOC-B', series: [300, 0, 0, 700] },
    ]
    const rows = buildResultRows(items, periodLabels, platsklassConfig, config, { type: 'period', index: 0 })
    expect(rows.find((r) => r.id === 'A1')).toMatchObject({ varuklass: 'A', viewVolume: 700 })
    expect(rows.find((r) => r.id === 'A2')).toMatchObject({ varuklass: 'C', viewVolume: 300 })
  })

  it('uses the plats the item had during the picked month, not its latest plats', () => {
    const items = [
      {
        id: 'A1',
        plats: 'LOC-B',
        series: [700, 700, 700, 700],
        platsSeries: ['LOC-C', 'LOC-C', 'LOC-B', 'LOC-B'],
      },
    ]
    const rows = buildResultRows(items, periodLabels, platsklassConfig, config, { type: 'period', index: 0 })
    expect(rows[0]).toMatchObject({ plats: 'LOC-C', platsklass: 'C' })
  })

  it('falls back to the closest known earlier plats when the picked month has no row for the item', () => {
    const items = [
      {
        id: 'A1',
        plats: 'LOC-B',
        series: [700, 700, 700, 700],
        platsSeries: ['LOC-C', null, 'LOC-B', 'LOC-B'],
      },
    ]
    const rows = buildResultRows(items, periodLabels, platsklassConfig, config, { type: 'period', index: 1 })
    expect(rows[0].plats).toBe('LOC-C')
  })

  it('falls back to the closest known later plats when nothing earlier is known (item introduced after this month)', () => {
    const items = [
      {
        id: 'A1',
        plats: 'LOC-B',
        series: [0, 0, 700, 700],
        platsSeries: [null, null, 'LOC-C', 'LOC-C'],
      },
    ]
    const rows = buildResultRows(items, periodLabels, platsklassConfig, config, { type: 'period', index: 0 })
    expect(rows[0].plats).toBe('LOC-C')
  })

  it('classifies "snitt" on the average volume across all periods, not any single month', () => {
    // A1 averages 400/mo (spikes once), A2 is steady at 300/mo -> A1 has
    // the larger average and should out-rank A2 under "snitt", even though
    // most individual months A2 >= A1.
    const items = [
      { id: 'A1', plats: 'LOC-B', series: [100, 100, 100, 1300] },
      { id: 'A2', plats: 'LOC-B', series: [300, 300, 300, 300] },
    ]
    const rows = buildResultRows(items, periodLabels, platsklassConfig, config, { type: 'average' })
    const a1 = rows.find((r) => r.id === 'A1')!
    const a2 = rows.find((r) => r.id === 'A2')!
    expect(a1.viewVolume).toBe(400)
    expect(a2.viewVolume).toBe(300)
    expect(a1.varuklass).toBe('A')
  })
})

describe('groupRawVolumeRows', () => {
  it('builds an aligned series per item and picks up all distinct periods, sorted', () => {
    const rows = [
      { itemId: 'A1', plats: 'P1', period: '2024-02', volume: 20 },
      { itemId: 'A1', plats: 'P1', period: '2024-01', volume: 10 },
      { itemId: 'A2', plats: 'P2', period: '2024-01', volume: 5 },
    ]
    const { periodLabels, items } = groupRawVolumeRows(rows)
    expect(periodLabels).toEqual(['2024-01', '2024-02'])
    expect(items.find((i) => i.id === 'A1')).toEqual({
      id: 'A1',
      plats: 'P1',
      series: [10, 20],
      platsSeries: ['P1', 'P1'],
    })
    // A2 has no row for 2024-02 -> volume treated as 0, never dropped, but
    // its location for that period is genuinely unknown (null), not P2.
    expect(items.find((i) => i.id === 'A2')).toEqual({
      id: 'A2',
      plats: 'P2',
      series: [5, 0],
      platsSeries: ['P2', null],
    })
  })

  it("uses the item's own latest period as its current location, not the dataset's latest period", () => {
    // A1 stopped appearing after 2024-01 (e.g. discontinued) while A2 has 2024-02 data.
    const rows = [
      { itemId: 'A1', plats: 'OLD-LOC', period: '2024-01', volume: 10 },
      { itemId: 'A2', plats: 'P2', period: '2024-01', volume: 5 },
      { itemId: 'A2', plats: 'NEW-LOC', period: '2024-02', volume: 8 },
    ]
    const { items } = groupRawVolumeRows(rows)
    expect(items.find((i) => i.id === 'A1')!.plats).toBe('OLD-LOC')
    expect(items.find((i) => i.id === 'A2')!.plats).toBe('NEW-LOC')
  })
})

describe('sortResultRows', () => {
  function row(overrides: Partial<ResultRow>): ResultRow {
    return {
      id: 'X',
      plats: 'P',
      series: [10, 10, 10, 10],
      latestVolume: 10,
      viewVolume: 10,
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

  const rows = [
    row({ id: 'C-item', plats: 'P3', varuklass: 'C', latestVolume: 5, viewVolume: 5, signal: 'MISMATCH' }),
    row({ id: 'A-item', plats: 'P1', varuklass: 'A', latestVolume: 50, viewVolume: 50, signal: 'A_ON_C' }),
    row({ id: 'B-item', plats: 'P2', varuklass: 'B', latestVolume: 20, viewVolume: 20, signal: 'OK' }),
  ]

  it('sorts by plats ascending and descending', () => {
    expect(sortResultRows(rows, 'plats', 'asc').map((r) => r.plats)).toEqual(['P1', 'P2', 'P3'])
    expect(sortResultRows(rows, 'plats', 'desc').map((r) => r.plats)).toEqual(['P3', 'P2', 'P1'])
  })

  it('sorts by latestVolume numerically, not lexicographically', () => {
    expect(sortResultRows(rows, 'latestVolume', 'asc').map((r) => r.latestVolume)).toEqual([5, 20, 50])
  })

  it('sorts by signal in priority order, not alphabetically', () => {
    // Alphabetically MISMATCH < OK < A_ON_C, but priority order puts A_ON_C first.
    expect(sortResultRows(rows, 'signal', 'asc').map((r) => r.signal)).toEqual(['A_ON_C', 'MISMATCH', 'OK'])
  })

  it('breaks ties on id ascending regardless of the primary sort direction', () => {
    const tied = [row({ id: 'B', varuklass: 'B' }), row({ id: 'A', varuklass: 'B' }), row({ id: 'C', varuklass: 'B' })]
    expect(sortResultRows(tied, 'varuklass', 'asc').map((r) => r.id)).toEqual(['A', 'B', 'C'])
    expect(sortResultRows(tied, 'varuklass', 'desc').map((r) => r.id)).toEqual(['A', 'B', 'C'])
  })

  it('does not mutate the input array', () => {
    const original = [...rows]
    sortResultRows(rows, 'plats', 'desc')
    expect(rows).toEqual(original)
  })
})
