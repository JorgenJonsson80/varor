import { useMemo, useState } from 'react'
import { determinePlatsklass, getStation } from '../../lib/location'
import { matchHeatmapPrefixesToLocations } from '../../lib/heatmap'
import type { Klass } from '../../lib/types'
import { buildPlatskartaExport, parsePlatskartaExport } from '../../lib/platskartaExport'
import { useAppData } from '../../context/AppDataContext'
import { RuleEditor } from './RuleEditor'
import { ImportLocations } from './ImportLocations'
import { ImportHeatmap } from './ImportHeatmap'
import './Platskarta.css'

interface Props {
  userId: string
}

export function PlatskartaAdmin({ userId }: Props) {
  const { configData, rulesData, locationsData } = useAppData()
  const { config, loading: configLoading, update: updateConfig } = configData
  const { rules, loading: rulesLoading, addRule, updateRule, deleteRule, reorder, replaceAll } = rulesData
  const {
    locations,
    loading: locationsLoading,
    error: locationsError,
    setManualKlass,
    clearManualKlass,
    importLocations,
  } = locationsData

  const [activeStation, setActiveStation] = useState<string | null>(null)
  const [filterText, setFilterText] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  // Staged-but-unsaved manual klass edits: null means "clear on save".
  // Lets someone go through several locations, then commit them together
  // instead of a round-trip + full reload after every single click.
  const [pendingChanges, setPendingChanges] = useState<Map<string, Klass | null>>(new Map())

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

  // Overlays staged edits on top of the saved manual tags, purely for
  // preview — nothing here is written to the database until "Spara".
  const previewManualMap = useMemo(() => {
    const map = { ...manualMap }
    for (const [plats, klass] of pendingChanges) {
      if (klass === null) delete map[plats]
      else map[plats] = klass
    }
    return map
  }, [manualMap, pendingChanges])

  const plainRules = useMemo(
    () => rules.map((r) => ({ position: r.position, values: r.values, klass: r.klass })),
    [rules],
  )

  const platsklassConfig = useMemo(
    () => ({ manual: previewManualMap, rules: plainRules, baseKlass, stationStart, stationEnd }),
    [previewManualMap, plainRules, baseKlass, stationStart, stationEnd],
  )

  const filtered = useMemo(() => {
    if (!currentStation) return []
    const needle = filterText.trim().toLowerCase()
    return locations
      .filter((loc) => getStation(loc.plats, stationStart, stationEnd) === currentStation)
      .filter((loc) => (needle === '' ? true : loc.plats.toLowerCase().includes(needle)))
  }, [locations, currentStation, filterText, stationStart, stationEnd])

  function stageSet(platser: string[], klass: Klass) {
    setPendingChanges((prev) => {
      const next = new Map(prev)
      for (const plats of platser) next.set(plats, klass)
      return next
    })
  }

  // Clicking "Rensa" on a row that only has a staged (unsaved) change just
  // cancels that staged change. Only a location with an actually-saved
  // manual tag needs an explicit staged "clear" sent on save.
  function stageClear(platser: string[]) {
    const savedManual = new Map(locations.map((l) => [l.plats, l.manual_klass]))
    setPendingChanges((prev) => {
      const next = new Map(prev)
      for (const plats of platser) {
        if (next.has(plats)) next.delete(plats)
        else if (savedManual.get(plats)) next.set(plats, null)
      }
      return next
    })
  }

  async function handleSaveChanges() {
    setBusy(true)
    setMessage(null)
    const count = pendingChanges.size
    try {
      const byKlass = new Map<Klass, string[]>()
      const toClear: string[] = []
      for (const [plats, klass] of pendingChanges) {
        if (klass === null) toClear.push(plats)
        else byKlass.set(klass, [...(byKlass.get(klass) ?? []), plats])
      }
      for (const [klass, platser] of byKlass) {
        await setManualKlass(platser, klass, userId, { skipReload: true })
      }
      if (toClear.length > 0) {
        await clearManualKlass(toClear, { skipReload: true })
      }
      await locationsData.reload()
      setPendingChanges(new Map())
      setMessage(`${count} ändringar sparade.`)
    } catch (e) {
      setMessage(`Kunde inte spara: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  function handleDiscardChanges() {
    setPendingChanges(new Map())
    setMessage(null)
  }

  // Heatmap only ever proposes A (green zone) — never touches C, matching
  // the explicit decision that red-zone locations get tagged by hand. The
  // heatmap's location label is a PREFIX, not a complete plats — e.g.
  // "P1010-01--A-" covers the real locations "P1010-01--A-2-" and
  // "P1010-01--A-3-" (different shelf levels), which the label alone
  // doesn't distinguish. Match against the real, already-known locations
  // rather than ever treating the prefix itself as a plats — a prefix
  // that matches nothing means those shelf-level locations haven't been
  // imported into the platskarta yet, so it's reported, not invented.
  function handleHeatmapGreenLocations(greenPrefixes: string[]) {
    const { matched, unmatchedPrefixes } = matchHeatmapPrefixesToLocations(
      greenPrefixes,
      locations.map((l) => l.plats),
    )
    stageSet(matched, 'A')
    setMessage(
      `${matched.length} platser förberedda som A (från ${greenPrefixes.length - unmatchedPrefixes.length} ` +
        `heatmap-positioner).` +
        (unmatchedPrefixes.length > 0
          ? ` ${unmatchedPrefixes.length} positioner fanns inte i platslistan än och hoppades över.`
          : ''),
    )
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

      <ImportHeatmap
        stationStart={stationStart}
        stationEnd={stationEnd}
        onGreenLocationsFound={handleHeatmapGreenLocations}
      />

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
            <span>Markera alla {filtered.length} träffar som:</span>
            <button
              type="button"
              disabled={filtered.length === 0}
              onClick={() => stageSet(filtered.map((l) => l.plats), 'A')}
            >
              A
            </button>
            <button
              type="button"
              disabled={filtered.length === 0}
              onClick={() => stageSet(filtered.map((l) => l.plats), 'B')}
            >
              B
            </button>
            <button
              type="button"
              disabled={filtered.length === 0}
              onClick={() => stageSet(filtered.map((l) => l.plats), 'C')}
            >
              C
            </button>
            <button
              type="button"
              disabled={filtered.length === 0}
              onClick={() => stageClear(filtered.map((l) => l.plats))}
            >
              Rensa manuellt
            </button>
          </div>

          {pendingChanges.size > 0 && (
            <div className="pending-changes-bar">
              <span>{pendingChanges.size} ändringar väntar på att sparas</span>
              <button type="button" disabled={busy} onClick={handleSaveChanges}>
                Spara ändringar
              </button>
              <button type="button" disabled={busy} onClick={handleDiscardChanges}>
                Ångra
              </button>
            </div>
          )}

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
                const isPending = pendingChanges.has(loc.plats)
                const showRensa = isPending || loc.manual_klass !== null
                return (
                  <tr key={loc.plats} className={isPending ? 'pending-row' : ''}>
                    <td>{loc.plats}</td>
                    <td className={`klass klass-${result.klass}`}>{result.klass}</td>
                    <td>
                      {result.source === 'manual' && (isPending ? 'Manuell (ej sparad)' : 'Manuell')}
                      {result.source === 'rule' && `Regel ${(result.ruleIndex ?? 0) + 1}`}
                      {result.source === 'base' && 'Grundklass'}
                    </td>
                    <td className="row-actions">
                      <button type="button" onClick={() => stageSet([loc.plats], 'A')}>
                        A
                      </button>
                      <button type="button" onClick={() => stageSet([loc.plats], 'B')}>
                        B
                      </button>
                      <button type="button" onClick={() => stageSet([loc.plats], 'C')}>
                        C
                      </button>
                      {showRensa && (
                        <button type="button" onClick={() => stageClear([loc.plats])}>
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
