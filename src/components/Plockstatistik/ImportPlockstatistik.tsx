import { useMemo, useState } from 'react'
import { parseSpreadsheetFile } from '../../lib/fileParsing'
import { guessMonthColumns, normalizeLongRows, normalizeWideRows } from '../../lib/history'
import { usePlockstatistikImport } from '../../hooks/usePlockstatistikImport'

type Format = 'wide' | 'long'

const ITEM_HINT = /vara|artikel|item/i
const PLATS_HINT = /plats|location|lagerplats/i
const PERIOD_HINT = /period|månad|datum/i
const VOLUME_HINT = /antal|volym|plock/i

interface Props {
  onImported?: () => void
}

export function ImportPlockstatistik({ onImported }: Props) {
  const { importRows, progress } = usePlockstatistikImport()
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [format, setFormat] = useState<Format>('wide')
  const [itemColumn, setItemColumn] = useState('')
  const [platsColumn, setPlatsColumn] = useState('')
  const [monthColumns, setMonthColumns] = useState<string[]>([])
  const [periodColumn, setPeriodColumn] = useState('')
  const [volumeColumn, setVolumeColumn] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  async function handleFile(file: File) {
    setStatus(null)
    try {
      const parsed = await parseSpreadsheetFile(file)
      setColumns(parsed.columns)
      setRows(parsed.rows)
      setItemColumn(parsed.columns.find((c) => ITEM_HINT.test(c)) ?? parsed.columns[0] ?? '')
      setPlatsColumn(parsed.columns.find((c) => PLATS_HINT.test(c)) ?? '')
      setMonthColumns(guessMonthColumns(parsed.columns))
      setPeriodColumn(parsed.columns.find((c) => PERIOD_HINT.test(c)) ?? '')
      setVolumeColumn(parsed.columns.find((c) => VOLUME_HINT.test(c)) ?? '')
    } catch (e) {
      setStatus(`Kunde inte läsa filen: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const otherColumns = useMemo(
    () => columns.filter((c) => c !== itemColumn && c !== platsColumn),
    [columns, itemColumn, platsColumn],
  )

  function toggleMonthColumn(column: string) {
    setMonthColumns((prev) => (prev.includes(column) ? prev.filter((c) => c !== column) : [...prev, column]))
  }

  async function handleImport() {
    if (!itemColumn || !platsColumn) return
    setBusy(true)
    setStatus(null)
    try {
      const normalized =
        format === 'wide'
          ? normalizeWideRows(rows, itemColumn, platsColumn, monthColumns)
          : normalizeLongRows(rows, itemColumn, platsColumn, periodColumn, volumeColumn)
      const result = await importRows(normalized)
      setStatus(
        `Klart: ${result.items} varor, ${result.locations} platser, ${result.volumes} månadsrader importerade.`,
      )
      setColumns([])
      setRows([])
      onImported?.()
    } catch (e) {
      setStatus(`Import misslyckades: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const canImport = Boolean(
    itemColumn && platsColumn && (format === 'wide' ? monthColumns.length > 0 : periodColumn && volumeColumn),
  )

  return (
    <details className="import-plockstatistik">
      <summary>Importera plockstatistik</summary>
      <p className="hint">
        Varje rad förväntas ha både vara och plats — plockstatistiken är källan till varans aktuella placering,
        inte ett separat register.
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
              Brett (en kolumn per månad)
            </label>
            <label>
              <input type="radio" checked={format === 'long'} onChange={() => setFormat('long')} />
              Långt (period- + antalskolumn)
            </label>
          </div>

          <div className="column-pickers">
            <label>
              Vara-kolumn
              <select value={itemColumn} onChange={(e) => setItemColumn(e.target.value)}>
                <option value="">Välj…</option>
                {columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Plats-kolumn
              <select value={platsColumn} onChange={(e) => setPlatsColumn(e.target.value)}>
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
                <span>Månadskolumner ({monthColumns.length} valda)</span>
                <button type="button" onClick={() => setMonthColumns(guessMonthColumns(otherColumns))}>
                  Gissa
                </button>
              </div>
              <div className="month-columns-list">
                {otherColumns.map((c) => (
                  <label key={c}>
                    <input type="checkbox" checked={monthColumns.includes(c)} onChange={() => toggleMonthColumn(c)} />
                    {c}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="column-pickers">
              <label>
                Period-kolumn
                <select value={periodColumn} onChange={(e) => setPeriodColumn(e.target.value)}>
                  <option value="">Välj…</option>
                  {otherColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Antal-kolumn
                <select value={volumeColumn} onChange={(e) => setVolumeColumn(e.target.value)}>
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

          {progress && (
            <p className="import-progress">
              {progress.stage}: {progress.done} / {progress.total}
            </p>
          )}
        </div>
      )}

      {status && <p className="import-status">{status}</p>}
    </details>
  )
}
