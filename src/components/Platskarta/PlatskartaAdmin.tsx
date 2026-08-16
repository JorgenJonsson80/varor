import { useMemo, useState } from 'react'
import { determinePlatsklass, getStation } from '../../lib/location'
import type { Klass } from '../../lib/types'
import { buildPlatskartaExport, parsePlatskartaExport } from '../../lib/platskartaExport'
import { useLocationConfig } from '../../hooks/useLocationConfig'
import { usePlatsklassRules } from '../../hooks/usePlatsklassRules'
import { useLocations } from '../../hooks/useLocations'
import { RuleEditor } from './RuleEditor'
import { ImportLocations } from './ImportLocations'
import './Platskarta.css'

interface Props {
  userId: string
}

export function PlatskartaAdmin({ userId }: Props) {
  const { config, loading: configLoading, update: updateConfig } = useLocationConfig()
  const { rules, loading: rulesLoading, addRule, updateRule, deleteRule, reorder, replaceAll } =
    usePlatsklassRules()
  const {
    locations,
    loading: locationsLoading,
    error: locationsError,
    setManualKlass,
    clearManualKlass,
    importLocations,
  } = useLocations()

  const [activeStation, setActiveStation] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const stationStart = config?.station_start ?? 4
  const stationEnd = config?.station_end ?? 5
  const baseKlass: Klass = config?.base_klass ?? 'B'

  const stations = useMemo(() => {
    const set = new Set<string>()
    for (const loc of locations) set.add(getStation(loc.plats, stationStart, stationEnd))
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [locations, stationStart, stationEnd])

  const currentStation = activeStation ?? stations[0] ?? null

  const manualMap = useMemo(() => {
    const map: Record<string, Klass> = {}
    for (const loc of locations) if (loc.manual_klass) map[loc.plats] = loc.manual_klass
    return map
  }, [locations])

  const plainRules = useMemo(
    () => rules.map((r) => ({ position: r.position, values: r.values, klass: r.klass })),
    [rules],
  )

  const platsklassConfig = useMemo(
    () => ({ manual: manualMap, rules: plainRules, baseKlass, stationStart, stationEnd }),
    [manualMap, plainRules, baseKlass, stationStart, stationEnd],
  )

  const filtered = useMemo(() => {
    if (!currentStation) return []
    const needle = filterText.trim().toLowerCase()
    return locations
      .filter((loc) => getStation(loc.plats, stationStart, stationEnd) === currentStation)
      .filter((loc) => (needle === '' ? true : loc.plats.toLowerCase().includes(needle)))
  }, [locations, currentStation, filterText, stationStart, stationEnd])

  async function handleBulkSet(klass: Klass) {
    setBusy(true)
    try {
      await setManualKlass(
        filtered.map((l) => l.plats),
        klass,
        userId,
      )
      setMessage(`${filtered.length} platser satta till ${klass}.`)
    } finally {
      setBusy(false)
    }
  }

  async function handleBulkClear() {
    setBusy(true)
    try {
      await clearManualKlass(filtered.map((l) => l.plats))
      setMessage(`Manuell tagg rensad för ${filtered.length} platser.`)
    } finally {
      setBusy(false)
    }
  }

  function handleExport() {
    const payload = buildPlatskartaExport({
      baseKlass,
      stationStart,
      stationEnd,
      rules: plainRules,
      manual: manualMap,
    })
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `platskarta-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportJson(file: File) {
    setBusy(true)
    try {
      const text = await file.text()
      const parsed = parsePlatskartaExport(JSON.parse(text))

      await updateConfig({
        base_klass: parsed.baseKlass,
        station_start: parsed.stationStart,
        station_end: parsed.stationEnd,
      })

      await replaceAll(
        parsed.rules.map((r, i) => ({ sort_order: i, position: r.position, values: r.values, klass: r.klass })),
      )

      const byKlass = new Map<Klass, string[]>()
      for (const [plats, klass] of Object.entries(parsed.manual)) {
        byKlass.set(klass, [...(byKlass.get(klass) ?? []), plats])
      }
      for (const [klass, platserForKlass] of byKlass) {
        await setManualKlass(platserForKlass, klass, userId)
      }

      setMessage(
        `Import klar: ${parsed.rules.length} regler, ${Object.keys(parsed.manual).length} manuella platser.`,
      )
    } catch (e) {
      setMessage(`Import misslyckades: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  if (configLoading || rulesLoading || locationsLoading) {
    return <p>Laddar platskarta…</p>
  }

  if (locationsError) {
    return <p className="error">Kunde inte läsa platser: {locationsError}</p>
  }

  return (
    <div className="platskarta">
      <div className="platskarta-toolbar">
        <button type="button" onClick={handleExport}>
          Exportera JSON
        </button>
        <label className="import-json-button">
          Importera JSON
          <input
            type="file"
            accept="application/json"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImportJson(file)
              e.target.value = ''
            }}
          />
        </label>
        {message && <span className="platskarta-message">{message}</span>}
      </div>

      <ImportLocations onImport={importLocations} />

      <RuleEditor rules={rules} onAdd={addRule} onUpdate={updateRule} onDelete={deleteRule} onReorder={reorder} />

      {locations.length === 0 ? (
        <p className="hint">Inga lagerplatser importerade ännu — börja med importen ovan.</p>
      ) : (
        <>
          <div className="station-tabs">
            {stations.map((station) => (
              <button
                key={station}
                type="button"
                className={station === currentStation ? 'active' : ''}
                onClick={() => setActiveStation(station)}
              >
                {station || '(tom station)'}
              </button>
            ))}
          </div>

          <div className="platskarta-filter">
            <input
              type="text"
              placeholder="Filtrera på lagerplats…"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
            <span>{filtered.length} platser</span>
          </div>

          <div className="platskarta-bulk">
            <span>Sätt alla {filtered.length} träffar till:</span>
            <button type="button" disabled={busy || filtered.length === 0} onClick={() => handleBulkSet('A')}>
              A
            </button>
            <button type="button" disabled={busy || filtered.length === 0} onClick={() => handleBulkSet('B')}>
              B
            </button>
            <button type="button" disabled={busy || filtered.length === 0} onClick={() => handleBulkSet('C')}>
              C
            </button>
            <button type="button" disabled={busy || filtered.length === 0} onClick={handleBulkClear}>
              Rensa manuellt
            </button>
          </div>

          <table className="platskarta-table">
            <thead>
              <tr>
                <th>Plats</th>
                <th>Klass</th>
                <th>Källa</th>
                <th>Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((loc) => {
                const result = determinePlatsklass(loc.plats, platsklassConfig)
                return (
                  <tr key={loc.plats}>
                    <td>{loc.plats}</td>
                    <td className={`klass klass-${result.klass}`}>{result.klass}</td>
                    <td>
                      {result.source === 'manual' && 'Manuell'}
                      {result.source === 'rule' && `Regel ${(result.ruleIndex ?? 0) + 1}`}
                      {result.source === 'base' && 'Grundklass'}
                    </td>
                    <td className="row-actions">
                      <button type="button" onClick={() => setManualKlass([loc.plats], 'A', userId)}>
                        A
                      </button>
                      <button type="button" onClick={() => setManualKlass([loc.plats], 'B', userId)}>
                        B
                      </button>
                      <button type="button" onClick={() => setManualKlass([loc.plats], 'C', userId)}>
                        C
                      </button>
                      {result.source === 'manual' && (
                        <button type="button" onClick={() => clearManualKlass([loc.plats])}>
                          Rensa
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
