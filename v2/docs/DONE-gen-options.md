# TODO: Generate options UI (format · ESA)

**Status:** implemented 2026-09-17.  Options card (Format dropdown +
ESA toggle + Reset), worker protocol/generation, config-driven
template URL, and `.xlsm` download plumbing.  `npm run build` /
`npm run lint` / `npm run test:run` clean (only pre-existing lint
warnings; 92 tests green), plus an offline xlsx/xlsm/ESA smoke.
Remaining manual items: the in-browser checks in the checklist.

Companion/superset of the first two items in `docs/TODO-spa.md`
(*xlsx/xlsm selection*, *ESA flag*).  This one turns those CLI/core
capabilities into an options card in the unified `GenerateView`.

## Goal

Add an **Options card** to `GenerateView`, immediately after the
Deal info card, so the user can control the generated workbook:

1. **Format** — `XLSX` (default) or `XLSM`.
2. **ESA** — on / off (Enterprise Support Agreement section in the
   Overview sheet).

The card appears in **both modes** (basic and custom) because it is
part of the shared `GenerateView`; the options affect only the final
generation step.

## Current state (reference)

- `src/mainApp/GenerateView.tsx` renders Generate → Deal info →
  Pricing data cards; `handleGenerate` builds the worker request.
- `src/mainApp/useXlsxGenerator.ts` posts a `WorkerRequest` and
  downloads the worker's `ArrayBuffer` with a hard-coded `.xlsx`
  filename.
- `src/homeTab/xlsxWorkerProtocol.ts` defines `WorkerRequest` /
  `WorkerResponse`; the worker calls
  `generatePricingXlsx(out)` with **no** `GenerateOptions`.
- `src/xlsx/writer.ts`:
  - `AppMeta.enableEsa` already exists and defaults to **true**
    (ESA on today).
  - `GenerateOptions.vbaTemplate` controls the hidden `_BOMTemplate`
    sheet needed for XLSM.
- `src/xlsx/cli.ts` already implements the equivalent switches:
  `--xlsm <template>` (merge into macro host), `--esa` / `--no-esa`.
- `public/vba/template.xlsm` is the macro host template.

## Recommended changes

### Format + ESA (no core changes required)

#### 1. Options state + card

New `src/mainApp/GenOptions.tsx` (or keep the state in
`GenerateView`):

```ts
interface GenOptions {
  format: 'xlsx' | 'xlsm'
  enableEsa: boolean
}
```

- Defaults: `{ format: 'xlsx', enableEsa: true }` — XLSX default,
  ESA on (decided 2026-09-17).
- Persist in `localStorage` (`xlpricer-gen-options`, JSON) so the
  choice survives reloads and mode switches (decided: yes).
- UI: single-line controls — a **dropdown** for Format (`XLSX` /
  `XLSM`) and a **toggle switch** for ESA, plus a small **Reset**
  link in the card header.
- Card heading: `⚙️ Options`, placed after Deal info, in both modes.

Decided card sketch:

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ ⚙️ Options                                                      Reset    │
│                                                                          │
│  Format │ XLSX                                   ▼ │  ESA     [ ●──── ] │
│  Excel workbook                                                         │
│                                                                          │
│  (XLSM selected → helper text becomes "Macro-enabled workbook")         │
└──────────────────────────────────────────────────────────────────────────┘
```

UnoCSS classes follow the existing form-field style: the dropdown is
`w-64 px-3 py-2 text-sm rounded-lg border border-gray-300
dark:border-gray-600 bg-white dark:bg-gray-700 ...`, and the ESA
switch is `w-10 h-6 rounded-full bg-magenta` with a sliding white
knob (`translate-x-4` when on).

#### 2. Worker protocol

Extend `src/homeTab/xlsxWorkerProtocol.ts`:

```ts
export interface WorkerGenerateOptions {
  format: 'xlsx' | 'xlsm'
  /** Absolute URL of the macro host (.xlsm), required when format is 'xlsm'. */
  vbaTemplateUrl?: string
}

export interface WorkerRequest {
  assumptions: unknown
  components: Record<string, unknown>
  dataUrl: string
  includeUrls?: string[]
  uploadedIncludes?: UploadedInclude[]
  appMeta: AppMeta
  options?: WorkerGenerateOptions
}
```

`enableEsa` rides in `appMeta` (already supported by the writer);
format/template are worker-level options.

#### 3. Worker generation

`src/homeTab/xlsxWorker.ts` mirrors the CLI's generate path:

```ts
const format = req.options?.format ?? 'xlsx'

const buffer = await generatePricingXlsx(out, {
  vbaTemplate: format === 'xlsm',
})

if (format === 'xlsm') {
  const templateUrl = req.options?.vbaTemplateUrl
  if (!templateUrl) throw new Error('XLSM requires vbaTemplateUrl')
  const templateRes = await fetch(templateUrl)
  if (!templateRes.ok) throw new Error(`Failed to fetch ${templateUrl}: HTTP ${templateRes.status}`)
  const xlsm = await mergeIntoMacroWorkbook(
    new Uint8Array(await templateRes.arrayBuffer()),
    buffer,
  )
  self.postMessage({ type: 'ok', buffer: xlsm }, { transfer: [xlsm] })
  return
}

self.postMessage({ type: 'ok', buffer }, { transfer: [buffer] })
```

(`mergeIntoMacroWorkbook` is already browser-safe and used this way by
the CLI.)

#### 4. Hook download plumbing

`src/mainApp/useXlsxGenerator.ts`:

- `GenerateRequest` gains `options?: WorkerGenerateOptions`.
- Download extension from the selected format:
  `dealInfoFilename(info, format)` — extend
  `src/mainApp/useDealInfo.ts` with an optional extension parameter
  (default `xlsx`).
- MIME type: `.xlsm` →
  `application/vnd.ms-excel.sheet.macroEnabled.12`.

#### 5. Template URL

Read the template URL from `config.json` (`home.vbaTemplateUrl`).
`App.tsx` passes it through to `GenerateView` the same way it already
passes `pricesUrl`/`includes`; `GenerateView` resolves it against the
SPA base and puts it in `options.vbaTemplateUrl` when XLSM is
selected.

#### 6. ESA plumbing

`GenerateView.handleGenerate` sets `appMeta.enableEsa` from the option
state.  No writer change needed (`AppMeta.enableEsa` already exists).

### Other candidate options (for later, not in this card yet)

- **Reprice on open** — already a VBA/refresh feature, but not a
  generation option.
- **Non-recurrent items** — currently fixed (`Item/ot`); could become
  a toggle/select.
- **Includes in basic mode** — the Includes tab only exists in custom
  mode; exposing include selection in basic mode is a separate UX
  decision.

## Decisions (2026-09-17)

1. **ESA default** — **on** (preserves current generated output).
2. **Template URL** — read from `config.json`
   (`home.vbaTemplateUrl`).
3. **Options persistence** — yes, `localStorage`.
4. **Options card in both modes** — yes (shared `GenerateView`).
5. **Reset button** — kept, in the card header.
6. **Format UI** — dropdown with only `XLSX` / `XLSM`; one-line
   helper text reads "Excel workbook" or "Macro-enabled workbook".

## File list

- New: `src/mainApp/GenOptions.tsx` — options card + state
  (or state inline in `GenerateView`).
- Modified: `src/mainApp/GenerateView.tsx` — render the card, pass
  options into the generate request.
- Modified: `src/mainApp/App.tsx` — pass `home.vbaTemplateUrl` into
  the view config.
- Modified: `public/config.json` — add `home.vbaTemplateUrl`.
- Modified: `src/homeTab/xlsxWorkerProtocol.ts` — `WorkerGenerateOptions`.
- Modified: `src/homeTab/xlsxWorker.ts` — format/vbaTemplate handling.
- Modified: `src/mainApp/useXlsxGenerator.ts` — options, extension,
  MIME type.
- Modified: `src/mainApp/useDealInfo.ts` — extension parameter for
  `dealInfoFilename`.

## Verification checklist

- [x] `npm run build` / `npm run lint` / `npm run test:run` (92 green).
- [x] Offline smoke: plain xlsx has no `_BOMTemplate`; xlsm build has
      `_BOMTemplate` and merges into `public/vba/template.xlsm`;
      `enableEsa: false` omits the ESA sheet.
- [ ] Browser: options card renders after Deal info in both modes.
- [ ] Browser: default is XLSX + ESA on; Reset is disabled at defaults.
- [ ] Browser: XLSX selection downloads `.xlsx` with the current
      workbook contents.
- [ ] Browser: XLSM selection downloads `.xlsm`, opens with macros,
      and contains `_BOMTemplate` (mirrors CLI `--xlsm`).
- [ ] Browser: template URL comes from `config.json`
      (`home.vbaTemplateUrl`), not hard-coded.
- [ ] Browser: ESA off omits the Enterprise Support Agreement section
      from the Overview sheet.
- [ ] Browser: options persist across reload and basic↔custom
      switching.

## Notes

- `TODO-spa.md` still lists *xlsx/xlsm selection* and *ESA flag*;
  those two bullets are superseded by this doc.
- The worker chunk grows by the `vba.ts` merge path (JSZip is already
  bundled); acceptable, but keep `convert.ts` out of the worker unless
  needed — the CLI-style direct merge is cheaper than `toXlsm`
  (no double load/write).
- `_BOMTemplate` must only be generated for XLSM (`vbaTemplate`),
  exactly as the CLI does today.

***
* UI: `src/mainApp/GenerateView.tsx`
* Generator hook: `src/mainApp/useXlsxGenerator.ts`
* Worker: `src/homeTab/xlsxWorker.ts` + `xlsxWorkerProtocol.ts`
* Core options: `src/xlsx/writer.ts`, `src/xlsx/cli.ts`
* Macro host: `public/vba/template.xlsm`
