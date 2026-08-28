import type { Klass, PlatsklassPrefixRule, PlatsklassRule } from './types'

export interface PlatskartaExport {
  version: 1
  baseKlass: Klass
  stationStart: number
  stationEnd: number
  rules: PlatsklassRule[]
  /** Optional for backward compatibility: files exported before prefix rules existed simply have none. */
  prefixRules: PlatsklassPrefixRule[]
  manual: Record<string, Klass>
}

export function buildPlatskartaExport(params: {
  baseKlass: Klass
  stationStart: number
  stationEnd: number
  rules: PlatsklassRule[]
  prefixRules: PlatsklassPrefixRule[]
  manual: Record<string, Klass>
}): PlatskartaExport {
  return { version: 1, ...params }
}

const VALID_KLASS = new Set(['A', 'B', 'C'])

function isKlass(value: unknown): value is Klass {
  return typeof value === 'string' && VALID_KLASS.has(value)
}

function isRule(value: unknown): value is PlatsklassRule {
  if (typeof value !== 'object' || value === null) return false
  const rule = value as Record<string, unknown>
  return (
    typeof rule.position === 'number' &&
    Array.isArray(rule.values) &&
    rule.values.every((v) => typeof v === 'string') &&
    isKlass(rule.klass)
  )
}

function isPrefixRule(value: unknown): value is PlatsklassPrefixRule {
  if (typeof value !== 'object' || value === null) return false
  const rule = value as Record<string, unknown>
  return typeof rule.prefix === 'string' && rule.prefix !== '' && isKlass(rule.klass)
}

/** Parses and validates an imported platskarta JSON file. Throws with a Swedish, user-facing message on malformed input. */
export function parsePlatskartaExport(json: unknown): PlatskartaExport {
  if (typeof json !== 'object' || json === null) {
    throw new Error('Ogiltig fil: förväntade ett JSON-objekt')
  }
  const obj = json as Record<string, unknown>

  if (obj.version !== 1) {
    throw new Error('Okänd eller saknad version i platskarta-filen')
  }
  if (!isKlass(obj.baseKlass)) {
    throw new Error('Saknar giltig baseKlass (A/B/C)')
  }
  if (typeof obj.stationStart !== 'number' || typeof obj.stationEnd !== 'number') {
    throw new Error('Saknar giltiga stationStart/stationEnd')
  }
  if (!Array.isArray(obj.rules) || !obj.rules.every(isRule)) {
    throw new Error('Ogiltig eller saknad rules-lista')
  }
  // Absent entirely (files exported before prefix rules existed) means
  // "none" rather than an error; present-but-malformed is still rejected.
  if (obj.prefixRules !== undefined && (!Array.isArray(obj.prefixRules) || !obj.prefixRules.every(isPrefixRule))) {
    throw new Error('Ogiltig prefixRules-lista')
  }
  if (typeof obj.manual !== 'object' || obj.manual === null) {
    throw new Error('Saknar manual-objekt')
  }
  const manualEntries = Object.entries(obj.manual as Record<string, unknown>)
  if (!manualEntries.every(([, klass]) => isKlass(klass))) {
    throw new Error('Ogiltigt klassvärde i manual-objektet')
  }

  return {
    version: 1,
    baseKlass: obj.baseKlass,
    stationStart: obj.stationStart,
    stationEnd: obj.stationEnd,
    rules: obj.rules,
    prefixRules: (obj.prefixRules as PlatsklassPrefixRule[] | undefined) ?? [],
    manual: obj.manual as Record<string, Klass>,
  }
}
