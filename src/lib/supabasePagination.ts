import type { SupabaseClient } from '@supabase/supabase-js'

const PAGE_SIZE = 1000

export function quoteFilterValue(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`
}

/**
 * Builds a PostgREST `.or()` filter string expressing "the row after this
 * cursor" in the given column order — e.g. for orderBy [item_id, period]
 * and cursor [i, p]:
 *   item_id.gt."i",and(item_id.eq."i",period.gt."p")
 * which is the standard keyset-pagination "next row" condition for a
 * composite sort key.
 */
export function buildKeysetFilter(orderBy: string[], cursor: string[]): string {
  const clauses: string[] = []
  for (let i = 0; i < orderBy.length; i++) {
    const eqParts = orderBy.slice(0, i).map((col, j) => `${col}.eq.${quoteFilterValue(cursor[j])}`)
    const gtPart = `${orderBy[i]}.gt.${quoteFilterValue(cursor[i])}`
    clauses.push(eqParts.length === 0 ? gtPart : `and(${[...eqParts, gtPart].join(',')})`)
  }
  return clauses.join(',')
}

/**
 * Fetches every row of a table/select via keyset (cursor) pagination
 * instead of OFFSET/range.
 *
 * Two earlier versions of this both broke on a real ~116k-row table:
 * one used `count: 'exact'` to size an OFFSET-based loop and that count
 * query itself was expensive/unreliable under RLS; the next dropped the
 * count but kept OFFSET-based `.range()` paging, which outright hit a
 * Postgres statement timeout — OFFSET pagination gets more expensive the
 * deeper you go, because the database has to scan and sort through
 * everything up to that offset just to discard it, and six of those
 * running in parallel made it worse, not better.
 *
 * Keyset pagination doesn't have that problem: each page asks for "the
 * next N rows after this specific row", which a B-tree index can satisfy
 * directly regardless of how deep into the table it is — cost stays flat
 * page over page instead of growing with depth. The tradeoff is that it
 * has to run sequentially (each page's cursor depends on the previous
 * page's last row), so this trades the earlier (broken) parallelism for
 * pages that are actually fast and don't time out.
 *
 * `orderBy` must uniquely (or near-uniquely, tie-broken deterministically
 * by the table's natural order) determine row order — without that, the
 * "greater than the last row" condition doesn't reliably advance.
 */
export async function fetchAllRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  orderBy: string[],
  onProgress?: (loaded: number) => void,
): Promise<T[]> {
  const allRows: Record<string, unknown>[] = []
  let cursor: string[] | null = null

  for (;;) {
    let query = supabase.from(table).select(columns)
    for (const column of orderBy) query = query.order(column, { ascending: true })
    if (cursor) query = query.or(buildKeysetFilter(orderBy, cursor))
    const { data, error } = await query.limit(PAGE_SIZE)
    if (error) throw new Error(error.message)

    const page = data as unknown as Record<string, unknown>[]
    allRows.push(...page)
    onProgress?.(allRows.length)

    if (page.length < PAGE_SIZE) break
    const last = page[page.length - 1]
    cursor = orderBy.map((column) => String(last[column]))
  }

  return allRows as unknown as T[]
}
