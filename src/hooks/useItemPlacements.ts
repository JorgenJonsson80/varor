import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/supabasePagination'

interface PlacementRow {
  id: string
  current_plats: string | null
  placement_batch: string | null
}

export interface ItemPlacements {
  /** itemId -> plats, for the articles the most recent import still covered. */
  byItem: Map<string, string>
  /** Stamp of that import, or null when nothing has been imported since placements existed. */
  batch: string | null
}

/**
 * Reads where each article sits, as written down by the most recent import.
 *
 * Only the newest batch counts. vp_items keeps every article ever imported,
 * so one left out of the latest list still has its old current_plats — that
 * is exactly the stale placement this replaces, and filtering on the newest
 * stamp is what drops it. Comparing stamps client-side avoids sending a
 * 26k-item filter to PostgREST just to ask "which of these are current".
 */
export function useItemPlacements() {
  const [placements, setPlacements] = useState<ItemPlacements>({ byItem: new Map(), batch: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchAllRows<PlacementRow>(supabase, 'vp_items', 'id, current_plats, placement_batch', ['id'])

      let batch: string | null = null
      for (const row of rows) {
        if (row.placement_batch && (batch === null || row.placement_batch > batch)) batch = row.placement_batch
      }

      const byItem = new Map<string, string>()
      for (const row of rows) {
        if (row.current_plats && row.placement_batch === batch) byItem.set(row.id, row.current_plats)
      }

      setPlacements({ byItem, batch })
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

  return { placements, loading, error, reload }
}
