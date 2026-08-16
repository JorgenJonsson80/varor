export type Klass = 'A' | 'B' | 'C'

export const klassRank: Record<Klass, number> = { A: 3, B: 2, C: 1 }

export function betterKlass(a: Klass, b: Klass): Klass {
  return klassRank[a] >= klassRank[b] ? a : b
}

export type PlatsklassSource = 'manual' | 'rule' | 'base'

export interface PlatsklassResult {
  klass: Klass
  source: PlatsklassSource
  ruleIndex?: number
}

/** Position is counted from the end of the location string (1 = last character). */
export interface PlatsklassRule {
  position: number
  values: string[]
  klass: Klass
}

export interface PlatsklassConfig {
  manual: Record<string, Klass>
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
