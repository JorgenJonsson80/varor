import type { ResultRow } from './results'
import { SIGNAL_TYPES, type SignalType } from './signals'
import type { Klass } from './types'

export function countBySignal(rows: ResultRow[]): Record<SignalType, number> {
  const counts = Object.fromEntries(SIGNAL_TYPES.map((s) => [s, 0])) as Record<SignalType, number>
  for (const row of rows) counts[row.signal]++
  return counts
}

const KLASSES: Klass[] = ['A', 'B', 'C']

/** Cross-tab of varuklass x platsklass counts — e.g. matrix.A.C = number of A-varor sitting on C-platser. */
export function buildKlassMatrix(rows: ResultRow[]): Record<Klass, Record<Klass, number>> {
  const matrix = Object.fromEntries(
    KLASSES.map((varuklass) => [varuklass, Object.fromEntries(KLASSES.map((k) => [k, 0]))]),
  ) as Record<Klass, Record<Klass, number>>
  for (const row of rows) matrix[row.varuklass][row.platsklass]++
  return matrix
}
