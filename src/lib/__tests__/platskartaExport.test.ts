import { describe, expect, it } from 'vitest'
import { buildPlatskartaExport, parsePlatskartaExport } from '../platskartaExport'

describe('platskartaExport round trip', () => {
  it('parses exactly what it built after a JSON stringify/parse cycle', () => {
    const built = buildPlatskartaExport({
      baseKlass: 'B',
      stationStart: 4,
      stationEnd: 5,
      rules: [{ position: 2, values: ['4', '7'], klass: 'C' }],
      prefixRules: [{ prefix: 'P1010-07--C-', klass: 'A' }],
      manual: { 'P1010-05--A-2-': 'A' },
    })
    const roundTripped = JSON.parse(JSON.stringify(built))
    expect(parsePlatskartaExport(roundTripped)).toEqual(built)
  })

  it('defaults prefixRules to an empty list for files exported before it existed', () => {
    const legacyPayload = {
      version: 1,
      baseKlass: 'B',
      stationStart: 4,
      stationEnd: 5,
      rules: [],
      manual: {},
    }
    expect(parsePlatskartaExport(legacyPayload).prefixRules).toEqual([])
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

  it('rejects a malformed prefix rule', () => {
    const payload = {
      version: 1,
      baseKlass: 'B',
      stationStart: 4,
      stationEnd: 5,
      rules: [],
      prefixRules: [{ prefix: '', klass: 'A' }],
      manual: {},
    }
    expect(() => parsePlatskartaExport(payload)).toThrow(/prefixRules/)
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
