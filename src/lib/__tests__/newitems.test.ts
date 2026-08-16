import { describe, expect, it } from 'vitest'
import {
  hasPassedWatchThreshold,
  inheritHistoryFromReplacedItem,
  inheritKlassFromRelatives,
} from '../newitems'

describe('inheritKlassFromRelatives', () => {
  const candidates = [
    { id: 'r1', atc5: 'N02BE01', packageSize: '20st', klass: 'A' as const },
    { id: 'r2', atc5: 'N02BE01', packageSize: '20st', klass: 'A' as const },
    { id: 'r3', atc5: 'N02BE01', packageSize: '20st', klass: 'B' as const },
    { id: 'other', atc5: 'C09AA02', packageSize: '20st', klass: 'C' as const },
  ]

  it('inherits the majority class among ATC-5 + package size matches', () => {
    const newItem = { id: 'new1', atc5: 'N02BE01', packageSize: '20st' }
    const result = inheritKlassFromRelatives(newItem, candidates)
    expect(result).toEqual({ klass: 'A', source: 'proxy', matchedIds: ['r1', 'r2', 'r3'] })
  })

  it('does not match on ATC-5 alone if package size differs', () => {
    const newItem = { id: 'new2', atc5: 'N02BE01', packageSize: '100st' }
    const result = inheritKlassFromRelatives(newItem, candidates)
    expect(result).toEqual({ klass: 'B', source: 'default', matchedIds: [] })
  })

  it('falls back to B when there is no matching relative at all', () => {
    const newItem = { id: 'new3', atc5: 'ZZZZZZ', packageSize: '1st' }
    const result = inheritKlassFromRelatives(newItem, candidates)
    expect(result.klass).toBe('B')
    expect(result.source).toBe('default')
  })

  it('breaks ties toward the better class', () => {
    const tied = [
      { id: 'r1', atc5: 'X', packageSize: 'y', klass: 'A' as const },
      { id: 'r2', atc5: 'X', packageSize: 'y', klass: 'C' as const },
    ]
    const result = inheritKlassFromRelatives({ id: 'new', atc5: 'X', packageSize: 'y' }, tied)
    expect(result.klass).toBe('A')
  })
})

describe('inheritHistoryFromReplacedItem', () => {
  it('returns the outgoing article series when replacesId is set and known', () => {
    const historyById = new Map([['old-article', [10, 20, 30]]])
    expect(inheritHistoryFromReplacedItem('old-article', historyById)).toEqual([10, 20, 30])
  })

  it('returns null when there is no replacement link', () => {
    expect(inheritHistoryFromReplacedItem(undefined, new Map())).toBeNull()
  })

  it('returns null when the referenced outgoing article is unknown', () => {
    expect(inheritHistoryFromReplacedItem('missing', new Map())).toBeNull()
  })
})

describe('hasPassedWatchThreshold', () => {
  it('is true once any month has reached the threshold', () => {
    expect(hasPassedWatchThreshold([0, 5, 40], 30)).toBe(true)
  })

  it('is false when no month has reached the threshold', () => {
    expect(hasPassedWatchThreshold([0, 5, 10], 30)).toBe(false)
  })
})
