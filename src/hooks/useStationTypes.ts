import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { StationType } from '../lib/moves'

export interface StationTypeRow {
  station: string
  type: StationType
}

export function useStationTypes() {
  const [stationTypes, setStationTypes] = useState<Map<string, StationType>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('vp_station_types').select('station, type').order('station')
    if (error) setError(error.message)
    else {
      setStationTypes(new Map((data as StationTypeRow[]).map((r) => [r.station, r.type])))
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
    async (station: string, type: StationType, userId?: string) => {
      const { error } = await supabase.from('vp_station_types').upsert({
        station,
        type,
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

  return { stationTypes, loading, error, setType, clearType, reload }
}
