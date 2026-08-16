import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Klass } from '../lib/types'

export interface LocationRow {
  plats: string
  manual_klass: Klass | null
  manual_updated_at: string | null
}

const PAGE_SIZE = 1000

/** PostgREST caps a single request at 1000 rows by default — page through until a short page ends it. */
async function fetchAllLocations(): Promise<LocationRow[]> {
  const all: LocationRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('vp_locations')
      .select('plats, manual_klass, manual_updated_at')
      .order('plats', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export function useLocations() {
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAllLocations()
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
    async (platser: string[], klass: Klass, userId: string | undefined) => {
      const { error } = await supabase
        .from('vp_locations')
        .update({
          manual_klass: klass,
          manual_updated_at: new Date().toISOString(),
          manual_updated_by: userId ?? null,
        })
        .in('plats', platser)
      if (error) throw new Error(error.message)
      await reload()
    },
    [reload],
  )

  const clearManualKlass = useCallback(
    async (platser: string[]) => {
      const { error } = await supabase
        .from('vp_locations')
        .update({ manual_klass: null, manual_updated_at: null, manual_updated_by: null })
        .in('plats', platser)
      if (error) throw new Error(error.message)
      await reload()
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
