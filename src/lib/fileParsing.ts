import Papa from 'papaparse'
import * as XLSX from 'xlsx'

export interface ParsedSpreadsheet {
  columns: string[]
  rows: Record<string, unknown>[]
}

function parseCsv(file: File): Promise<ParsedSpreadsheet> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve({ columns: result.meta.fields ?? [], rows: result.data }),
      error: (error: Error) => reject(error),
    })
  })
}

async function parseXlsx(file: File): Promise<ParsedSpreadsheet> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const columns = rows.length > 0 ? Object.keys(rows[0]) : []
  return { columns, rows }
}

/** Dispatches to PapaParse or SheetJS by file extension — the two formats the spec requires support for. */
export function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) return parseCsv(file)
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return parseXlsx(file)
  return Promise.reject(new Error(`Filtypen stöds inte: ${file.name}`))
}
