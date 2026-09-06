import { useState } from 'react'
import { STATION_TYPES, STATION_TYPE_LABELS, type StationType } from '../../lib/moves'

interface Props {
  stations: string[]
  stationTypes: Map<string, StationType>
  onSet: (station: string, type: StationType) => Promise<void>
  onClear: (station: string) => Promise<void>
}

export function StationTypeEditor({ stations, stationTypes, onSet, onClear }: Props) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const unset = stations.filter((s) => !stationTypes.has(s)).length

  async function handleChange(station: string, value: string) {
    setBusy(station)
    setError(null)
    try {
      if (value === '') await onClear(station)
      else await onSet(station, value as StationType)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <details className="rule-editor">
      <summary>
        Stationstyper ({stations.length - unset}/{stations.length} satta)
      </summary>
      <p className="hint">
        Vad stationen är till för, vilket avgör om den vill ha mycket eller lite trafik. Platsklassen säger var
        en plats ligger <em>inom</em> stationen; det här säger vad stationen som helhet ska bära. Används av
        flyttförslagen — en station utan typ lämnas utanför förslagen helt.
      </p>
      {error && <p className="error">{error}</p>}

      <table className="rule-table">
        <thead>
          <tr>
            <th>Station</th>
            <th>Typ</th>
          </tr>
        </thead>
        <tbody>
          {stations.map((station) => (
            <tr key={station}>
              <td>{station || '(tom station)'}</td>
              <td>
                <select
                  value={stationTypes.get(station) ?? ''}
                  disabled={busy === station}
                  onChange={(e) => handleChange(station, e.target.value)}
                >
                  <option value="">— ej satt —</option>
                  {STATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {STATION_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
