import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/supabasePagination'
import type { Klass } from '../lib/types'

export interface LocationRow {
  plats: string
  manual_klass: Klass | null
  manual_updated_at: string | null
}

export function useLocations() {
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAllRows<LocationRow>(
        supabase,
        'vp_locations',
        'plats, manual_klass, manual_updated_at',
        ['plats'],
      )
      setLocations(data)
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

  const setManualKlass = useCallback(
    async (platser: string[], klass: Klass, userId: string | undefined, options?: { skipReload?: boolean }) => {
      const { error } = await supabase
        .from('vp_locations')
        .update({
          manual_klass: klass,
          manual_updated_at: new Date().toISOString(),
          manual_updated_by: userId ?? null,
        })
        .in('plats', platser)
      if (error) throw new Error(error.message)
      if (!options?.skipReload) await reload()
    },
    [reload],
  )

  const clearManualKlass = useCallback(
    async (platser: string[], options?: { skipReload?: boolean }) => {
      const { error } = await supabase
        .from('vp_locations')
        .update({ manual_klass: null, manual_updated_at: null, manual_updated_by: null })
        .in('plats', platser)
      if (error) throw new Error(error.message)
      if (!options?.skipReload) await reload()
    },
    [reload],
  )

  /** Adds newly-seen locations from a JDE export. Never touches existing rows, so manual tags survive re-import. */
  const importLocations = useCallback(
    async (platser: string[]): Promise<{ inserted: number }> => {
      const known = new Set(locations.map((l) => l.plats))
      const newOnes = Array.from(new Set(platser)).filter((p) => !known.has(p))
      if (newOnes.length === 0) return { inserted: 0 }

      const { error } = await supabase
        .from('vp_locations')
        .upsert(
          newOnes.map((plats) => ({ plats })),
          { onConflict: 'plats', ignoreDuplicates: true },
        )
      if (error) throw new Error(error.message)
      await reload()
      return { inserted: newOnes.length }
    },
    [locations, reload],
  )

  return { locations, loading, error, setManualKlass, clearManualKlass, importLocations, reload }
}
