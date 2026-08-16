import { describe, expect, it } from 'vitest'
import { charAtPos, determinePlatsklass, getStation } from '../location'
import type { PlatsklassConfig } from '../types'

describe('charAtPos', () => {
  it('counts from the end, 1 = last character', () => {
    expect(charAtPos('ABC', 1)).toBe('C')
    expect(charAtPos('ABC', 2)).toBe('B')
    expect(charAtPos('ABC', 3)).toBe('A')
  })

  it('returns empty string when position is out of bounds', () => {
    expect(charAtPos('ABC', 4)).toBe('')
    expect(charAtPos('ABC', 0)).toBe('')
    expect(charAtPos('ABC', -1)).toBe('')
  })

  it('finds the same relative position regardless of total string length', () => {
    // The level indicator sits 4 from the end in both, despite differing lengths.
    const short = 'AB-C-DEF'
    const long = 'AB-C-DEFGHI'
    expect(charAtPos(short, 4)).toBe(charAtPos(short, 4))
    expect(short[short.length - 4]).toBe(charAtPos(short, 4))
    expect(long[long.length - 4]).toBe(charAtPos(long, 4))
  })
})

describe('getStation', () => {
  it('reads characters 4-5 (1-indexed from the front) by default', () => {
    expect(getStation('P1015-54--B-1A')).toBe('15')
    expect(getStation('P1010-05--A-2-')).toBe('10')
  })

  it('supports configurable start/end', () => {
    expect(getStation('P1015-54--B-1A', 2, 5)).toBe('1015')
  })
})

describe('determinePlatsklass', () => {
  const baseConfig: PlatsklassConfig = {
    manual: {},
    rules: [{ position: 2, values: ['4', '7'], klass: 'C' }],
    baseKlass: 'B',
    stationStart: 4,
    stationEnd: 5,
  }

  it('falls back to base class when nothing else matches', () => {
    const result = determinePlatsklass('P1010-05--A-2-', baseConfig)
    expect(result).toEqual({ klass: 'B', source: 'base' })
  })

  it('applies the first matching rule', () => {
    // position 2 from end is '4'
    const plats = 'P1015-58--E-4A'
    expect(charAtPos(plats, 2)).toBe('4')
    const result = determinePlatsklass(plats, baseConfig)
    expect(result).toEqual({ klass: 'C', source: 'rule', ruleIndex: 0 })
  })

  it('manual tag wins over a matching rule', () => {
    const plats = 'P1015-58--E-4A'
    const config: PlatsklassConfig = { ...baseConfig, manual: { [plats]: 'A' } }
    const result = determinePlatsklass(plats, config)
    expect(result).toEqual({ klass: 'A', source: 'manual' })
  })

  it('manual tag wins even with no rules at all', () => {
    const config: PlatsklassConfig = { ...baseConfig, rules: [], manual: { 'X-1': 'A' } }
    expect(determinePlatsklass('X-1', config)).toEqual({ klass: 'A', source: 'manual' })
  })

  it('uses the first matching rule in list order when several rules could apply', () => {
    const plats = 'X-47'
    expect(charAtPos(plats, 1)).toBe('7')
    expect(charAtPos(plats, 2)).toBe('4')

    const config: PlatsklassConfig = {
      ...baseConfig,
      rules: [
        { position: 2, values: ['4'], klass: 'C' },
        { position: 1, values: ['7'], klass: 'A' },
      ],
    }
    // Both rules match this location; the first one in the list wins.
    expect(determinePlatsklass(plats, config)).toEqual({ klass: 'C', source: 'rule', ruleIndex: 0 })
  })
})
