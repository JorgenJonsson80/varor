import type { SupabaseClient } from '@supabase/supabase-js'

const PAGE_SIZE = 1000
const CONCURRENCY = 6

/**
 * Fetches every row of a table/select in parallel pages of a fixed,
 * known-safe size instead of one request at a time. Real tables here can
 * run into the tens or hundreds of thousands of rows, and a serial chain
 * of paginated requests turns into a long wait — this uses a small worker
 * pool (6 concurrent) instead.
 *
 * The row count comes from a separate `head: true` request that returns
 * no row data at all, just the count — deliberately NOT folded into a
 * larger single fetch. An earlier version tried to auto-discover the
 * server's max page size by requesting 5000 rows at once, which triggered
 * a 500 from PostgREST (this project enforces a lower per-request cap or
 * timeout than that). Sticking to the well-established 1000-row default
 * avoids the whole class of "just guess a bigger number" failure.
 *
 * `orderBy` must uniquely (or near-uniquely, tie-broken deterministically
 * by the table's natural order) determine row order — `.range()` without a
 * stable ORDER BY doesn't guarantee the same row isn't returned twice, or
 * skipped, across separate page requests, and that risk is larger once
 * pages are fetched concurrently rather than one after another.
 */
export async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  orderBy: string[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<T[]> {
  const { count, error: countError } = await supabase.from(table).select('*', { count: 'exact', head: true })
  if (countError) throw new Error(countError.message)

  const total = count ?? 0
  onProgress?.(0, total)
  if (total === 0) return []

  const pageCount = Math.ceil(total / PAGE_SIZE)
  const pageResults: T[][] = new Array(pageCount)
  let loaded = 0

  let nextPage = 0
  async function worker() {
    while (nextPage < pageCount) {
      const page = nextPage++
      const from = page * PAGE_SIZE
      let query = supabase.from(table).select(columns)
      for (const column of orderBy) query = query.order(column, { ascending: true })
      const { data, error } = await query.range(from, from + PAGE_SIZE - 1)
      if (error) throw new Error(error.message)
      pageResults[page] = data as T[]
      loaded += data.length
      onProgress?.(loaded, total)
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pageCount) }, () => worker()))

  return pageResults.flat()
}
