import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { StationType } from '../lib/moves'

export interface StationTypeRow {
  station: string
  type: StationType
  line: string | null
}

export function useStationTypes() {
  const [stationTypes, setStationTypes] = useState<Map<string, StationType>>(new Map())
  const [stationLines, setStationLines] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('vp_station_types')
      .select('station, type, line')
      .order('station')
    if (error) setError(error.message)
    else {
      const rows = data as StationTypeRow[]
      setStationTypes(new Map(rows.map((r) => [r.station, r.type])))
      setStationLines(new Map(rows.filter((r) => r.line).map((r) => [r.station, r.line!])))
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // Upsert on the station itself (its primary key) covers both setting a
  // type for the first time and changing it.
  const setType = useCallback(
    async (station: string, type: StationType, userId?: string, line?: string | null) => {
      const { error } = await supabase.from('vp_station_types').upsert({
        station,
        type,
        ...(line === undefined ? {} : { line: line || null }),
        updated_at: new Date().toISOString(),
        updated_by: userId ?? null,
      })
      if (error) throw new Error(error.message)
      await reload()
    },
    [reload],
  )

  const clearType = useCallback(
    async (station: string) => {
      const { error } = await supabase.from('vp_station_types').delete().eq('station', station)
      if (error) throw new Error(error.message)
      await reload()
    },
    [reload],
  )

  return { stationTypes, stationLines, loading, error, setType, clearType, reload }
}
