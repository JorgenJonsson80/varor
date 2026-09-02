import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAllRows } from '../lib/supabasePagination'
import { periodCutoff } from '../lib/history'
import type { RawVolumeRow } from '../lib/results'

interface RawRow {
  item_id: string
  plats: string
  period: string
  volume: number
}

// vp_item_monthly_volume is one row per item per month and has no retention
// cutoff — it grows every import and is already ~116k rows (see the history
// in supabasePagination.ts). Every session pulled the whole thing even
// though trend (trend_preceding_months, default 3) and period-good
// (period_good_min_periods, default 4) only ever look a few months back —
// a rolling window comfortably above either trims the transfer with no
// effect on those two. bestKlass/periodGoodProtected DO scan the full
// window handed to them, so this is a deliberate tradeoff, not a free
// optimization: an item whose one qualifying "A" month was more than 18
// months ago and hasn't recurred since would no longer be protected. 18
// months already covers a full seasonal cycle with room to spare, so
// that's judged acceptable — worth knowing if a protection status ever
// looks surprising. The other visible effect is a shorter Sparkline tail
// for items with a long history; 18 months leaves that at ~1.5 years,
// generous for a "steady vs. one-off spike" glance.
const HISTORY_WINDOW_MONTHS = 18

export function useItemHistory() {
  const [rows, setRows] = useState<RawVolumeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setProgress(null)
    try {
      const data = await fetchAllRows<RawRow>(
        supabase,
        'vp_item_monthly_volume',
        'item_id, plats, period, volume',
        ['item_id', 'period'],
        (loaded) => setProgress(loaded),
        { column: 'period', value: periodCutoff(HISTORY_WINDOW_MONTHS) },
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

  /**
   * Removes every volume row for one period. Used to clear out junk periods
   * — a column that wasn't recognized as a month keeps its raw header as
   * the period name, so a stray "Försäljning April" ends up looking like a
   * period, and sorts after every real one since letters beat digits.
   * Placements live on vp_items and are unaffected.
   */
  const deletePeriod = useCallback(
    async (period: string) => {
      const { error } = await supabase.from('vp_item_monthly_volume').delete().eq('period', period)
      if (error) throw new Error(error.message)
      await reload()
    },
    [reload],
  )

  return { rows, loading, error, progress, reload, deletePeriod }
}
