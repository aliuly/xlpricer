import { useState } from 'react'

/**
 * Shared "Deal info" state (Deal ID / Customer / Seq No).
 *
 * Persisted to localStorage so the fields stay consistent when the
 * user switches between BasicView and HomeTab (each view unmounts
 * when the other is shown) and across page reloads.
 */

export interface DealInfo {
  dealId: string
  customer: string
  seqNo: string
}

export const DEAL_INFO_KEY = 'xlpricer-deal-info'

const EMPTY_DEAL: DealInfo = { dealId: '', customer: '', seqNo: '' }

export function loadDealInfo(): DealInfo {
  try {
    const raw = localStorage.getItem(DEAL_INFO_KEY)
    return raw ? { ...EMPTY_DEAL, ...(JSON.parse(raw) as Partial<DealInfo>) } : { ...EMPTY_DEAL }
  } catch { return { ...EMPTY_DEAL } }
}

export function saveDealInfo(info: DealInfo) {
  try {
    localStorage.setItem(DEAL_INFO_KEY, JSON.stringify(info))
  } catch {}
}

export function useDealInfo() {
  const [info, setInfo] = useState<DealInfo>(loadDealInfo)

  const setField = (field: keyof DealInfo, value: string) => {
    setInfo(prev => {
      const next = { ...prev, [field]: value }
      saveDealInfo(next)
      return next
    })
  }

  const clear = () => {
    const next = { ...EMPTY_DEAL }
    setInfo(next)
    saveDealInfo(next)
  }

  return { info, setField, clear }
}

/* ── Download filename ─────────────────────── */

/**
 * Sanitize a free-text part for use inside a filename: remove the
 * characters that are invalid in MS Windows filenames
 * (< > : " / \ | ? * and control chars), plus trailing dots/spaces,
 * which Windows strips from the saved file.  Everything else is
 * kept as the user typed it (case, spaces, etc.).
 */
export function sanitizeFilenamePart(s: string): string {
  return s
    .trim()
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '')
    .replace(/[. ]+$/, '')
}

/** Current local date as YYYY-MM-DD. */
function todayStamp(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/**
 * Build the download filename:
 *
 *   TCP_<DEAL-ID>_<CUSTOMER-NAME>_<SEQ-NO>_<DATE>.<ext>
 *
 * Each part is used as typed (with Windows-invalid characters
 * removed) and falls back to "Number", "customer", "1of1" when the
 * corresponding field is empty.  Date is the current local date as
 * YYYY-MM-DD.  Extension defaults to `xlsx`; pass `xlsm` for
 * macro-enabled output.
 */
export function dealInfoFilename(info: DealInfo, format: 'xlsx' | 'xlsm' = 'xlsx'): string {
  const dealId = sanitizeFilenamePart(info.dealId) || 'Number'
  const customer = sanitizeFilenamePart(info.customer) || 'customer'
  const seqNo = sanitizeFilenamePart(info.seqNo) || '1of1'
  return `TCP_${dealId}_${customer}_${seqNo}_${todayStamp()}.${format}`
}
