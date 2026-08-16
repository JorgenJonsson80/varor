import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { RawVolumeRow } from '../lib/results'

const PAGE_SIZE = 1000

/** Pages through vp_item_monthly_volume — a real import can easily exceed PostgREST's 1000-row default cap. */
async function fetchAllVolumes(): Promise<RawVolumeRow[]> {
  const all: RawVolumeRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('vp_item_monthly_volume')
      .select('item_id, plats, period, volume')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    for (const row of data) {
      all.push({ itemId: row.item_id, plats: row.plats, period: row.period, volume: row.volume })
    }
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export function useItemHistory() {
  const [rows, setRows] = useState<RawVolumeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAllVolumes()
      setRows(data)
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

  return { rows, loading, error, reload }
}
