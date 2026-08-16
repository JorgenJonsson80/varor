import { useState } from 'react'
import type { PlatsklassRuleRow } from '../../hooks/usePlatsklassRules'
import type { Klass } from '../../lib/types'

interface Props {
  rules: PlatsklassRuleRow[]
  onAdd: (rule: { sort_order: number; position: number; values: string[]; klass: Klass }) => Promise<void>
  onUpdate: (id: string, patch: Partial<{ position: number; values: string[]; klass: Klass }>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReorder: (orderedIds: string[]) => Promise<void>
}

function parseValues(raw: string): string[] {
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '')
}

export function RuleEditor({ rules, onAdd, onUpdate, onDelete, onReorder }: Props) {
  const [newPosition, setNewPosition] = useState('2')
  const [newValues, setNewValues] = useState('')
  const [newKlass, setNewKlass] = useState<Klass>('C')
  const [busy, setBusy] = useState(false)

  async function handleAdd() {
    const values = parseValues(newValues)
    if (values.length === 0) return
    setBusy(true)
    try {
      await onAdd({ sort_order: rules.length, position: Number(newPosition), values, klass: newKlass })
      setNewValues('')
    } finally {
      setBusy(false)
    }
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= rules.length) return
    const ids = rules.map((r) => r.id)
    const [moved] = ids.splice(index, 1)
    ids.splice(target, 0, moved)
    setBusy(true)
    try {
      await onReorder(ids)
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="rule-editor" open>
      <summary>Undantagsregler ({rules.length})</summary>
      <p className="hint">
        Körs uppifrån och ner, första träffen vinner. Position räknas bakifrån från lagerplatsens slut (1 = sista
        tecknet).
      </p>

      <table className="rule-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Position (bakifrån)</th>
            <th>Värden</th>
            <th>Klass</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, index) => (
            <tr key={rule.id}>
              <td>{index + 1}</td>
              <td>
                <input
                  type="number"
                  min={1}
                  value={rule.position}
                  onChange={(e) => onUpdate(rule.id, { position: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  type="text"
                  value={rule.values.join(', ')}
                  onChange={(e) => onUpdate(rule.id, { values: parseValues(e.target.value) })}
                />
              </td>
              <td>
                <select
                  value={rule.klass}
                  onChange={(e) => onUpdate(rule.id, { klass: e.target.value as Klass })}
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </td>
              <td className="rule-row-actions">
                <button type="button" disabled={busy || index === 0} onClick={() => move(index, -1)}>
                  ↑
                </button>
                <button type="button" disabled={busy || index === rules.length - 1} onClick={() => move(index, 1)}>
                  ↓
                </button>
                <button type="button" disabled={busy} onClick={() => onDelete(rule.id)}>
                  Ta bort
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rule-add-form">
        <label>
          Position
          <input
            type="number"
            min={1}
            value={newPosition}
            onChange={(e) => setNewPosition(e.target.value)}
            style={{ width: '4em' }}
          />
        </label>
        <label>
          Värden (kommaseparerat)
          <input
            type="text"
            placeholder="t.ex. 4, 7"
            value={newValues}
            onChange={(e) => setNewValues(e.target.value)}
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
        <button type="button" disabled={busy || parseValues(newValues).length === 0} onClick={handleAdd}>
          Lägg till regel
        </button>
      </div>
    </details>
  )
}
