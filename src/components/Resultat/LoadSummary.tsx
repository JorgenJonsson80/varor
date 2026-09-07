import { useState } from 'react'
import type { LoadRow } from '../../lib/load'

interface Props {
  byLine: LoadRow[]
  byStation: LoadRow[]
  /** What the picks figure counts — the month or average currently being viewed. */
  periodLabel: string
  /** Real lines per day, keyed the same way as the rows. Empty until that data is imported. */
  actualByLine: Map<string, number>
  actualByStation: Map<string, number>
  /** How many days the imported lines cover, for the column heading. */
  actualDays: number
}

type Grouping = 'line' | 'station'

export function LoadSummary({
  byLine,
  byStation,
  periodLabel,
  actualByLine,
  actualByStation,
  actualDays,
}: Props) {
  const [grouping, setGrouping] = useState<Grouping>('line')
  const rows = grouping === 'line' ? byLine : byStation
  const actualPerDay = grouping === 'line' ? actualByLine : actualByStation
  const total = rows.reduce((sum, r) => sum + r.picks, 0)
  const anyShift = rows.some((r) => r.shift !== 0)
  const hasActual = actualPerDay.size > 0

  return (
    <details className="load-summary">
      <summary>Belastning per {grouping === 'line' ? 'line' : 'station'}</summary>

      <p className="hint">
        Plock per {grouping === 'line' ? 'line' : 'station'} enligt {periodLabel.toLowerCase()}, och hur de
        flyttar som ligger i listan just nu skulle förskjuta det. Ingen målnivå är inlagd — verktyget vet inte
        hur många rader en line tål, så siffrorna är till för att du ska kunna bedöma det själv.
        {hasActual
          ? ' Rader/dag kommer från den importerade dagsstatistiken och är den verkliga belastningen.'
          : ' Importera rader per dag och station för att se verklig belastning bredvid den härledda.'}
      </p>

      <div className="moves-limit">
        <span>Gruppera:</span>
        <button
          type="button"
          className={grouping === 'line' ? 'active' : ''}
          onClick={() => setGrouping('line')}
        >
          Line
        </button>
        <button
          type="button"
          className={grouping === 'station' ? 'active' : ''}
          onClick={() => setGrouping('station')}
        >
          Station
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="hint">Ingen belastning att visa.</p>
      ) : (
        <table className="moves-table">
          <thead>
            <tr>
              <th>{grouping === 'line' ? 'Line' : 'Station'}</th>
              <th>Plock</th>
              <th>Andel</th>
              {hasActual && <th title={`Snitt över ${actualDays} dagar`}>Rader/dag</th>}
              {anyShift && <th>Efter flyttar</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.group}>
                <td>{row.group}</td>
                <td>{Math.round(row.picks).toLocaleString('sv-SE')}</td>
                <td>{(row.share * 100).toFixed(1)} %</td>
                {hasActual && (
                  <td>
                    {actualPerDay.has(row.group)
                      ? Math.round(actualPerDay.get(row.group)!).toLocaleString('sv-SE')
                      : '—'}
                  </td>
                )}
                {anyShift && (
                  <td className={row.shift > 0 ? 'shift-up' : row.shift < 0 ? 'shift-down' : ''}>
                    {row.shift === 0
                      ? '—'
                      : `${row.shift > 0 ? '+' : ''}${Math.round(row.shift).toLocaleString('sv-SE')}`}
                  </td>
                )}
              </tr>
            ))}
            <tr className="load-total">
              <td>Totalt</td>
              <td>{Math.round(total).toLocaleString('sv-SE')}</td>
              <td>100,0 %</td>
              {hasActual && (
                <td>
                  {Math.round(
                    rows.reduce((sum, r) => sum + (actualPerDay.get(r.group) ?? 0), 0),
                  ).toLocaleString('sv-SE')}
                </td>
              )}
              {anyShift && <td>—</td>}
            </tr>
          </tbody>
        </table>
      )}
    </details>
  )
}
