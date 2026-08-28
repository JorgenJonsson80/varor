import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Klass } from '../lib/types'

export interface PrefixRuleRow {
  prefix: string
  klass: Klass
}

export function usePrefixRules() {
  const [prefixRules, setPrefixRules] = useState<PrefixRuleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('vp_platsklass_prefix_rules')
      .select('prefix, klass')
      .order('prefix', { ascending: true })
    if (error) setError(error.message)
    else {
      setPrefixRules(data)
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // Upsert on the prefix itself (its primary key) covers both adding a new
  // prefix and editing an existing one's class in a single call.
  const saveRule = useCallback(
    async (rule: PrefixRuleRow) => {
      const { error } = await supabase.from('vp_platsklass_prefix_rules').upsert(rule)
      if (error) throw new Error(error.message)
      await reload()
    },
    [reload],
  )

  const deleteRule = useCallback(
    async (prefix: string) => {
      const { error } = await supabase.from('vp_platsklass_prefix_rules').delete().eq('prefix', prefix)
      if (error) throw new Error(error.message)
      await reload()
    },
    [reload],
  )

  /** Replaces every prefix rule with a new set — used by JSON import. */
  const replaceAll = useCallback(
    async (newRules: PrefixRuleRow[]) => {
      const { error: deleteError } = await supabase
        .from('vp_platsklass_prefix_rules')
        .delete()
        .not('prefix', 'is', null)
      if (deleteError) throw new Error(deleteError.message)

      if (newRules.length > 0) {
        const { error: insertError } = await supabase.from('vp_platsklass_prefix_rules').insert(newRules)
        if (insertError) throw new Error(insertError.message)
      }
      await reload()
    },
    [reload],
  )

  return { prefixRules, loading, error, saveRule, deleteRule, replaceAll }
}
