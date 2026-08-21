import type { Klass, Trend } from './types'

export type SignalType =
  | 'A_ON_C'
  | 'PERIOD_ON_C'
  | 'RISING_ON_C'
  | 'PERIOD_ON_GOOD'
  | 'ZERO_ON_A'
  | 'FALLING_A_ON_A'
  | 'MISMATCH'
  | 'OK'

/** Same order as the priority chain in classifySignal below — the single source of truth for signal severity ranking. */
export const SIGNAL_TYPES: SignalType[] = [
  'A_ON_C',
  'PERIOD_ON_C',
  'RISING_ON_C',
  'PERIOD_ON_GOOD',
  'ZERO_ON_A',
  'FALLING_A_ON_A',
  'MISMATCH',
  'OK',
]

export interface SignalInput {
  varuklass: Klass
  platsklass: Klass
  latestVolume: number
  trend: Trend
  isPeriodGood: boolean
  /** A period good that has been A at some point in its history — protected from the zero/falling-out signals. */
  periodGoodProtected: boolean
}

/**
 * Priority order matters and the first match wins. A-on-C is checked before
 * period-good-on-C so an item that is both is reported as the more urgent
 * A-on-C signal, not buried as a period-good note. periodGoodProtected only
 * suppresses ZERO_ON_A and FALLING_A_ON_A — a protected period good still
 * gets flagged when it's sitting on a C-plats ahead of its season.
 */
export function classifySignal(input: SignalInput): SignalType {
  const { varuklass, platsklass, latestVolume, trend, isPeriodGood, periodGoodProtected } = input

  if (varuklass === 'A' && platsklass === 'C') return 'A_ON_C'
  if (isPeriodGood && platsklass === 'C') return 'PERIOD_ON_C'
  if (trend === 'rising' && platsklass === 'C') return 'RISING_ON_C'
  if (isPeriodGood && platsklass !== 'C') return 'PERIOD_ON_GOOD'
  if (latestVolume === 0 && platsklass === 'A' && !periodGoodProtected) return 'ZERO_ON_A'
  if (varuklass === 'A' && platsklass === 'A' && trend === 'falling' && !periodGoodProtected) return 'FALLING_A_ON_A'
  if (varuklass !== platsklass) return 'MISMATCH'
  return 'OK'
}
