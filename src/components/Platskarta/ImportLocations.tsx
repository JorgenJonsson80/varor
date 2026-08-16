import { useState } from 'react'
import { parseSpreadsheetFile } from '../../lib/fileParsing'

interface Props {
  onImport: (platser: string[]) => Promise<{ inserted: number }>
}

const LOCATION_COLUMN_HINT = /plats|location|lagerplats/i

export function ImportLocations({ onImport }: Props) {
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [selectedColumn, setSelectedColumn] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File) {
    setStatus(null)
    try {
      const parsed = await parseSpreadsheetFile(file)
      setColumns(parsed.columns)
      setRows(parsed.rows)
      const guess = parsed.columns.find((c) => LOCATION_COLUMN_HINT.test(c)) ?? parsed.columns[0] ?? ''
      setSelectedColumn(guess)
    } catch (e) {
      setStatus(`Kunde inte läsa filen: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function handleImport() {
    if (!selectedColumn) return
    setBusy(true)
    try {
      const platser = Array.from(
        new Set(rows.map((row) => String(row[selectedColumn] ?? '').trim()).filter((v) => v !== '')),
      )
      const result = await onImport(platser)
      setStatus(`${result.inserted} nya platser importerade (${platser.length} rader lästa, dubbletter/redan kända hoppas över).`)
      setColumns([])
      setRows([])
    } catch (e) {
      setStatus(`Import misslyckades: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="import-locations">
      <summary>Importera lagerplatser från JD Edwards</summary>
      <p className="hint">
        Lägger bara till nya platser — rör aldrig manuella taggar på platser som redan finns.
      </p>
      <input
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
      {columns.length > 0 && (
        <div className="import-preview">
          <label>
            Kolumn med lagerplats:
            <select value={selectedColumn} onChange={(e) => setSelectedColumn(e.target.value)}>
              {columns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <p>{rows.length} rader inlästa.</p>
          <button type="button" disabled={busy} onClick={handleImport}>
            {busy ? 'Importerar…' : 'Importera'}
          </button>
        </div>
      )}
      {status && <p className="import-status">{status}</p>}
    </details>
  )
}
