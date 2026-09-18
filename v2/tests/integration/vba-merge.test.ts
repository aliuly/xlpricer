import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { mergeIntoMacroWorkbook } from '../../src/xlsx/vba'
import { generatePricingXlsx } from '../../src/xlsx/writer'
import { EXPECTED_SHEETS, buildInput } from '../helpers'

const root = fileURLToPath(new URL('../..', import.meta.url))

/** Toolchain present when the vba venv exists or pyOpenVBA imports. */
function hasVbaToolchain(): boolean {
  if (existsSync(`${root}/vba/.venv/bin/python`)) return true
  try {
    execFileSync('python3', ['-c', 'import pyOpenVBA'], { stdio: 'ignore' })
    return true
  } catch { return false }
}

const maybe = hasVbaToolchain() ? describe : describe.skip

maybe('mergeIntoMacroWorkbook', () => {
  it('keeps the VBA project and splices the generated sheets', async () => {
    execSync('make -C vba build', { cwd: root, stdio: 'pipe' })
    const template = readFileSync(`${root}/public/vba/template.xlsm`)
    const content = await generatePricingXlsx(buildInput(), { vbaTemplate: true })
    const merged = await mergeIntoMacroWorkbook(new Uint8Array(template), content)

    const zip = await JSZip.loadAsync(merged)
    expect(zip.file('xl/vbaProject.bin')).toBeTruthy()

    const ct = await zip.file('[Content_Types].xml')!.async('string')
    expect(ct).toContain('macroEnabled')
    expect(ct).toContain('application/vnd.ms-office.vbaProject')

    const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string')
    expect(rels).toContain('vbaProject.bin')

    const wbXml = await zip.file('xl/workbook.xml')!.async('string')
    expect((wbXml.match(/<sheet /g) ?? []).length).toBe(EXPECTED_SHEETS.length)

    // The merged content still carries the generated T sheet and names
    // (ExcelJS loads xlsm content, ignoring the vbaProject.bin part).
    const loaded = new ExcelJS.Workbook()
    await loaded.xlsx.load(merged)
    const t = loaded.getWorksheet('T')
    expect(t).toBeTruthy()
    let src: unknown
    t?.eachRow((row) => {
      if (row.getCell(2).value === 'Source URL') src = row.getCell(3).value
    })
    expect(src).toBe('https://example.com/prices.json')
    const names = loaded.definedNames.model.map(n => n.name)
    for (const n of ['BACKUP', 'RXM', 'GB_TO_GiB', 'GiB_TO_GB',
      'PriceListDescs', 'PriceListRegions', 'PriceListTable']) {
      expect(names).toContain(n)
    }
  }, 120_000)
})
