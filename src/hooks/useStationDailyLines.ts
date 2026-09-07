import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/supabasePagination'
import type { StationDayRow } from '../lib/stationlines'

interface RawRow {
  station: string
  datum: string
  rader: number
}

export function useStationDailyLines() {
  const [rows, setRows] = useState<StationDayRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAllRows<RawRow>(supabase, 'vp_station_daily_lines', 'station, datum, rader', [
        'station',
        'datum',
      ])
      setRows(data.map((r) => ({ station: r.station, datum: r.datum, rader: Number(r.rader) })))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  /** Upserts on station+day, so re-importing an overlapping stretch corrects it rather than doubling it. */
  const importRows = useCallback(
    async (newRows: StationDayRow[]) => {
      const CHUNK = 1000
      for (let i = 0; i < newRows.length; i += CHUNK) {
        const chunk = newRows.slice(i, i + CHUNK).map((r) => ({
          station: r.station,
          datum: r.datum,
          rader: r.rader,
          updated_at: new Date().toISOString(),
        }))
        const { error } = await supabase
          .from('vp_station_daily_lines')
          .upsert(chunk, { onConflict: 'station,datum' })
        if (error) throw new Error(error.message)
      }
      await reload()
    },
    [reload],
  )

  return { rows, loading, error, importRows, reload }
}
