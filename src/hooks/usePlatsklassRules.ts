import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Klass } from '../lib/types'

export interface PlatsklassRuleRow {
  id: string
  sort_order: number
  position: number
  values: string[]
  klass: Klass
}

export function usePlatsklassRules() {
  const [rules, setRules] = useState<PlatsklassRuleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('vp_platsklass_rules')
      .select('id, sort_order, position, values, klass')
      .order('sort_order', { ascending: true })
    if (error) setError(error.message)
    else {
      setRules(data)
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const addRule = useCallback(
    async (rule: Omit<PlatsklassRuleRow, 'id'>) => {
      const { error } = await supabase.from('vp_platsklass_rules').insert(rule)
      if (error) throw new Error(error.message)
      await reload()
    },
    [reload],
  )

  const updateRule = useCallback(
    async (id: string, patch: Partial<Omit<PlatsklassRuleRow, 'id'>>) => {
      const { error } = await supabase.from('vp_platsklass_rules').update(patch).eq('id', id)
      if (error) throw new Error(error.message)
      await reload()
    },
    [reload],
  )

  const deleteRule = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('vp_platsklass_rules').delete().eq('id', id)
      if (error) throw new Error(error.message)
      await reload()
    },
    [reload],
  )

  /** Reassigns sort_order sequentially to match the given id order (drag/up-down reordering). */
  const reorder = useCallback(
    async (orderedIds: string[]) => {
      const results = await Promise.all(
        orderedIds.map((id, index) =>
          supabase.from('vp_platsklass_rules').update({ sort_order: index }).eq('id', id),
        ),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) throw new Error(failed.error.message)
      await reload()
    },
    [reload],
  )

  /** Replaces every rule with a new ordered set — used by JSON import. */
  const replaceAll = useCallback(
    async (newRules: Omit<PlatsklassRuleRow, 'id'>[]) => {
      const { error: deleteError } = await supabase
        .from('vp_platsklass_rules')
        .delete()
        .not('id', 'is', null)
      if (deleteError) throw new Error(deleteError.message)

      if (newRules.length > 0) {
        const { error: insertError } = await supabase.from('vp_platsklass_rules').insert(newRules)
        if (insertError) throw new Error(insertError.message)
      }
      await reload()
    },
    [reload],
  )

  return { rules, loading, error, addRule, updateRule, deleteRule, reorder, replaceAll }
}
