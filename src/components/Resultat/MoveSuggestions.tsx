import { useState } from 'react'
import type { MoveSuggestion } from '../../lib/moves'

interface Props {
  suggestions: MoveSuggestion[]
  limit: number
  onLimitChange: (limit: number) => void
  /** Stations with no type set — their locations are left out of the suggestions. */
  stationsWithoutType: string[]
}

const LIMITS = [10, 25, 50, 100]

export function MoveSuggestions({ suggestions, limit, onLimitChange, stationsWithoutType }: Props) {
  const [done, setDone] = useState<Set<string>>(new Set())

  function keyOf(s: MoveSuggestion) {
    return `${s.itemId}|${s.toPlats}`
  }

  function toggleDone(key: string) {
    setDone((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const totalGain = suggestions.reduce((sum, s) => sum + s.gain, 0)
  const doneGain = suggestions.filter((s) => done.has(keyOf(s))).reduce((sum, s) => sum + s.gain, 0)

  return (
    <details className="move-suggestions">
      <summary>
        Föreslagna flyttar ({suggestions.length})
        {done.size > 0 && (
          <span className="moves-done-badge">
            {' '}
            · {done.size} avklarade ({Math.round((doneGain / totalGain) * 100) || 0}% av effekten)
          </span>
        )}
      </summary>

      <p className="hint">
        De flyttar som ger mest effekt först. Effekten är plockskillnaden gånger hur många klassteg varan
        flyttas, där stationens typ räknas in — en tunnelplats väger tyngre än en vanlig, vagnsplock och
        temperatur lättare. Varje vara och plats föreslås högst en gång, så listan kan betas av uppifrån i
        vilken ordning som helst.
      </p>

      {stationsWithoutType.length > 0 && (
        <p className="import-warning">
          {stationsWithoutType.length} stationer saknar typ och är därför inte med i förslagen:{' '}
          <strong>{stationsWithoutType.join(', ')}</strong>. Sätt typ i Platskarta för att få med dem.
        </p>
      )}

      <div className="moves-limit">
        <span>Visa:</span>
        {LIMITS.map((n) => (
          <button key={n} type="button" className={n === limit ? 'active' : ''} onClick={() => onLimitChange(n)}>
            {n}
          </button>
        ))}
      </div>

      {suggestions.length === 0 ? (
        <p className="hint">Inga flyttar ger någon vinst just nu.</p>
      ) : (
        <table className="moves-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Vara</th>
              <th>Från</th>
              <th>Till</th>
              <th>Byter med</th>
              <th>Effekt</th>
              <th>Klar</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((s, index) => {
              const key = keyOf(s)
              const isDone = done.has(key)
              return (
                <tr key={key} className={isDone ? 'move-done' : ''}>
                  <td>{index + 1}</td>
                  <td>{s.itemId}</td>
                  <td>{s.fromPlats}</td>
                  <td>{s.toPlats}</td>
                  <td>{s.swapWithItemId ?? <span className="hint">tom plats</span>}</td>
                  <td>{Math.round(s.gain).toLocaleString('sv-SE')}</td>
                  <td>
                    <input type="checkbox" checked={isDone} onChange={() => toggleDone(key)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </details>
  )
}
