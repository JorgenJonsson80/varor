import { useMemo, useState } from 'react'
import { useAppData } from '../../context/AppDataContext'
import { useItemHistory } from '../../hooks/useItemHistory'
import { buildResultRows, groupRawVolumeRows, type ResultRow } from '../../lib/results'
import type { Klass } from '../../lib/types'
import type { SignalType } from '../../lib/signals'
import { ImportPlockstatistik } from '../Plockstatistik/ImportPlockstatistik'
import { Sparkline } from './Sparkline'
import { SummaryPanel } from './SummaryPanel'
import './Resultat.css'

const SIGNAL_LABELS: Record<SignalType, string> = {
  A_ON_C: 'A-vara på C-plats',
  PERIOD_ON_C: 'Periodvara på C-plats',
  RISING_ON_C: 'Stigande vara på C-plats',
  PERIOD_ON_GOOD: 'Periodvara på bra plats',
  ZERO_ON_A: 'Nollvara på A-plats',
  FALLING_A_ON_A: 'Fallande A-vara på A-plats',
  MISMATCH: 'Missmatch',
  OK: 'OK',
}

const PAGE_SIZE = 100

export function ResultatView() {
  const { configData, rulesData, locationsData } = useAppData()
  const { config, loading: configLoading } = configData
  const { rules, loading: rulesLoading } = rulesData
  const { locations, loading: locationsLoading } = locationsData
  const {
    rows: historyRows,
    loading: historyLoading,
    error: historyError,
    progress: historyProgress,
    reload,
  } = useItemHistory()

  const [signalFilter, setSignalFilter] = useState<'avvikelser' | 'alla'>('avvikelser')
  const [textFilter, setTextFilter] = useState('')
  const [klassFilter, setKlassFilter] = useState<{ varuklass: Klass; platsklass: Klass } | null>(null)
  const [page, setPage] = useState(0)

  function handleSelectKlassCell(varuklass: Klass, platsklass: Klass) {
    setKlassFilter((prev) =>
      prev?.varuklass === varuklass && prev?.platsklass === platsklass ? null : { varuklass, platsklass },
    )
    setPage(0)
  }

  const loading = configLoading || rulesLoading || locationsLoading || historyLoading

  const manualMap = useMemo(() => {
    const map: Record<string, Klass> = {}
    for (const loc of locations) if (loc.manual_klass) map[loc.plats] = loc.manual_klass
    return map
  }, [locations])

  const platsklassConfig = useMemo(
    () => ({
      manual: manualMap,
      rules: rules.map((r) => ({ position: r.position, values: r.values, klass: r.klass })),
      baseKlass: config?.base_klass ?? ('B' as Klass),
      stationStart: config?.station_start ?? 4,
      stationEnd: config?.station_end ?? 5,
    }),
    [manualMap, rules, config],
  )

  const resultConfig = useMemo(
    () => ({
      pareto: { a: config?.pareto_threshold_a ?? 0.8, b: config?.pareto_threshold_b ?? 0.95 },
      trend: {
        precedingMonths: config?.trend_preceding_months ?? 3,
        threshold: config?.trend_threshold ?? 0.25,
      },
      periodGood: {
        topN: config?.period_good_top_n ?? 2,
        threshold: config?.period_good_threshold ?? 0.6,
        minPeriods: config?.period_good_min_periods ?? 4,
      },
    }),
    [config],
  )

  const allRows: ResultRow[] = useMemo(() => {
    if (historyRows.length === 0) return []
    const { periodLabels, items } = groupRawVolumeRows(historyRows)
    return buildResultRows(items, periodLabels, platsklassConfig, resultConfig)
  }, [historyRows, platsklassConfig, resultConfig])

  const filteredRows = useMemo(() => {
    const needle = textFilter.trim().toLowerCase()
    return allRows.filter((row) => {
      if (klassFilter) {
        if (row.varuklass !== klassFilter.varuklass || row.platsklass !== klassFilter.platsklass) return false
      } else if (signalFilter === 'avvikelser' && row.signal === 'OK') {
        return false
      }
      if (needle === '') return true
      return row.id.toLowerCase().includes(needle) || row.plats.toLowerCase().includes(needle)
    })
  }, [allRows, signalFilter, textFilter, klassFilter])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const pageRows = filteredRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (loading) {
    return (
      <p>
        Laddar resultat…
        {historyProgress !== null && ` (${historyProgress} rader hittills…)`}
      </p>
    )
  }
  if (historyError) return <p className="error">Kunde inte läsa plockstatistik: {historyError}</p>

  return (
    <div className="resultat">
      <ImportPlockstatistik onImported={reload} />

      {historyRows.length === 0 ? (
        <p className="hint">Ingen plockstatistik importerad ännu — börja med importen ovan.</p>
      ) : (
        <>
          <SummaryPanel rows={allRows} activeKlassFilter={klassFilter} onSelectKlassCell={handleSelectKlassCell} />

          <div className="resultat-controls">
            <select
              value={signalFilter}
              disabled={klassFilter !== null}
              onChange={(e) => {
                setSignalFilter(e.target.value as 'avvikelser' | 'alla')
                setPage(0)
              }}
            >
              <option value="avvikelser">Endast avvikelser</option>
              <option value="alla">Alla rader</option>
            </select>
            <input
              type="text"
              placeholder="Filtrera på vara eller plats…"
              value={textFilter}
              onChange={(e) => {
                setTextFilter(e.target.value)
                setPage(0)
              }}
            />
            {klassFilter && (
              <span className="klass-filter-badge">
                Varuklass {klassFilter.varuklass} × platsklass {klassFilter.platsklass}
                <button type="button" onClick={() => setKlassFilter(null)}>
                  Rensa
                </button>
              </span>
            )}
            <span>{filteredRows.length} rader</span>
          </div>

          <table className="resultat-table">
            <thead>
              <tr>
                <th>Vara</th>
                <th>Plats</th>
                <th>Varuklass</th>
                <th>Platsklass</th>
                <th>Signal</th>
                <th>Trend</th>
                <th>Senaste</th>
                <th>Historik</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.plats}</td>
                  <td className={`klass klass-${row.varuklass}`}>{row.varuklass}</td>
                  <td className={`klass klass-${row.platsklass}`}>{row.platsklass}</td>
                  <td>{SIGNAL_LABELS[row.signal]}</td>
                  <td>
                    {row.trend === 'rising' && '↑'}
                    {row.trend === 'falling' && '↓'}
                    {row.trend === 'stable' && '→'}
                    {row.changePct !== null && ` ${Math.round(row.changePct * 100)}%`}
                  </td>
                  <td>{row.latestVolume}</td>
                  <td>
                    <Sparkline series={row.series} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="resultat-pagination">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Föregående
            </button>
            <span>
              Sida {page + 1} av {pageCount}
            </span>
            <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
              Nästa
            </button>
          </div>
        </>
      )}
    </div>
  )
}
