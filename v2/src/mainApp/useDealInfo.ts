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

  return { info, setField }
}

/* ── Download filename ─────────────────────── */

/**
 * Sanitize a free-text field for use inside a filename: remove the
 * characters that are invalid in MS Windows filenames
 * (< > : " / \ | ? * and control chars), plus trailing dots/spaces,
 * which Windows strips from the saved file.  Everything else is
 * kept as the user typed it (case, spaces, etc.).
 */
function sanitizePart(s: string): string {
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
 *   TCP_<DEAL-ID>_<CUSTOMER-NAME>_<SEQ-NO>_<DATE>.xlsx
 *
 * Each part is used as typed (with Windows-invalid characters
 * removed) and falls back to "Number", "customer", "1of1" when the
 * corresponding field is empty.  Date is the current local date as
 * YYYY-MM-DD.
 */
export function dealInfoFilename(info: DealInfo): string {
  const dealId = sanitizePart(info.dealId) || 'Number'
  const customer = sanitizePart(info.customer) || 'customer'
  const seqNo = sanitizePart(info.seqNo) || '1of1'
  return `TCP_${dealId}_${customer}_${seqNo}_${todayStamp()}.xlsx`
}
