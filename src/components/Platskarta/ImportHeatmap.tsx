import { useState } from 'react'
import * as XLSX from 'xlsx'
import { classifyHeatmapZones, extractSheetXml } from '../../lib/heatmap'
import { getStation } from '../../lib/location'

interface Props {
  stationStart: number
  stationEnd: number
  /** Heatmap location labels are prefixes (e.g. "P1010-01--A-"), not complete plats strings — the caller matches them against real locations. */
  onGreenLocationsFound: (prefixes: string[]) => void
}

const MIN_STATION = 10
const MAX_STATION = 67
// Already have dedicated rule/manual coverage — heatmap shouldn't second-guess those.
const EXCLUDED_STATIONS = new Set(['36', '50'])

export function ImportHeatmap({ stationStart, stationEnd, onGreenLocationsFound }: Props) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ green: string[]; red: number } | null>(null)

  async function handleFile(file: File) {
    setBusy(true)
    setStatus(null)
    setPreview(null)
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      // Heuristic: these exports pair a per-location grid sheet with a "summering" tab — skip the latter.
      const sheetName = workbook.SheetNames.find((n) => !/summ/i.test(n)) ?? workbook.SheetNames[0]
      const sheetIndex = workbook.SheetNames.indexOf(sheetName)
      const sheet = workbook.Sheets[sheetName]
      const sheetXml = await extractSheetXml(file, sheetIndex)

      const zones = classifyHeatmapZones(sheet, sheetXml)
      const inScope = zones.filter((z) => {
        const station = getStation(z.loc, stationStart, stationEnd)
        if (EXCLUDED_STATIONS.has(station)) return false
        const stationNum = Number(station)
        if (!Number.isFinite(stationNum)) return false
        return stationNum >= MIN_STATION && stationNum <= MAX_STATION
      })
      const green = inScope.filter((z) => z.zone === 'green').map((z) => z.loc)
      const red = inScope.filter((z) => z.zone === 'red').length

      setPreview({ green, red })
      setStatus(
        `"${sheetName}": ${green.length} gröna positioner hittade (stn ${MIN_STATION}–${MAX_STATION}, ej ` +
          `36/50). ${red} röda hittades också men rörs inte.`,
      )
    } catch (e) {
      setStatus(`Kunde inte läsa filen: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  function handleApply() {
    if (!preview) return
    onGreenLocationsFound(preview.green)
    setPreview(null)
    setStatus(null)
  }

  return (
    <details className="import-heatmap">
      <summary>Sätt A-platser via heatmap</summary>
      <p className="hint">
        Läser en heatmap-export och föreslår klass A för platser i grön zon inom stn {MIN_STATION}
        –{MAX_STATION} (ej 36/50, redan täckta av regler/manuellt). Röda platser rörs aldrig — de
        taggar du själv. Heatmappens platsangivelse är en förkortad prefix (t.ex. "P1010-01--A-"), inte en
        komplett plats — den matchas mot alla dina befintliga platser som börjar så (t.ex.
        "P1010-01--A-2-" och "-3-"), inte mot prefixet självt. Föreslagna platser blir väntande ändringar,
        inget sparas förrän du trycker "Spara ändringar" nedan.
      </p>
      <input
        type="file"
        accept=".xlsx,.xls"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
      {status && <p className="import-status">{status}</p>}
      {preview && preview.green.length > 0 && (
        <button type="button" onClick={handleApply}>
          Matcha {preview.green.length} positioner mot platslistan och föreslå som A
        </button>
      )}
    </details>
  )
}
