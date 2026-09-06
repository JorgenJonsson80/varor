import { useState } from 'react'
import { STATION_TYPES, STATION_TYPE_LABELS, type StationType } from '../../lib/moves'

interface Props {
  stations: string[]
  stationTypes: Map<string, StationType>
  stationLines: Map<string, string>
  onSet: (station: string, type: StationType, line?: string | null) => Promise<void>
  onClear: (station: string) => Promise<void>
}

export function StationTypeEditor({ stations, stationTypes, stationLines, onSet, onClear }: Props) {
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

  async function handleLineChange(station: string, line: string) {
    const type = stationTypes.get(station)
    if (!type) return
    setBusy(station)
    setError(null)
    try {
      await onSet(station, type, line)
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
        flyttförslagen — en station utan typ lämnas utanför förslagen helt. <strong>Line</strong> grupperar
        stationer så att förslagen kan begränsas till en line i taget; lämna tomt för en station som står för
        sig själv.
      </p>
      {error && <p className="error">{error}</p>}

      <table className="rule-table">
        <thead>
          <tr>
            <th>Station</th>
            <th>Typ</th>
            <th>Line</th>
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
              <td>
                <input
                  type="text"
                  value={stationLines.get(station) ?? ''}
                  placeholder="—"
                  disabled={busy === station || !stationTypes.has(station)}
                  style={{ width: '5em' }}
                  onChange={(e) => handleLineChange(station, e.target.value)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
