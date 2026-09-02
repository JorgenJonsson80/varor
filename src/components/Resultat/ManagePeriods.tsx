import { useState } from 'react'
import { parseMonthColumn } from '../../lib/history'

export interface PeriodSummary {
  period: string
  rows: number
}

interface Props {
  periods: PeriodSummary[]
  formatPeriod: (period: string) => string
  onDelete: (period: string) => Promise<void>
}

/**
 * A period whose name didn't come from a recognized month header — a column
 * like "Försäljning April" picked as a month column keeps its raw text as
 * the period name. Worth calling out separately: it isn't a month, it sorts
 * after every real period (letters beat digits), and it is almost always
 * something that shouldn't have been imported.
 */
function isJunk(period: string): boolean {
  return parseMonthColumn(period) === null
}

export function ManagePeriods({ periods, formatPeriod, onDelete }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const junkCount = periods.filter((p) => isJunk(p.period)).length

  async function handleDelete(period: string, rows: number) {
    const label = isJunk(period) ? period : formatPeriod(period)
    if (!window.confirm(`Ta bort ${label} och dess ${rows.toLocaleString('sv-SE')} rader? Går inte att ångra.`)) {
      return
    }
    setBusy(period)
    setError(null)
    try {
      await onDelete(period)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <details className="manage-periods">
      <summary>
        Hantera perioder ({periods.length})
        {junkCount > 0 && <span className="periods-warning-badge"> · {junkCount} ser felaktiga ut</span>}
      </summary>
      <p className="hint">
        Perioder som inte känns igen som månader kommer från en kolumn som inte var en månadskolumn. De sorteras
        efter alla riktiga månader och stör analysen — ta bort dem. Placeringarna påverkas inte, de ligger på
        varorna.
      </p>
      {error && <p className="error">{error}</p>}

      <table className="periods-table">
        <thead>
          <tr>
            <th>Period</th>
            <th>Rader</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {periods.map(({ period, rows }) => (
            <tr key={period} className={isJunk(period) ? 'period-junk' : ''}>
              <td>
                {isJunk(period) ? period : formatPeriod(period)}
                {isJunk(period) && <span className="period-junk-tag"> ej en månad</span>}
              </td>
              <td>{rows.toLocaleString('sv-SE')}</td>
              <td>
                <button type="button" disabled={busy !== null} onClick={() => handleDelete(period, rows)}>
                  {busy === period ? 'Tar bort…' : 'Ta bort'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
