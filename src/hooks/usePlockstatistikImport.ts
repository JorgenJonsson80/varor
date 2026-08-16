import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { PlockstatistikRow } from '../lib/history'

const CHUNK_SIZE = 2000

async function chunkedUpsert(
  table: string,
  rows: Record<string, unknown>[],
  options: { onConflict?: string; ignoreDuplicates?: boolean },
  onProgress?: (done: number, total: number) => void,
) {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase.from(table).upsert(chunk, options)
    if (error) throw new Error(`${table}: ${error.message}`)
    onProgress?.(Math.min(i + CHUNK_SIZE, rows.length), rows.length)
  }
}

export interface ImportProgress {
  stage: 'items' | 'locations' | 'volymer'
  done: number
  total: number
}

export interface ImportResult {
  items: number
  locations: number
  volumes: number
}

export function usePlockstatistikImport() {
  const [progress, setProgress] = useState<ImportProgress | null>(null)

  const importRows = useCallback(async (rows: PlockstatistikRow[]): Promise<ImportResult> => {
    const itemIds = Array.from(new Set(rows.map((r) => r.itemId)))
    const platser = Array.from(new Set(rows.map((r) => r.plats)))

    // Items and locations only get created if missing — never overwrites
    // metadata (description, ATC-code, manual platsklass, ...) that
    // already exists on a row.
    await chunkedUpsert(
      'vp_items',
      itemIds.map((id) => ({ id })),
      { onConflict: 'id', ignoreDuplicates: true },
      (done, total) => setProgress({ stage: 'items', done, total }),
    )

    await chunkedUpsert(
      'vp_locations',
      platser.map((plats) => ({ plats })),
      { onConflict: 'plats', ignoreDuplicates: true },
      (done, total) => setProgress({ stage: 'locations', done, total }),
    )

    // Volume rows DO overwrite on conflict — re-importing a corrected
    // month should replace the old figure, including which plats the
    // item was picked from that period.
    const volumeRows = rows.map((r) => ({
      item_id: r.itemId,
      plats: r.plats,
      period: r.period,
      volume: r.volume,
    }))
    await chunkedUpsert(
      'vp_item_monthly_volume',
      volumeRows,
      { onConflict: 'item_id,period' },
      (done, total) => setProgress({ stage: 'volymer', done, total }),
    )

    setProgress(null)
    return { items: itemIds.length, locations: platser.length, volumes: volumeRows.length }
  }, [])

  return { importRows, progress }
}
