import { useMemo, useState } from 'react'
import { useAppData } from '../../context/AppDataContext'
import { useItemHistory } from '../../hooks/useItemHistory'
import { getStation } from '../../lib/location'
import {
  buildResultRows,
  groupRawVolumeRows,
  sortResultRows,
  type ResultRow,
  type ResultSortColumn,
  type ResultViewMode,
  type SortDirection,
} from '../../lib/results'
import type { Klass } from '../../lib/types'
import type { SignalType } from '../../lib/signals'
import { ImportPlockstatistik } from '../Plockstatistik/ImportPlockstatistik'
import { Sparkline } from './Sparkline'
import { SummaryPanel } from './SummaryPanel'
import { ManagePeriods, type PeriodSummary } from './ManagePeriods'
import { MoveSuggestions, type OptimizeScope } from './MoveSuggestions'
import { LoadSummary } from './LoadSummary'
import { buildLoadSummary } from '../../lib/load'
import { locationScore, suggestMoves } from '../../lib/moves'
import { determinePlatsklass } from '../../lib/location'
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

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Mars',
  'April',
  'Maj',
  'Juni',
  'Juli',
  'Augusti',
  'September',
  'Oktober',
  'November',
  'December',
]

function formatPeriodLabel(period: string): string {
  const match = period.match(/^(\d{4})-(\d{2})$/)
  const name = match ? MONTH_NAMES[Number(match[2]) - 1] : null
  return match && name ? `${name} ${match[1]}` : period
}

export function ResultatView() {
  const {
    configData,
    rulesData,
    prefixRulesData,
    locationsData,
    placementsData,
    stationTypesData,
    dismissalsData,
  } = useAppData()
  const { config, loading: configLoading } = configData
  const { rules, loading: rulesLoading } = rulesData
  const { prefixRules, loading: prefixRulesLoading } = prefixRulesData
  const { locations, loading: locationsLoading } = locationsData
  const { placements, loading: placementsLoading, reload: reloadPlacements } = placementsData
  const { stationTypes, stationLines, loading: stationTypesLoading } = stationTypesData
  const {
    dismissals,
    blocks: moveBlocks,
    loading: dismissalsLoading,
    dismiss,
    undismiss,
  } = dismissalsData
  const {
    rows: historyRows,
    loading: historyLoading,
    error: historyError,
    progress: historyProgress,
    reload,
    deletePeriod,
  } = useItemHistory()

  const [viewSelection, setViewSelection] = useState<'latest' | 'average' | string>('latest')
  const [stationFilter, setStationFilter] = useState<string | null>(null)
  const [moveLimit, setMoveLimit] = useState(25)
  const [optimizeScope, setOptimizeScope] = useState<OptimizeScope>('lager')
  const [signalFilter, setSignalFilter] = useState<'avvikelser' | 'alla'>('avvikelser')
  const [textFilter, setTextFilter] = useState('')
  const [klassFilter, setKlassFilter] = useState<{ varuklass: Klass; platsklass: Klass } | null>(null)
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<{ column: ResultSortColumn; direction: SortDirection }>({
    column: 'plats',
    direction: 'asc',
  })

  function handleSelectKlassCell(varuklass: Klass, platsklass: Klass) {
    setKlassFilter((prev) =>
      prev?.varuklass === varuklass && prev?.platsklass === platsklass ? null : { varuklass, platsklass },
    )
    setPage(0)
  }

  // Clicking the same column again flips direction; a new column starts
  // ascending — except latestVolume, where descending (highest first) is
  // the more useful default on first click.
  function handleSort(column: ResultSortColumn) {
    setSort((prev) => {
      if (prev.column === column) return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      return { column, direction: column === 'latestVolume' ? 'desc' : 'asc' }
    })
    setPage(0)
  }

  const loading =
    configLoading ||
    rulesLoading ||
    prefixRulesLoading ||
    locationsLoading ||
    placementsLoading ||
    stationTypesLoading ||
    dismissalsLoading ||
    historyLoading

  const manualMap = useMemo(() => {
    const map: Record<string, Klass> = {}
    for (const loc of locations) if (loc.manual_klass) map[loc.plats] = loc.manual_klass
    return map
  }, [locations])

  const platsklassConfig = useMemo(
    () => ({
      manual: manualMap,
      prefixRules,
      rules: rules.map((r) => ({ position: r.position, values: r.values, klass: r.klass })),
      baseKlass: config?.base_klass ?? ('B' as Klass),
      stationStart: config?.station_start ?? 4,
      stationEnd: config?.station_end ?? 5,
    }),
    [manualMap, prefixRules, rules, config],
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

  const grouped = useMemo(() => groupRawVolumeRows(historyRows), [historyRows])
  const { periodLabels } = grouped

  // Falls back to "latest" if the picked month isn't in the current dataset
  // (e.g. a reload brings in data that no longer has that period).
  const viewMode: ResultViewMode = useMemo(() => {
    if (viewSelection === 'average') return { type: 'average' }
    const index = periodLabels.indexOf(viewSelection)
    return index >= 0 ? { type: 'period', index } : { type: 'latest' }
  }, [viewSelection, periodLabels])

  const allRows: ResultRow[] = useMemo(() => {
    if (historyRows.length === 0) return []
    return buildResultRows(
      grouped.items,
      periodLabels,
      platsklassConfig,
      resultConfig,
      viewMode,
      placements.byItem.size > 0 ? placements.byItem : undefined,
    )
  }, [historyRows, grouped, periodLabels, platsklassConfig, resultConfig, viewMode, placements])

  const stationStart = config?.station_start ?? 4
  const stationEnd = config?.station_end ?? 5

  const stations = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of allRows) {
      const station = getStation(row.plats, stationStart, stationEnd)
      counts.set(station, (counts.get(station) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([station, count]) => ({ station, count }))
      .sort((a, b) => a.station.localeCompare(b.station, undefined, { numeric: true }))
  }, [allRows, stationStart, stationEnd])

  const filteredRows = useMemo(() => {
    const needle = textFilter.trim().toLowerCase()
    return allRows.filter((row) => {
      if (stationFilter !== null && getStation(row.plats, stationStart, stationEnd) !== stationFilter) {
        return false
      }
      if (klassFilter) {
        if (row.varuklass !== klassFilter.varuklass || row.platsklass !== klassFilter.platsklass) return false
      } else if (signalFilter === 'avvikelser' && row.signal === 'OK') {
        return false
      }
      if (needle === '') return true
      return row.id.toLowerCase().includes(needle) || row.plats.toLowerCase().includes(needle)
    })
  }, [allRows, signalFilter, textFilter, klassFilter, stationFilter, stationStart, stationEnd])

  const sortedRows = useMemo(
    () => sortResultRows(filteredRows, sort.column, sort.direction),
    [filteredRows, sort],
  )

  // Scores every location the suggestions may use: platsklass says where it
  // sits within its station, the station type what that station should be
  // carrying. A station with no type set is left out rather than guessed at,
  // and so is A-Frame, whose contents are a separate decision.
  const scoreByPlats = useMemo(() => {
    const scores = new Map<string, number>()
    for (const loc of locations) {
      const stationType = stationTypes.get(getStation(loc.plats, stationStart, stationEnd))
      if (!stationType) continue
      const score = locationScore(determinePlatsklass(loc.plats, platsklassConfig).klass, stationType)
      if (score !== null) scores.set(loc.plats, score)
    }
    return scores
  }, [locations, stationTypes, stationStart, stationEnd, platsklassConfig])

  const stationsWithoutType = useMemo(
    () => stations.map((s) => s.station).filter((station) => !stationTypes.has(station)),
    [stations, stationTypes],
  )

  // Under "inom line"/"inom station" every suggested move has to stay
  // inside one group. A station with no line set stands on its own, so it
  // only ever optimises against itself.
  const groupByPlats = useMemo(() => {
    if (optimizeScope === 'lager') return undefined
    const groups = new Map<string, string>()
    for (const loc of locations) {
      const station = getStation(loc.plats, stationStart, stationEnd)
      const group = optimizeScope === 'station' ? station : (stationLines.get(station) ?? `stn:${station}`)
      groups.set(loc.plats, group)
    }
    return groups
  }, [optimizeScope, locations, stationLines, stationStart, stationEnd])

  const moveSuggestions = useMemo(() => {
    if (allRows.length === 0 || scoreByPlats.size === 0) return []
    const occupied = new Set(allRows.map((row) => row.plats))
    return suggestMoves({
      placed: allRows.map((row) => ({ itemId: row.id, plats: row.plats, volume: row.viewVolume })),
      emptyLocations: locations.map((l) => l.plats).filter((plats) => !occupied.has(plats)),
      scoreByPlats,
      limit: moveLimit,
      blocks: moveBlocks,
      groupByPlats,
    })
  }, [allRows, locations, scoreByPlats, moveLimit, moveBlocks, groupByPlats])

  const placedArticles = useMemo(
    () => allRows.map((row) => ({ itemId: row.id, plats: row.plats, volume: row.viewVolume })),
    [allRows],
  )

  const loadByLine = useMemo(
    () =>
      buildLoadSummary({
        placed: placedArticles,
        groupOf: (plats) => {
          const station = getStation(plats, stationStart, stationEnd)
          return stationLines.get(station) ?? `Utan line (stn ${station})`
        },
        suggestions: moveSuggestions,
      }),
    [placedArticles, stationLines, stationStart, stationEnd, moveSuggestions],
  )

  const loadByStation = useMemo(
    () =>
      buildLoadSummary({
        placed: placedArticles,
        groupOf: (plats) => getStation(plats, stationStart, stationEnd),
        suggestions: moveSuggestions,
      }),
    [placedArticles, stationStart, stationEnd, moveSuggestions],
  )

  const periodSummaries: PeriodSummary[] = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of historyRows) counts.set(row.period, (counts.get(row.period) ?? 0) + 1)
    return periodLabels.map((period) => ({ period, rows: counts.get(period) ?? 0 }))
  }, [historyRows, periodLabels])

  const volumeColumnLabel =
    viewSelection === 'latest'
      ? 'Senaste'
      : viewSelection === 'average'
        ? `Snitt (${periodLabels.length} mån)`
        : formatPeriodLabel(viewSelection)

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
  const pageRows = sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

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
      <ImportPlockstatistik
        onImported={() => {
          reload()
          reloadPlacements()
        }}
      />

      {historyRows.length === 0 ? (
        <p className="hint">Ingen plockstatistik importerad ännu — börja med importen ovan.</p>
      ) : (
        <>
          <ManagePeriods
            periods={periodSummaries}
            formatPeriod={formatPeriodLabel}
            onDelete={async (period) => {
              await deletePeriod(period)
              if (viewSelection === period) setViewSelection('latest')
            }}
          />

          <LoadSummary byLine={loadByLine} byStation={loadByStation} periodLabel={volumeColumnLabel} />

          <MoveSuggestions
            suggestions={moveSuggestions}
            limit={moveLimit}
            onLimitChange={setMoveLimit}
            stationsWithoutType={stationsWithoutType}
            optimizeScope={optimizeScope}
            onOptimizeScopeChange={setOptimizeScope}
            dismissals={dismissals}
            onDismiss={dismiss}
            onUndismiss={undismiss}
          />

          <SummaryPanel rows={allRows} activeKlassFilter={klassFilter} onSelectKlassCell={handleSelectKlassCell} />

          <div className="station-tabs">
            <button
              type="button"
              className={stationFilter === null ? 'active' : ''}
              onClick={() => {
                setStationFilter(null)
                setPage(0)
              }}
            >
              Alla stationer
            </button>
            {stations.map(({ station, count }) => (
              <button
                key={station}
                type="button"
                className={station === stationFilter ? 'active' : ''}
                title={`${count} varor`}
                onClick={() => {
                  setStationFilter((prev) => (prev === station ? null : station))
                  setPage(0)
                }}
              >
                {station || '(tom)'}
              </button>
            ))}
          </div>

          <div className="resultat-controls">
            <select
              value={viewSelection}
              onChange={(e) => {
                setViewSelection(e.target.value)
                setPage(0)
              }}
            >
              <option value="latest">Senaste månaden</option>
              <option value="average">Snitt ({periodLabels.length} månader)</option>
              {periodLabels.map((period) => (
                <option key={period} value={period}>
                  {formatPeriodLabel(period)}
                </option>
              ))}
            </select>
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
                <SortableHeader column="id" label="Vara" sort={sort} onSort={handleSort} />
                <SortableHeader column="plats" label="Plats" sort={sort} onSort={handleSort} />
                <SortableHeader column="varuklass" label="Varuklass" sort={sort} onSort={handleSort} />
                <SortableHeader column="platsklass" label="Platsklass" sort={sort} onSort={handleSort} />
                <SortableHeader column="signal" label="Signal" sort={sort} onSort={handleSort} />
                <SortableHeader column="trend" label="Trend" sort={sort} onSort={handleSort} />
                <SortableHeader column="latestVolume" label={volumeColumnLabel} sort={sort} onSort={handleSort} />
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
                  <td>{Math.round(row.viewVolume * 10) / 10}</td>
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

interface SortableHeaderProps {
  column: ResultSortColumn
  label: string
  sort: { column: ResultSortColumn; direction: SortDirection }
  onSort: (column: ResultSortColumn) => void
}

function SortableHeader({ column, label, sort, onSort }: SortableHeaderProps) {
  const active = sort.column === column
  return (
    <th
      className={`sortable-header ${active ? 'active' : ''}`}
      onClick={() => onSort(column)}
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {active && <span className="sort-indicator">{sort.direction === 'asc' ? ' ▲' : ' ▼'}</span>}
    </th>
  )
}
