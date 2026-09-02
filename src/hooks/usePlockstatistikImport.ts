import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { dedupeVolumeRows, resolveImportedPlacements, type PlockstatistikRow } from '../lib/history'

const CHUNK_SIZE = 1000
const CONCURRENCY = 6

/**
 * Upserts in parallel chunks rather than one at a time — a real import can
 * mean hundreds of thousands of volume rows, and sending those 2000 at a
 * time, sequentially, is a long serial chain of round-trips. Chunks are
 * independent of each other within a single table, so a small worker pool
 * is safe as long as the tables themselves are still upserted in order
 * (items and locations before volumes, for the foreign keys).
 */
async function chunkedUpsert(
  table: string,
  rows: Record<string, unknown>[],
  options: { onConflict?: string; ignoreDuplicates?: boolean },
  onProgress?: (done: number, total: number) => void,
) {
  const chunkCount = Math.ceil(rows.length / CHUNK_SIZE)
  let done = 0
  let nextChunk = 0

  async function worker() {
    while (nextChunk < chunkCount) {
      const i = nextChunk++
      const chunk = rows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
      const { error } = await supabase.from(table).upsert(chunk, options)
      if (error) throw new Error(`${table}: ${error.message}`)
      done += chunk.length
      onProgress?.(done, rows.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunkCount) }, () => worker()))
}

export interface ImportProgress {
  stage: 'items' | 'locations' | 'placeringar' | 'volymer'
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

  const importRows = useCallback(async (rawRows: PlockstatistikRow[]): Promise<ImportResult> => {
    // A wide-format export has one row per vara+plats — an item that moved
    // location during the file's date range can appear twice for the same
    // month column, once under each location. Deduping before anything is
    // sent also prevents the two from landing in different upsert chunks
    // and racing each other, which made the surviving plats nondeterministic.
    const rows = dedupeVolumeRows(rawRows)
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

    // Placement is written down from the list rather than inferred from the
    // volume rows later: the file says where each article is, and this is
    // the only thing that says so. One stamp for the whole import marks
    // which articles this list covered — anything still carrying an older
    // stamp was left out of it and counts as no longer placed.
    const placementBatch = new Date().toISOString()
    await chunkedUpsert(
      'vp_items',
      resolveImportedPlacements(rows).map((p) => ({
        id: p.itemId,
        current_plats: p.plats,
        placement_batch: placementBatch,
      })),
      { onConflict: 'id' },
      (done, total) => setProgress({ stage: 'placeringar', done, total }),
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
