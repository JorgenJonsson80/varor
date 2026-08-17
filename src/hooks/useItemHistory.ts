import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/supabasePagination'
import type { RawVolumeRow } from '../lib/results'

interface RawRow {
  item_id: string
  plats: string
  period: string
  volume: number
}

export function useItemHistory() {
  const [rows, setRows] = useState<RawVolumeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setProgress(null)
    try {
      const data = await fetchAllRows<RawRow>(
        supabase,
        'vp_item_monthly_volume',
        'item_id, plats, period, volume',
        ['item_id', 'period'],
        (loaded, total) => setProgress({ loaded, total }),
      )
      setRows(data.map((row) => ({ itemId: row.item_id, plats: row.plats, period: row.period, volume: row.volume })))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  return { rows, loading, error, progress, reload }
}
