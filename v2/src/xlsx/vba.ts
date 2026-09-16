/* ── Macro workbook merge ─────────────────────
 *
 * ExcelJS cannot write macro-enabled workbooks, and transplanting a
 * vbaProject.bin into an ExcelJS-generated workbook does NOT work:
 * every VBA project contains document modules (ThisWorkbook, one per
 * sheet) bound to the workbook they were authored in, and Excel does
 * not re-bind document modules from a foreign workbook.  The symptoms
 * are duplicate ThisWorkbook modules, Workbook_Open never firing, and
 * error 429 on Worksheets.Add.
 *
 * So the merge goes the other way: the macro-enabled workbook authored
 * by vbabb/pyOpenVBA (an Excel-authored file whose project is natively
 * bound) is the HOST.  The generated workbook's content — worksheets,
 * styles, sharedStrings, theme, docProps — moves INTO the host, while
 * the host keeps its workbook identity, vbaProject.bin, and macro
 * content types.  The project never moves.
 *
 * ExcelJS is never asked to load the xlsm (it cannot read macro files);
 * everything here is plain zip-part surgery with JSZip.
 */

import JSZip from 'jszip'

const VBA_PROJECT_PART = 'xl/vbaProject.bin'
const CONTENT_TYPES_PART = '[Content_Types].xml'
const WORKBOOK_PART = 'xl/workbook.xml'
const WORKBOOK_RELS_PART = 'xl/_rels/workbook.xml.rels'

const VBA_PROJECT_REL = 'http://schemas.microsoft.com/office/2006/relationships/vbaProject'

/** Parts owned by the generated workbook; the host's copies are replaced. */
const CONTENT_OWNED_PREFIXES = ['xl/worksheets/', 'xl/theme/', 'docProps/']
const CONTENT_OWNED_EXACT = new Set(['xl/styles.xml', 'xl/sharedStrings.xml'])

function isContentOwned(partName: string): boolean {
  return CONTENT_OWNED_PREFIXES.some(p => partName.startsWith(p)) ||
    CONTENT_OWNED_EXACT.has(partName)
}

/** Merge content-type declarations: host's macro entries + generated parts'. */
function mergeContentTypes(host: string, content: string): string {
  // Host keeps its vbaProject Default and macroEnabled workbook Override;
  // drop its Overrides for parts the generated workbook replaces.
  let out = host.replace(
    /<Override\s+PartName="([^"]+)"[^>]*\/>/g,
    (full, partName: string) => isContentOwned(partName.replace(/^\//, '')) ? '' : full,
  )
  // Generated Defaults not already present (e.g. the "vml" extension).
  const haveDefaults = new Set([...host.matchAll(/<Default\s+Extension="([^"]+)"/g)].map(m => m[1]))
  const newDefaults = [...content.matchAll(/<Default\s+Extension="([^"]+)"[^>]*\/>/g)]
    .filter(m => !haveDefaults.has(m[1]))
    .map(m => m[0])
  // Generated Overrides, except the workbook one (host's macroEnabled stays).
  const newOverrides = [...content.matchAll(/<Override\s+PartName="([^"]+)"[^>]*\/>/g)]
    .filter(m => m[1] !== '/xl/workbook.xml')
    .map(m => m[0])
  return out.replace('</Types>', `${newDefaults.join('')}${newOverrides.join('')}</Types>`)
}

/**
 * Merge an ExcelJS-generated workbook into a macro-enabled template.
 *
 * The template is a complete .xlsm whose VBA project is natively bound
 * to its own workbook part (e.g. vba/project.xlsm built by vbabb, after
 * strip_doc_sheets.py removed the template's sheet document module).
 * Returns the merged workbook as a zip buffer, to be saved as .xlsm.
 */
export async function mergeIntoMacroWorkbook(
  templateXlsm: Uint8Array,
  contentXlsx: ArrayBuffer,
): Promise<ArrayBuffer> {
  const template = await JSZip.loadAsync(templateXlsm)
  const content = await JSZip.loadAsync(contentXlsx)

  if (!template.file(VBA_PROJECT_PART)) {
    throw new Error(`template has no ${VBA_PROJECT_PART}; expected a macro-enabled workbook`)
  }

  const out = new JSZip()

  /* ── Host entries, minus the parts the generated content replaces ── */
  for (const [name, entry] of Object.entries(template.files)) {
    if (entry.dir || isContentOwned(name)) continue
    out.file(name, await entry.async('uint8array'))
  }

  /* ── Generated parts (worksheets, styles, theme, docProps, …) ── */
  for (const [name, entry] of Object.entries(content.files)) {
    if (entry.dir) continue
    if (name === WORKBOOK_PART || name === WORKBOOK_RELS_PART || name === CONTENT_TYPES_PART) continue
    out.file(name, await entry.async('uint8array'))
  }

  /* ── workbook.xml: host's (identity + binding), with generated sheets ── */
  const hostWb = await template.file(WORKBOOK_PART)!.async('string')
  const contentWb = await content.file(WORKBOOK_PART)!.async('string')
  const sheets = contentWb.match(/<sheets>[\s\S]*?<\/sheets>/)
  if (!sheets) {
    throw new Error('generated workbook.xml has no <sheets> element')
  }
  const definedNames = contentWb.match(/<definedNames>[\s\S]*?<\/definedNames>/)
  let wbOut = hostWb.replace(/<sheets>[\s\S]*?<\/sheets>/, sheets[0])
  if (definedNames && !wbOut.includes('<definedNames')) {
    wbOut = wbOut.replace(sheets[0], sheets[0] + definedNames[0])
  }
  out.file(WORKBOOK_PART, wbOut)

  /* ── workbook rels: generated's + the host's vbaProject relationship ── */
  const contentRels = await content.file(WORKBOOK_RELS_PART)!.async('string')
  const rIds = [...contentRels.matchAll(/Id="rId(\d+)"/g)].map(m => Number(m[1]))
  const nextRId = Math.max(...rIds, 0) + 1
  const relsOut = contentRels.replace('</Relationships>',
    `<Relationship Id="rId${nextRId}" Type="${VBA_PROJECT_REL}" Target="vbaProject.bin"/></Relationships>`)
  out.file(WORKBOOK_RELS_PART, relsOut)

  /* ── Content types ── */
  const hostCt = await template.file(CONTENT_TYPES_PART)!.async('string')
  const contentCt = await content.file(CONTENT_TYPES_PART)!.async('string')
  out.file(CONTENT_TYPES_PART, mergeContentTypes(hostCt, contentCt))

  return out.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}
