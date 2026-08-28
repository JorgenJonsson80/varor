import { useState } from 'react'
import type { PrefixRuleRow } from '../../hooks/usePrefixRules'
import type { Klass } from '../../lib/types'

interface Props {
  prefixRules: PrefixRuleRow[]
  onSave: (rule: PrefixRuleRow) => Promise<void>
  onDelete: (prefix: string) => Promise<void>
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export function PrefixRuleEditor({ prefixRules, onSave, onDelete }: Props) {
  const [newPrefix, setNewPrefix] = useState('')
  const [newKlass, setNewKlass] = useState<Klass>('A')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    const prefix = newPrefix.trim()
    if (prefix === '') return
    setBusy(true)
    setError(null)
    try {
      await onSave({ prefix, klass: newKlass })
      setNewPrefix('')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdateKlass(prefix: string, klass: Klass) {
    setError(null)
    try {
      await onSave({ prefix, klass })
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function handleDelete(prefix: string) {
    setBusy(true)
    setError(null)
    try {
      await onDelete(prefix)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="rule-editor" open>
      <summary>Platsregler ({prefixRules.length})</summary>
      <p className="hint">
        Klassar hela familjer av platser på en gång, t.ex. "P1010-07--C-" täcker alla hyllnivåer under den —
        oavsett om de är importerade i platskartan än. Vinner över undantagsreglerna nedan men förlorar mot en
        manuell tagg på en exakt plats. Längsta matchande prefix vinner om flera skulle träffa samma plats.
      </p>
      {error && <p className="error">{error}</p>}

      <table className="rule-table">
        <thead>
          <tr>
            <th>Prefix</th>
            <th>Klass</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {prefixRules.map((rule) => (
            <tr key={rule.prefix}>
              <td>{rule.prefix}</td>
              <td>
                <select
                  value={rule.klass}
                  onChange={(e) => handleUpdateKlass(rule.prefix, e.target.value as Klass)}
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </td>
              <td className="rule-row-actions">
                <button type="button" disabled={busy} onClick={() => handleDelete(rule.prefix)}>
                  Ta bort
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rule-add-form">
        <label>
          Prefix
          <input
            type="text"
            placeholder="t.ex. P1010-07--C-"
            value={newPrefix}
            onChange={(e) => setNewPrefix(e.target.value)}
          />
        </label>
        <label>
          Klass
          <select value={newKlass} onChange={(e) => setNewKlass(e.target.value as Klass)}>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
          </select>
        </label>
        <button type="button" disabled={busy || newPrefix.trim() === ''} onClick={handleAdd}>
          Lägg till regel
        </button>
      </div>
    </details>
  )
}
