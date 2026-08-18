import { describe, expect, it } from 'vitest'
import { buildKeysetFilter, quoteFilterValue } from '../supabasePagination'

describe('quoteFilterValue', () => {
  it('wraps a plain value in double quotes', () => {
    expect(quoteFilterValue('P1010-05')).toBe('"P1010-05"')
  })

  it('escapes embedded double quotes', () => {
    expect(quoteFilterValue('a"b')).toBe('"a\\"b"')
  })
})

describe('buildKeysetFilter', () => {
  it('builds a plain greater-than clause for a single-column cursor', () => {
    expect(buildKeysetFilter(['plats'], ['P100'])).toBe('plats.gt."P100"')
  })

  it('builds the standard "next row" OR-of-ANDs for a two-column composite cursor', () => {
    const filter = buildKeysetFilter(['item_id', 'period'], ['A1', '2024-03'])
    expect(filter).toBe('item_id.gt."A1",and(item_id.eq."A1",period.gt."2024-03")')
  })

  it('extends correctly to a three-column cursor', () => {
    const filter = buildKeysetFilter(['a', 'b', 'c'], ['1', '2', '3'])
    expect(filter).toBe('a.gt."1",and(a.eq."1",b.gt."2"),and(a.eq."1",b.eq."2",c.gt."3")')
  })
})
