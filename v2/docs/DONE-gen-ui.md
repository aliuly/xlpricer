# TODO: Unify the SPA generate views (BasicView ↔ HomeTab)

**Status:** implemented 2026-09-17.  Shared worker protocol +
generator hook, unified `GenerateView`, and thin `BasicView` /
`HomeTab` wrappers; 92 tests green, `npm run build` and `npm run lint`
clean (only pre-existing lint warnings).  Remaining manual items: the
in-browser generate smokes in both modes (see the checklist).

## Goal

The SPA has two views that do the same job — build and download a
pricing workbook:

- `src/mainApp/BasicView.tsx` — rendered directly in **basic mode**.
  Assumptions/components are fetched fresh from the configured CSV
  URLs (`assumptions.csv` / `preload.csv`).
- `src/homeTab/HomeTab.tsx` — the **Home tab in custom mode**.
  Assumptions/components are read from the tab editor's
  `localStorage` state.

Both views duplicate the XLSX worker lifecycle, the download plumbing,
the include-payload resolution, the header, and the busy overlay.  The
only real difference between them is **where the editable data comes
from**.  Consolidate the shared plumbing *and* the page UI so both
modes render one canonical view with two data sources.

## Current duplication inventory

| Concern | BasicView | HomeTab | Notes |
|---|---|---|---|
| Worker creation / reuse | ✓ | ✓ | different `new URL(...)` only |
| `onmessage` / `onerror` handling | ✓ | ✓ | identical |
| Blob + download filename | ✓ | ✓ | identical |
| `appMeta` build | ✓ | ✓ | HomeTab also sends `sourceUrl`; BasicView does not (gap) |
| Enabled includes from localStorage | ✓ | ✓ | identical |
| Uploaded includes from localStorage | ✓ | ✓ | identical |
| Header JSX | ✓ | ✓ | identical except HomeTab has `shrink-0` |
| Busy overlay JSX | ✓ | ✓ | identical |
| Deal info fields | shared already | shared already | `DealInfoFields` |
| Assumptions data | fetch+classify CSV | localStorage JSON | per-mode |
| Components data | fetch+classify CSV | localStorage JSON | per-mode |
| Pricing metadata card (sum.txt) | ✓ | ✗ | UX gap |
| Docs links + footer | ✓ | ✗ | UX gap |
| Intro / layout | card layout | centered compact layout | to be unified |

## Recommended changes

### 1. Worker protocol types — `src/homeTab/xlsxWorkerProtocol.ts` (new)

Pure types only (no React/DOM), so both the worker and the React hook
can import them:

```ts
export interface UploadedInclude {
  name: string
  version: string
  records: Record<string, unknown>[]
}

export interface WorkerRequest {
  assumptions: unknown
  components: Record<string, unknown>
  dataUrl: string
  includeUrls?: string[]
  uploadedIncludes?: UploadedInclude[]
  appMeta: AppMeta
}

export interface WorkerResponse {
  type: 'ok' | 'err'
  buffer?: ArrayBuffer
  message?: string
  stack?: string
}
```

`AppMeta` is imported as a type from `src/xlsx/writer.ts`.

### 2. Generator hook — `src/mainApp/useXlsxGenerator.ts` (new)

- Constants for the include storage keys
  (`xlpricer-includes-enabled`, `xlpricer-includes-uploaded`,
  `xlpricer-includes-<id>`).
- `collectIncludePayload(includes)` → `{ includeUrls, uploadedIncludes }`
  (moves the duplicated localStorage logic here).
- `useXlsxGenerator()` hook:
  - owns `busy` state and the `workerRef`,
  - creates the worker once via
    `new URL('../homeTab/xlsxWorker.ts', import.meta.url)`,
  - handles `onmessage`/`onerror`, alerts, blob creation, download,
  - exposes `{ busy, generate(request) }`, where the request carries
    `dataUrl`, `assumptions`, `components`, the include payload, and an
    optional `sourceUrl`.
- `GenerateRequest` = the worker request minus `appMeta`, plus
  `sourceUrl?`.  The hook builds `appMeta` (`__GIT_VERSION__`, current
  SPA URL, `sourceUrl` when provided).

### 3. Shared chrome — `src/mainApp/AppChrome.tsx` (new)

- `AppHeader()` — the magenta `XLpricer V2` header.
- `BusyOverlay()` — the absolute-positioned spinner overlay.

### 4. Per-mode data loaders

- **Server loaders** (basic): fetch the CSV URL, `Papa.parse` with
  `header: true` / `skipEmptyLines: true` / trimmed headers and values,
  then `classifyAssumptions` / `classifyComponents`.  A single generic
  `loadClassifiedRows(dataUrl, base, classify)` replaces the two
  copy-pasted fetch blocks in BasicView.
- **Tab loaders** (custom): read `xlpricer-assumptions-assumptions`,
  `xlpricer-components-tabs`, and `xlpricer-components-<id>` into the
  same `assumptions` / `components` shapes.  Move them into
  module-level helpers so `HomeTab`'s `handleGenerate` shrinks to
  load + call `generate`.

### 5. One canonical view — `src/mainApp/GenerateView.tsx` (new)

```ts
interface GenerateViewProps {
  pricesUrl?: string
  includes?: string[]
  assumptionsDataUrl?: string   // used only when dataSource === 'server'
  componentsDataUrl?: string    // used only when dataSource === 'server'
  dataSource: 'server' | 'tabs'
}
```

Layout (BasicView's card layout becomes the canonical one):

- root: `relative h-full overflow-auto bg-gray-50 dark:bg-gray-900`
  (adding `relative` fixes the busy overlay positioning in basic mode),
- `AppHeader`,
- Generate card (primary CTA),
- Deal info card (`DealInfoFields`),
- Pricing data card (sum.txt metadata — now shown in custom mode too),
- docs links + version footer,
- `BusyOverlay` while generating.

Behaviour:

- `dataSource === 'server'` → server loaders (§4).
- `dataSource === 'tabs'` → tab loaders (§4).
- Both paths converge on `useXlsxGenerator()` +
  `collectIncludePayload()`.

### 6. Thin wrappers

Keep the existing export names so `App.tsx` and the tab registry need
no changes:

```tsx
// src/mainApp/BasicView.tsx
export default function BasicView(props: GenerateViewProps) {
  return <GenerateView dataSource="server" {...props} />
}

// src/homeTab/HomeTab.tsx
export default function HomeTab({ config }: Props) {
  return <GenerateView dataSource="tabs" pricesUrl={...} includes={...} />
}
```

`HomeTab` extracts `pricesUrl` / `includes` from `config` and passes
primitives; this also removes the unstable `homeConfig` object from the
`useCallback` dependency.

### 7. Worker — `src/homeTab/xlsxWorker.ts` (modified)

Delete the local `WorkerRequest` interface and import it from
`xlsxWorkerProtocol.ts`.

## UI/UX decisions

- **Canonical layout:** BasicView's card layout is used for both modes.
  HomeTab's centered compact layout (intro + Actions list) is retired.
  *(Decided 2026-09-17 — BasicView card layout, no `compact` variant.)*
- Custom mode's Home tab gains the **pricing metadata card** and the
  **docs links footer**, so both modes present the same information.
- Both modes get the same primary CTA, deal-info placement, and busy
  overlay.

## Behaviour changes (intentional)

- BasicView now sends `appMeta.sourceUrl = pricesUrl`, matching
  HomeTab, so the generated `T` sheet records the pricing source in
  both modes.
- Custom mode gains the sum.txt metadata and footer links (UX
  consistency).
- Busy overlay is anchored to the view root instead of the page.

## Out of scope (follow-up candidate)

- `IncludesTab.tsx` still hardcodes the same include storage keys.
  Extract them into a shared `includesStore.ts` later so the
  `useXlsxGenerator` constants, `IncludesTab`, and the include payload
  builder all read from one place.
- xlsx/xlsm selection, ESA flag, and reprice/conversion UI stay in
  `docs/TODO-spa.md`.

## File list

- New: `src/homeTab/xlsxWorkerProtocol.ts` — shared worker types.
- New: `src/mainApp/useXlsxGenerator.ts` — hook + include payload.
- New: `src/mainApp/AppChrome.tsx` — `AppHeader`, `BusyOverlay`.
- New: `src/mainApp/GenerateView.tsx` — unified view.
- New: `src/mainApp/generateData.ts` — per-mode data loaders
  (server CSV vs. tab-editor localStorage).
- Modified: `src/homeTab/xlsxWorker.ts` — use shared types.
- Modified: `src/mainApp/BasicView.tsx` — thin wrapper.
- Modified: `src/homeTab/HomeTab.tsx` — thin wrapper.
- Unchanged: `src/mainApp/App.tsx`, `ModeSelector.tsx`,
  `DealInfoFields.tsx`, tab registry.

## Verification checklist

- [x] `npm run build` (tsc + Vite) — Vite resolves the worker URL from
      the new hook location.
- [x] `npm run lint` (only the pre-existing warnings in
      `src/xlsx/xlu.ts` and `src/prices/enrich.ts`).
- [x] `npm run test:run` — 92 tests green.
- [ ] Basic mode: generate downloads a workbook with server-loaded
      assumptions/components.
- [ ] Custom mode → Home tab: generate downloads a workbook with the
      localStorage-edited assumptions/components.
- [ ] Enabled / uploaded includes are honoured in both modes.
- [ ] Busy overlay appears and disappears in both modes.
- [ ] Pricing metadata card shows in both modes.
- [ ] Generated `T` sheet records `Source URL` in both modes.
- [ ] Deal info edits persist when switching between basic and custom
      modes (unchanged `useDealInfo` behaviour).

## Notes

- No changes to `App.tsx` or the tab registry: BasicView keeps its
  prop shape and HomeTab keeps the `TabProps` contract.
- `useXlsxGenerator` stays in `mainApp`; the worker stays in `homeTab`
  and is referenced by URL, so the ExcelJS worker chunk remains
  code-split and lazy-loaded on first generate.

***
* Current views: `src/mainApp/BasicView.tsx`, `src/homeTab/HomeTab.tsx`
* Worker: `src/homeTab/xlsxWorker.ts`
* Shared deal info: `src/mainApp/useDealInfo.ts`,
  `src/mainApp/DealInfoFields.tsx`
* Tab registry / mode wiring: `src/mainApp/App.tsx`
