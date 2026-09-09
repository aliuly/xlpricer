/* ── Pure data types & classify functions (no UI deps) ── */

/* ── Assumptions ──────────────────────────── */

export interface AssumptionsRow {
  type: 'section' | 'data'
  key: string
  value: string
  when: string
  who: string
  notes: string
}

export function classifyAssumptions(raw: Record<string, string>): AssumptionsRow {
  const key = raw.key ?? ''
  const value = raw.value ?? ''
  const when = raw.when ?? ''
  const who = raw.who ?? ''
  const notes = raw.notes ?? ''
  const populated = [value, when, who, notes].filter(f => f !== '').length
  return { type: (key && populated === 0) ? 'section' : 'data', key, value, when, who, notes }
}

/* ── Components ───────────────────────────── */

export interface ComponentsRow {
  type: 'section' | 'data'
  qty: string
  function: string
  description: string
  storage: string
  hr: string
}

function isNumericOrFormula(s: string): boolean {
  if (s === '') return false
  if (s.startsWith('=')) return true
  return !isNaN(Number(s))
}

export function classifyComponents(raw: Record<string, string>): ComponentsRow {
  const qty = raw.qty ?? ''
  const func = raw.function ?? ''
  const description = raw.description ?? ''
  const storage = raw.storage ?? ''
  const hr = raw.hr ?? ''
  const isSection = qty && !isNumericOrFormula(qty) && func && !description && !storage && !hr
  return { type: isSection ? 'section' : 'data', qty, function: func, description, storage, hr }
}
