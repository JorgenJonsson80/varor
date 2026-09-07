import { useMemo, useState } from 'react'
import { parseSpreadsheetFile } from '../../lib/fileParsing'
import {
  guessDayColumns,
  normalizeLongStationDays,
  normalizeWideStationDays,
  sumStationDays,
  type StationDayRow,
} from '../../lib/stationlines'

type Format = 'wide' | 'long'

const STATION_HINT = /station|stn/i
const DAY_HINT = /datum|dag|date/i
const RADER_HINT = /rader|antal|lines/i

interface Props {
  onImport: (rows: StationDayRow[]) => Promise<void>
}

export function ImportStationLines({ onImport }: Props) {
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [format, setFormat] = useState<Format>('wide')
  const [stationColumn, setStationColumn] = useState('')
  const [dayColumns, setDayColumns] = useState<string[]>([])
  const [dayColumn, setDayColumn] = useState('')
  const [raderColumn, setRaderColumn] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function handleFile(file: File) {
    setStatus(null)
    try {
      const parsed = await parseSpreadsheetFile(file)
      setColumns(parsed.columns)
      setRows(parsed.rows)
      setStationColumn(parsed.columns.find((c) => STATION_HINT.test(c)) ?? parsed.columns[0] ?? '')
      setDayColumns(guessDayColumns(parsed.columns))
      setDayColumn(parsed.columns.find((c) => DAY_HINT.test(c)) ?? '')
      setRaderColumn(parsed.columns.find((c) => RADER_HINT.test(c)) ?? '')
    } catch (e) {
      setStatus(`Kunde inte läsa filen: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const otherColumns = useMemo(() => columns.filter((c) => c !== stationColumn), [columns, stationColumn])

  function toggleDayColumn(column: string) {
    setDayColumns((prev) => (prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column]))
  }

  async function handleImport() {
    if (!stationColumn) return
    setBusy(true)
    setStatus(null)
    try {
      const normalized =
        format === 'wide'
          ? normalizeWideStationDays(rows, stationColumn, dayColumns)
          : normalizeLongStationDays(rows, stationColumn, dayColumn, raderColumn)
      const summed = sumStationDays(normalized)
      await onImport(summed)
      const days = new Set(summed.map((r) => r.datum)).size
      const stations = new Set(summed.map((r) => r.station)).size
      setStatus(`Klart: ${stations} stationer över ${days} dagar (${summed.length} rader).`)
      setColumns([])
      setRows([])
    } catch (e) {
      setStatus(`Import misslyckades: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const canImport = Boolean(
    stationColumn && (format === 'wide' ? dayColumns.length > 0 : dayColumn && raderColumn),
  )

  return (
    <details className="import-station-lines">
      <summary>Importera rader per dag och station</summary>
      <p className="hint">
        Antal plockrader per station och dag — den verkliga belastningen, som plockstatistiken inte kan svara
        på eftersom den räknar per vara och månad. Lagras per dag, så att en påbörjad månad går att jämföra med
        en färdig. Importeras samma stretch igen skrivs den över, inte dubblas.
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
        <div className="import-plockstatistik-form">
          <p>{rows.length} rader inlästa.</p>

          <div className="format-toggle">
            <label>
              <input type="radio" checked={format === 'wide'} onChange={() => setFormat('wide')} />
              Brett (en kolumn per dag)
            </label>
            <label>
              <input type="radio" checked={format === 'long'} onChange={() => setFormat('long')} />
              Långt (datum- + antalskolumn)
            </label>
          </div>

          <div className="column-pickers">
            <label>
              Stations-kolumn
              <select value={stationColumn} onChange={(e) => setStationColumn(e.target.value)}>
                <option value="">Välj…</option>
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {format === 'wide' ? (
            <div className="month-columns">
              <div className="month-columns-header">
                <span>Dagkolumner ({dayColumns.length} valda)</span>
                <button type="button" onClick={() => setDayColumns(guessDayColumns(otherColumns))}>
                  Gissa
                </button>
              </div>
              <div className="month-columns-list">
                {otherColumns.map((c) => (
                  <label key={c}>
                    <input
                      type="checkbox"
                      checked={dayColumns.includes(c)}
                      onChange={() => toggleDayColumn(c)}
                    />
                    {c}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="column-pickers">
              <label>
                Datum-kolumn
                <select value={dayColumn} onChange={(e) => setDayColumn(e.target.value)}>
                  <option value="">Välj…</option>
                  {otherColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Rader-kolumn
                <select value={raderColumn} onChange={(e) => setRaderColumn(e.target.value)}>
                  <option value="">Välj…</option>
                  {otherColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <button type="button" disabled={!canImport || busy} onClick={handleImport}>
            {busy ? 'Importerar…' : 'Importera'}
          </button>
        </div>
      )}

      {status && <p className="import-status">{status}</p>}
    </details>
  )
}
