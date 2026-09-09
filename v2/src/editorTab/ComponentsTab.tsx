import type { ColumnDefinition } from 'tabulator-tables'
import CsvTabBase from './CsvTabBase'
import type { CsvTabConfig } from './CsvTabBase'

/* ── Types ─────────────────────────────────── */

export interface ComponentsRow {
  type: 'section' | 'data'
  qty: string
  function: string
  description: string
  storage: string
  hr: string
}

/* ── Helpers ───────────────────────────────── */

function isNumericOrFormula(s: string): boolean {
  if (s === '') return false
  if (s.startsWith('=')) return true
  return !isNaN(Number(s))
}

function isSectionRow(
  qty: string, func: string, description: string, storage: string, hr: string,
): boolean {
  if (!qty || isNumericOrFormula(qty)) return false
  if (!func) return false
  if (description || storage || hr) return false
  return true
}

/* ── Config ────────────────────────────────── */

const columns: ColumnDefinition[] = [
  {
    title: '', width: 40, hozAlign: 'center',
    formatter: 'buttonCross',
    cellClick: (_e: Event, cell: { getRow: () => { delete: () => void } }) => cell.getRow().delete(),
    headerSort: false,
  },
  { title: 'Qty', field: 'qty', editor: 'input', minWidth: 100, headerSort: false },
  { title: 'Function', field: 'function', editor: 'input', minWidth: 140, headerSort: false },
  { title: 'Description', field: 'description', editor: 'input', minWidth: 300, headerSort: false },
  { title: 'Storage', field: 'storage', editor: 'input', minWidth: 100, headerSort: false },
  { title: 'Hr', field: 'hr', editor: 'input', minWidth: 100, headerSort: false },
]

export function classify(raw: Record<string, string>): ComponentsRow {
  const qty = raw.qty ?? ''
  const func = raw.function ?? ''
  const description = raw.description ?? ''
  const storage = raw.storage ?? ''
  const hr = raw.hr ?? ''
  return {
    type: isSectionRow(qty, func, description, storage, hr) ? 'section' : 'data',
    qty, function: func, description, storage, hr,
  }
}

function recheckType(row: ComponentsRow): 'section' | 'data' {
  return isSectionRow(row.qty, row.function, row.description, row.storage, row.hr)
    ? 'section' : 'data'
}

function createEmptyRow(): ComponentsRow {
  return { type: 'data', qty: '', function: '', description: '', storage: '', hr: '' }
}

const config: CsvTabConfig<ComponentsRow> = {
  storagePrefix: 'xlpricer-components-',
  columns,
  classify,
  recheckType,
  createEmptyRow,
}

/* ── Component ─────────────────────────────── */

interface Props {
  tabId: string
  config?: Record<string, unknown>
  visible: boolean
}

export default function ComponentsTab({ tabId, config: tabConfig, visible }: Props) {
  const dataUrl = (tabConfig?.dataUrl as string) ?? '/data/components.csv'
  const label = (tabConfig?.label as string) ?? 'Components'
  const seed = (tabConfig?.seed as boolean) ?? false

  return (
    <CsvTabBase
      tabId={tabId}
      dataUrl={dataUrl}
      label={label}
      config={config}
      visible={visible}
      seed={seed}
    />
  )
}
