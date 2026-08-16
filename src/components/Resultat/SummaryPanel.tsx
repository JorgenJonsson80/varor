import { useMemo } from 'react'
import { buildKlassMatrix, countBySignal } from '../../lib/summary'
import type { ResultRow } from '../../lib/results'
import type { SignalType } from '../../lib/signals'
import type { Klass } from '../../lib/types'

const SIGNAL_LABELS: Record<SignalType, string> = {
  A_ON_C: 'A-vara på C-plats',
  PERIOD_ON_C: 'Periodvara på C-plats',
  RISING_ON_C: 'Stigande vara på C-plats',
  PERIOD_ON_GOOD: 'Periodvara på bra plats',
  ZERO_ON_A: 'Nollvara på A-plats',
  FALLING_A_ON_A: 'Fallande A-vara på A-plats',
  MISMATCH: 'Missmatch',
  OK: 'OK',
}

const ACTIONABLE_SIGNALS: SignalType[] = [
  'A_ON_C',
  'PERIOD_ON_C',
  'RISING_ON_C',
  'ZERO_ON_A',
  'FALLING_A_ON_A',
  'MISMATCH',
]

const KLASSES: Klass[] = ['A', 'B', 'C']

interface Props {
  rows: ResultRow[]
  activeKlassFilter: { varuklass: Klass; platsklass: Klass } | null
  onSelectKlassCell: (varuklass: Klass, platsklass: Klass) => void
}

export function SummaryPanel({ rows, activeKlassFilter, onSelectKlassCell }: Props) {
  const signalCounts = useMemo(() => countBySignal(rows), [rows])
  const matrix = useMemo(() => buildKlassMatrix(rows), [rows])

  return (
    <div className="summary-panel">
      <div className="summary-signals">
        {ACTIONABLE_SIGNALS.map((signal) => (
          <div key={signal} className={`summary-stat summary-stat-${signal}`}>
            <span className="summary-stat-count">{signalCounts[signal]}</span>
            <span className="summary-stat-label">{SIGNAL_LABELS[signal]}</span>
          </div>
        ))}
      </div>

      <table className="klass-matrix">
        <caption>Varuklass × platsklass — klicka en cell för att filtrera tabellen</caption>
        <thead>
          <tr>
            <th></th>
            <th colSpan={3}>Platsklass</th>
          </tr>
          <tr>
            <th>Varuklass</th>
            {KLASSES.map((k) => (
              <th key={k}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {KLASSES.map((varuklass) => (
            <tr key={varuklass}>
              <th>{varuklass}</th>
              {KLASSES.map((platsklass) => {
                const isMatch = varuklass === platsklass
                const isActive =
                  activeKlassFilter?.varuklass === varuklass && activeKlassFilter?.platsklass === platsklass
                return (
                  <td
                    key={platsklass}
                    className={`klass-matrix-cell ${isMatch ? 'klass-matrix-match' : ''} ${isActive ? 'klass-matrix-active' : ''}`}
                    onClick={() => onSelectKlassCell(varuklass, platsklass)}
                  >
                    {matrix[varuklass][platsklass]}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
