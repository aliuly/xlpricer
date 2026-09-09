import type { ColumnDefinition } from 'tabulator-tables'
import CsvTabBase from './CsvTabBase'
import type { CsvTabConfig } from './CsvTabBase'

/* ── Types ─────────────────────────────────── */

export interface AssumptionsRow {
  type: 'section' | 'data'
  key: string
  value: string
  when: string
  who: string
  notes: string
}

/* ── Config ────────────────────────────────── */

const columns: ColumnDefinition[] = [
  {
    title: '', width: 40, hozAlign: 'center',
    formatter: 'buttonCross',
    cellClick: (_e: Event, cell: { getRow: () => { delete: () => void } }) => cell.getRow().delete(),
    headerSort: false,
  },
  { title: 'Key', field: 'key', editor: 'input', minWidth: 200, headerSort: false },
  { title: 'Value', field: 'value', editor: 'input', minWidth: 150, maxWidth: 450, headerSort: false },
  { title: 'When', field: 'when', editor: 'input', minWidth: 120, headerSort: false },
  { title: 'Who', field: 'who', editor: 'input', minWidth: 120, headerSort: false },
  { title: 'Notes', field: 'notes', editor: 'input', minWidth: 200, headerSort: false },
]

export function classify(raw: Record<string, string>): AssumptionsRow {
  const key = raw.key ?? ''
  const value = raw.value ?? ''
  const when = raw.when ?? ''
  const who = raw.who ?? ''
  const notes = raw.notes ?? ''
  const populated = [value, when, who, notes].filter((f) => f !== '').length
  return {
    type: (key && populated === 0) ? 'section' : 'data',
    key, value, when, who, notes,
  }
}

function recheckType(row: AssumptionsRow, _field: string, _value: string): 'section' | 'data' {
  const populated = [row.value, row.when, row.who, row.notes].filter((f) => f !== '').length
  return populated === 0 ? 'section' : 'data'
}

function createEmptyRow(): AssumptionsRow {
  return { type: 'data', key: '', value: '', when: '', who: '', notes: '' }
}

const config: CsvTabConfig<AssumptionsRow> = {
  storagePrefix: 'xlpricer-assumptions-',
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

export default function AssumptionsTab({ tabId, config: tabConfig, visible }: Props) {
  const dataUrl = (tabConfig?.dataUrl as string) ?? '/data/assumptions.csv'
  const seed = (tabConfig?.seed as boolean) ?? true

  return (
    <CsvTabBase
      tabId={tabId}
      dataUrl={dataUrl}
      label="Assumptions"
      config={config}
      visible={visible}
      seed={seed}
    />
  )
}
