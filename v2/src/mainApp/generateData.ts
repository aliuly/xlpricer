import Papa from 'papaparse'
import { classifyAssumptions, classifyComponents } from '../editorTab/classify'
import type { AssumptionsRow, ComponentsRow } from '../editorTab/classify'

/**
 * Load the editable assumptions/components for XLSX generation.
 *
 * - Server loaders (basic mode): fetch the configured CSV and classify
 *   it — localStorage is deliberately ignored.
 * - Tab loaders (custom mode): read the rows persisted by
 *   AssumptionsTab / ComponentsTab.
 */

/* ── Server data (basic mode) ───────────────── */

/**
 * Fetch + classify a configured CSV.  Returns `null` when there is no
 * URL or the fetch fails, so callers can skip the sheet entirely
 * (matching the original BasicView behaviour).
 */
async function fetchAndClassify<TRow>(
  dataUrl: string | undefined,
  base: string,
  classify: (raw: Record<string, string>) => TRow,
): Promise<TRow[] | null> {
  if (!dataUrl) return null
  try {
    const res = await fetch(new URL(dataUrl, base).href)
    if (!res.ok) return null
    const text = await res.text()
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
      transform: (v: string) => v.trim(),
    })
    return parsed.data.map(classify)
  } catch { return null }
}

export async function loadServerAssumptions(dataUrl?: string): Promise<AssumptionsRow[]> {
  return (await fetchAndClassify(dataUrl, window.location.href, classifyAssumptions)) ?? []
}

export function loadServerComponents(dataUrl?: string): Promise<ComponentsRow[] | null> {
  return fetchAndClassify(dataUrl, window.location.href, classifyComponents)
}

/* ── Tab-editor data (custom mode) ──────────── */

const ASSUMPTIONS_KEY = 'xlpricer-assumptions-assumptions'
const COMP_TABS_KEY = 'xlpricer-components-tabs'
const COMP_DATA_PREFIX = 'xlpricer-components-'

export function loadTabAssumptions(): unknown[] {
  try {
    const raw = localStorage.getItem(ASSUMPTIONS_KEY)
    return raw ? (JSON.parse(raw) as unknown[]) : []
  } catch { return [] }
}

export function loadTabComponents(): Record<string, unknown> {
  const components: Record<string, unknown> = {}
  try {
    const metasRaw = localStorage.getItem(COMP_TABS_KEY)
    if (!metasRaw) return components
    const metas: { id: string; label: string }[] = JSON.parse(metasRaw)
    for (const { id, label } of metas) {
      const dataRaw = localStorage.getItem(COMP_DATA_PREFIX + id)
      if (dataRaw) components[label] = JSON.parse(dataRaw)
    }
  } catch { /* corrupt state — generate with what we have */ }
  return components
}
