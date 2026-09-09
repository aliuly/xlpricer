import { useEffect, useState, useCallback, useRef } from 'react'
import { TabulatorFull as Tabulator } from 'tabulator-tables'
import type { Options, ColumnDefinition } from 'tabulator-tables'
import 'tabulator-tables/dist/css/tabulator_simple.min.css'
import Papa from 'papaparse'

import { useTabTable } from './useTabTable'

/* ── Helpers ─────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tbl(table: unknown): any {
  return table as any
}

/* ── Config ──────────────────────────────────── */

export interface CsvTabConfig<TRow extends { type: 'section' | 'data' }> {
  storagePrefix: string
  columns: ColumnDefinition[]
  /** Map a raw CSV row (string dict) into a typed row. */
  classify: (raw: Record<string, string>) => TRow
  /** Determine the new type after a cell edit. */
  recheckType: (row: TRow, field: string, value: string) => 'section' | 'data'
  /** Factory for an empty row (inserted by the Add button). */
  createEmptyRow: () => TRow
}

/* ── Props ───────────────────────────────────── */

interface CsvTabBaseProps<TRow extends { type: 'section' | 'data' }> {
  tabId: string
  dataUrl: string
  label: string
  config: CsvTabConfig<TRow>
  visible: boolean
  /** If true, start empty when no localStorage data exists. */
  seed?: boolean
}

/* ── Storage helpers (generic) ───────────────── */

function loadFromStorage<TRow>(prefix: string, tabId: string): TRow[] | null {
  try {
    const raw = localStorage.getItem(prefix + tabId)
    if (raw) return JSON.parse(raw) as TRow[]
  } catch { /* corrupt */ }
  return null
}

function saveToStorage<TRow>(prefix: string, tabId: string, rows: TRow[]): void {
  try {
    localStorage.setItem(prefix + tabId, JSON.stringify(rows))
  } catch { /* quota */ }
}

/* ── Component ───────────────────────────────── */

export default function CsvTabBase<TRow extends { type: 'section' | 'data' }>({
  tabId,
  dataUrl,
  label,
  config,
  visible,
  seed,
}: CsvTabBaseProps<TRow>) {
  const { containerRef, tableRef } = useTabTable()

  const [rows, setRows] = useState<TRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const tableReadyRef = useRef(false)

  /* ── Persist ──────────────────────────────── */

  const persist = useCallback(() => {
    const t = tbl(tableRef.current)
    if (!t) return
    saveToStorage(config.storagePrefix, tabId, t.getData() as TRow[])
  }, [config.storagePrefix, tabId])

  // Keep a ref to the latest persist so Tabulator event handlers
  // (bound once in a useEffect) always call the current version
  // with the correct tabId, even when React reuses this component.
  const persistRef = useRef(persist)
  persistRef.current = persist

  /* ── Fetch & classify ─────────────────────── */

  const fetchFromServer = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(dataUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => h.trim(),
        transform: (v: string) => v.trim(),
      })
      const classified = parsed.data.map(config.classify)
      saveToStorage(config.storagePrefix, tabId, classified)
      setRows(classified)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [dataUrl, config, tabId])

  /* ── Initial load ─────────────────────────── */

  useEffect(() => {
    if (!visible) return

    const stored = loadFromStorage<TRow>(config.storagePrefix, tabId)
    if (stored) {
      setRows(stored)
      setLoading(false)
    } else if (seed) {
      fetchFromServer()
    } else {
      setRows([])
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, visible])

  /* ── Create Tabulator ─────────────────────── */

  useEffect(() => {
    if (!rows || !containerRef.current || tableRef.current || !visible) return

    const options: Options = {
      data: rows as unknown as Record<string, unknown>[],
      columns: config.columns,
      layout: 'fitData',
      height: '100%',
      selectableRows: 1,
      // Section rows get the .section-row class; the actual colors live in
      // index.css (.tabulator .tabulator-row.section-row + :root.dark …),
      // so they follow the theme without needing a repaint on change.
      rowFormatter(row: { getData: () => unknown; getElement: () => HTMLElement }) {
        const data = row.getData() as TRow
        row.getElement().classList.toggle('section-row', data != null && data.type === 'section')
      },
    }

    tableReadyRef.current = false
    const table = new Tabulator(containerRef.current, options)
    tableRef.current = table

    table.on('tableBuilt', () => {
      tableReadyRef.current = true
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recheck = (cell: any) => {
      const r = cell.getRow()
      const data = { ...r.getData() } as TRow
      ;(data as any)[cell.getField()] = cell.getValue()
      const newType = config.recheckType(data, cell.getField(), cell.getValue())
      if (newType !== data.type) {
        r.update({ type: newType })
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    table.on('cellEdited', (cell: any) => {
      recheck(cell)
      persistRef.current()
    })

    table.on('rowDeleted', () => {
      persistRef.current()
    })

  }, [rows, visible]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Update table data ────────────────────── */

  useEffect(() => {
    const t = tbl(tableRef.current)
    if (t && rows && tableReadyRef.current) {
      t.setData(rows as Record<string, unknown>[])
    }
  }, [rows])

  /* ── Add row ──────────────────────────────── */

  const handleAddRow = useCallback(() => {
    const t = tbl(tableRef.current)
    if (!t) return
    const newRow = config.createEmptyRow() as unknown as Record<string, unknown>
    const selected = t.getSelectedRows()
    if (selected && selected.length > 0) {
      t.addRow(newRow, false, selected[0])
    } else {
      t.addRow(newRow, false)
    }
    persistRef.current()
  }, [config])

  /* ── Render ───────────────────────────────── */

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ display: visible ? 'flex' : 'none' }}>
      {visible && (
        <div className="flex gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shrink-0">
          <button
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 cursor-pointer transition-colors hover:bg-magenta/10 hover:border-magenta disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={fetchFromServer}
            disabled={loading}
          >
            ↻ Reload from server
          </button>
          <button
            className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 cursor-pointer transition-colors hover:bg-magenta/10 hover:border-magenta disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleAddRow}
          >
            + Add row
          </button>
        </div>
      )}

      {visible && loading && (
        <div className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          Loading {label}…
        </div>
      )}
      {visible && error && (
        <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          Failed to load: {error}
        </div>
      )}

      <div ref={containerRef} className="flex-1 min-h-0 overflow-hidden" />
    </div>
  )
}
