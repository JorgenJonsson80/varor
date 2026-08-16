import { describe, expect, it } from 'vitest'
import { buildPlatskartaExport, parsePlatskartaExport } from '../platskartaExport'

describe('platskartaExport round trip', () => {
  it('parses exactly what it built after a JSON stringify/parse cycle', () => {
    const built = buildPlatskartaExport({
      baseKlass: 'B',
      stationStart: 4,
      stationEnd: 5,
      rules: [{ position: 2, values: ['4', '7'], klass: 'C' }],
      manual: { 'P1010-05--A-2-': 'A' },
    })
    const roundTripped = JSON.parse(JSON.stringify(built))
    expect(parsePlatskartaExport(roundTripped)).toEqual(built)
  })
})

describe('parsePlatskartaExport validation', () => {
  it('rejects non-object input', () => {
    expect(() => parsePlatskartaExport('nope')).toThrow(/JSON-objekt/)
  })

  it('rejects an unknown version', () => {
    expect(() => parsePlatskartaExport({ version: 2 })).toThrow(/version/)
  })

  it('rejects a bad baseKlass', () => {
    expect(() => parsePlatskartaExport({ version: 1, baseKlass: 'X' })).toThrow(/baseKlass/)
  })

  it('rejects a malformed rule', () => {
    const payload = {
      version: 1,
      baseKlass: 'B',
      stationStart: 4,
      stationEnd: 5,
      rules: [{ position: 2, values: ['4'], klass: 'Z' }],
      manual: {},
    }
    expect(() => parsePlatskartaExport(payload)).toThrow(/rules/)
  })

  it('rejects a malformed manual klass value', () => {
    const payload = {
      version: 1,
      baseKlass: 'B',
      stationStart: 4,
      stationEnd: 5,
      rules: [],
      manual: { 'P1-1': 'Z' },
    }
    expect(() => parsePlatskartaExport(payload)).toThrow(/manual/)
  })
})
