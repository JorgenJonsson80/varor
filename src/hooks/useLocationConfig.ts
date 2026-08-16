import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Klass } from '../lib/types'

export interface LocationConfigRow {
  id: number
  base_klass: Klass
  station_start: number
  station_end: number
  pareto_threshold_a: number
  pareto_threshold_b: number
  trend_preceding_months: number
  trend_threshold: number
  period_good_top_n: number
  period_good_threshold: number
  period_good_min_periods: number
  watch_threshold: number
  updated_at: string
}

export function useLocationConfig() {
  const [config, setConfig] = useState<LocationConfigRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('vp_location_config').select('*').eq('id', 1).single()
    if (error) setError(error.message)
    else {
      setConfig(data)
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const update = useCallback(async (patch: Partial<LocationConfigRow>) => {
    const { data, error } = await supabase
      .from('vp_location_config')
      .update(patch)
      .eq('id', 1)
      .select()
      .single()
    if (error) throw new Error(error.message)
    setConfig(data)
  }, [])

  return { config, loading, error, update, reload }
}
