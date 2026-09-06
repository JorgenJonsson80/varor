import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  DISMISSAL_SCOPES,
  pairKey,
  type DismissalReason,
  type DismissalScope,
  type MoveBlocks,
} from '../lib/moves'

export interface DismissalRow {
  id: string
  item_id: string | null
  plats: string | null
  reason: DismissalReason
  note: string | null
  created_at: string
}

export function useMoveDismissals() {
  const [dismissals, setDismissals] = useState<DismissalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('vp_move_dismissals')
      .select('id, item_id, plats, reason, note, created_at')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else {
      setDismissals(data as DismissalRow[])
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  /**
   * What is stored decides how far the dismissal reaches: a location nobody
   * can use is stored without an article, an article that can't be moved
   * without a location, everything else as the exact pair it was said
   * about. The reason supplies the default scope; the caller can override
   * it, since the person dismissing knows things the reason list doesn't.
   */
  const dismiss = useCallback(
    async (params: {
      itemId: string
      plats: string
      reason: DismissalReason
      scope?: DismissalScope
      note?: string
      userId?: string
    }) => {
      const scope = params.scope ?? DISMISSAL_SCOPES[params.reason]
      const { error } = await supabase.from('vp_move_dismissals').insert({
        item_id: scope === 'plats' ? null : params.itemId,
        plats: scope === 'vara' ? null : params.plats,
        reason: params.reason,
        note: params.note?.trim() || null,
        created_by: params.userId ?? null,
      })
      if (error) throw new Error(error.message)
      await reload()
    },
    [reload],
  )

  const undismiss = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('vp_move_dismissals').delete().eq('id', id)
      if (error) throw new Error(error.message)
      await reload()
    },
    [reload],
  )

  const blocks: MoveBlocks = useMemo(() => {
    const platser = new Set<string>()
    const varor = new Set<string>()
    const par = new Set<string>()
    for (const row of dismissals) {
      if (row.item_id && row.plats) par.add(pairKey(row.item_id, row.plats))
      else if (row.plats) platser.add(row.plats)
      else if (row.item_id) varor.add(row.item_id)
    }
    return { platser, varor, par }
  }, [dismissals])

  return { dismissals, blocks, loading, error, dismiss, undismiss, reload }
}
