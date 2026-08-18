import type { SupabaseClient } from '@supabase/supabase-js'

const PAGE_SIZE = 1000
const CONCURRENCY = 6

/**
 * Fetches every row of a table/select in parallel batches of a fixed,
 * known-safe page size — without ever asking for an exact row count.
 *
 * An earlier version used `count: 'exact'` to size the pagination loop up
 * front. That works fine on small tables (locations), but on a
 * hundred-thousand-row table it's an expensive operation under RLS (the
 * same class of problem that caused an outright 500 earlier, when count
 * was combined with a range request) — and on this project it was
 * quietly coming back wrong/empty rather than erroring, which is worse:
 * no error to catch, just a table that looks unimported after a fresh
 * login even though the data is really there.
 *
 * Instead: fetch CONCURRENCY pages at a time, and stop as soon as any
 * page in a batch comes back shorter than PAGE_SIZE — that's the
 * unambiguous end-of-table signal, no separate count query needed. A
 * request past the real end of the table just returns an empty page
 * (not an error), so slightly overshooting the last batch is harmless.
 *
 * `orderBy` must uniquely (or near-uniquely, tie-broken deterministically
 * by the table's natural order) determine row order — `.range()` without
 * a stable ORDER BY doesn't guarantee the same row isn't returned twice,
 * or skipped, across separate page requests, and that risk is larger once
 * pages are fetched concurrently rather than one after another.
 */
export async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  orderBy: string[],
  onProgress?: (loaded: number) => void,
): Promise<T[]> {
  const allRows: T[] = []
  let nextPage = 0
  let reachedEnd = false

  while (!reachedEnd) {
    const pagesInBatch = Array.from({ length: CONCURRENCY }, (_, i) => nextPage + i)
    nextPage += CONCURRENCY

    const batchResults = await Promise.all(
      pagesInBatch.map(async (page) => {
        let query = supabase.from(table).select(columns)
        for (const column of orderBy) query = query.order(column, { ascending: true })
        const from = page * PAGE_SIZE
        const { data, error } = await query.range(from, from + PAGE_SIZE - 1)
        if (error) throw new Error(error.message)
        return data as T[]
      }),
    )

    for (const pageRows of batchResults) allRows.push(...pageRows)
    onProgress?.(allRows.length)

    reachedEnd = batchResults.some((pageRows) => pageRows.length < PAGE_SIZE)
  }

  return allRows
}
