import { useState } from 'react'
import {
  DISMISSAL_REASONS,
  DISMISSAL_REASON_LABELS,
  DISMISSAL_SCOPES,
  type DismissalReason,
  type MoveSuggestion,
} from '../../lib/moves'
import type { DismissalRow } from '../../hooks/useMoveDismissals'

interface Props {
  suggestions: MoveSuggestion[]
  limit: number
  onLimitChange: (limit: number) => void
  /** Stations with no type set — their locations are left out of the suggestions. */
  stationsWithoutType: string[]
  dismissals: DismissalRow[]
  onDismiss: (params: { itemId: string; plats: string; reason: DismissalReason; note?: string }) => Promise<void>
  onUndismiss: (id: string) => Promise<void>
}

const LIMITS = [10, 25, 50, 100]

function scopeText(reason: DismissalReason, itemId: string, plats: string): string {
  switch (DISMISSAL_SCOPES[reason]) {
    case 'plats':
      return `${plats} föreslås inte till någon vara igen`
    case 'vara':
      return `${itemId} föreslås inte till någon plats igen`
    default:
      return `${itemId} föreslås inte till ${plats} igen`
  }
}

function describe(row: DismissalRow): string {
  if (row.item_id && row.plats) return `${row.item_id} → ${row.plats}`
  if (row.plats) return `${row.plats} (alla varor)`
  return `${row.item_id} (alla platser)`
}

export function MoveSuggestions({
  suggestions,
  limit,
  onLimitChange,
  stationsWithoutType,
  dismissals,
  onDismiss,
  onUndismiss,
}: Props) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const [dismissing, setDismissing] = useState<MoveSuggestion | null>(null)
  const [reason, setReason] = useState<DismissalReason>('kartong_for_stor')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function handleConfirmDismiss() {
    if (!dismissing) return
    setBusy(true)
    setError(null)
    try {
      await onDismiss({ itemId: dismissing.itemId, plats: dismissing.toPlats, reason, note })
      setDismissing(null)
      setNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
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

      {error && <p className="error">{error}</p>}

      {dismissing && (
        <div className="dismiss-form">
          <p>
            <strong>
              {dismissing.itemId} → {dismissing.toPlats}
            </strong>{' '}
            går inte att genomföra. Varför?
          </p>
          <label>
            Orsak
            <select value={reason} onChange={(e) => setReason(e.target.value as DismissalReason)}>
              {DISMISSAL_REASONS.map((r) => (
                <option key={r} value={r}>
                  {DISMISSAL_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Anteckning (valfritt)
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <p className="hint">{scopeText(reason, dismissing.itemId, dismissing.toPlats)}.</p>
          <div className="dismiss-form-actions">
            <button type="button" disabled={busy} onClick={handleConfirmDismiss}>
              {busy ? 'Sparar…' : 'Avfärda'}
            </button>
            <button type="button" disabled={busy} onClick={() => setDismissing(null)}>
              Avbryt
            </button>
          </div>
        </div>
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
              <th></th>
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
                  <td>
                    <button type="button" onClick={() => setDismissing(s)}>
                      Går ej
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {dismissals.length > 0 && (
        <details className="dismissals-list">
          <summary>Avfärdade ({dismissals.length})</summary>
          <table className="moves-table">
            <thead>
              <tr>
                <th>Gäller</th>
                <th>Orsak</th>
                <th>Anteckning</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dismissals.map((row) => (
                <tr key={row.id}>
                  <td>{describe(row)}</td>
                  <td>{DISMISSAL_REASON_LABELS[row.reason]}</td>
                  <td>{row.note ?? ''}</td>
                  <td>
                    <button type="button" onClick={() => onUndismiss(row.id)}>
                      Ångra
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </details>
  )
}
