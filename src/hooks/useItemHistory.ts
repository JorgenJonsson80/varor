import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { RawVolumeRow } from '../lib/results'

const PROBE_SIZE = 5000
const CONCURRENCY = 6

interface RawRow {
  item_id: string
  plats: string
  period: string
  volume: number
}

function toRawVolumeRow(row: RawRow): RawVolumeRow {
  return { itemId: row.item_id, plats: row.plats, period: row.period, volume: row.volume }
}

/**
 * Pages through vp_item_monthly_volume in parallel instead of one request
 * at a time. A real import can easily produce tens or hundreds of
 * thousands of rows (wide format explodes one input row into one output
 * row per month), and fetching those 1000 at a time, sequentially, turns
 * into a long serial chain of network round-trips — that's what made the
 * results view hang on "Laddar resultat" for a real file.
 *
 * The first request also discovers the server's actual per-request row
 * cap (PostgREST/Supabase commonly caps at 1000 regardless of what's
 * asked for) so later pages are sized correctly instead of assuming a
 * fixed page size and risking silently-skipped rows if that assumption
 * is wrong.
 */
async function fetchAllVolumes(onProgress?: (loaded: number, total: number) => void): Promise<RawVolumeRow[]> {
  const first = await supabase
    .from('vp_item_monthly_volume')
    .select('item_id, plats, period, volume', { count: 'exact' })
    .range(0, PROBE_SIZE - 1)
  if (first.error) throw new Error(first.error.message)

  const pageSize = first.data.length
  const total = first.count ?? first.data.length
  onProgress?.(pageSize, total)
  if (pageSize === 0 || total <= pageSize) {
    return first.data.map(toRawVolumeRow)
  }

  const pageCount = Math.ceil(total / pageSize)
  const pageResults: RawVolumeRow[][] = new Array(pageCount)
  pageResults[0] = first.data.map(toRawVolumeRow)
  let loaded = pageSize

  let nextPage = 1
  async function worker() {
    while (nextPage < pageCount) {
      const page = nextPage++
      const from = page * pageSize
      const { data, error } = await supabase
        .from('vp_item_monthly_volume')
        .select('item_id, plats, period, volume')
        .range(from, from + pageSize - 1)
      if (error) throw new Error(error.message)
      pageResults[page] = data.map(toRawVolumeRow)
      loaded += data.length
      onProgress?.(loaded, total)
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pageCount - 1) }, () => worker()))

  return pageResults.flat()
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
      const data = await fetchAllVolumes((loaded, total) => setProgress({ loaded, total }))
      setRows(data)
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
