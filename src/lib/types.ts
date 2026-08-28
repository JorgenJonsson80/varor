export type Klass = 'A' | 'B' | 'C'

export const klassRank: Record<Klass, number> = { A: 3, B: 2, C: 1 }

export function betterKlass(a: Klass, b: Klass): Klass {
  return klassRank[a] >= klassRank[b] ? a : b
}

export type PlatsklassSource = 'manual' | 'prefix' | 'rule' | 'base'

export interface PlatsklassResult {
  klass: Klass
  source: PlatsklassSource
  ruleIndex?: number
  /** Which prefix rule matched, when source is 'prefix'. */
  prefix?: string
}

/** Position is counted from the end of the location string (1 = last character). */
export interface PlatsklassRule {
  position: number
  values: string[]
  klass: Klass
}

/**
 * A whole family of locations sharing a location-code prefix, tagged with
 * one class in a single stroke — e.g. "P1010-07--C-" covers every shelf
 * level under it (P1010-07--C-2-, P1010-07--C-1A, …), including ones not
 * imported into vp_locations yet. Unlike PlatsklassRule (a fixed character
 * position counted from the end), this handles location families whose
 * suffix length varies, which a from-the-end position can't reliably hit.
 */
export interface PlatsklassPrefixRule {
  prefix: string
  klass: Klass
}

export interface PlatsklassConfig {
  manual: Record<string, Klass>
  /** Optional: absent/empty means no prefix rules apply. Most specific (longest matching) prefix wins. */
  prefixRules?: PlatsklassPrefixRule[]
  rules: PlatsklassRule[]
  baseKlass: Klass
  stationStart: number
  stationEnd: number
}

export type Trend = 'rising' | 'falling' | 'stable'

export interface TrendResult {
  trend: Trend
  changePct: number | null
}

export interface ParetoThresholds {
  a: number
  b: number
}
