import { execFile, execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { generatePricingXlsx } from '../../src/xlsx/writer'
import { mergeIntoMacroWorkbook } from '../../src/xlsx/vba'
import { buildInput } from '../helpers'

const root = fileURLToPath(new URL('../..', import.meta.url))
const TSCLI = join(root, 'node_modules', '.bin', 'tsx')

let server: ReturnType<typeof createServer>
let baseUrl = ''
let outDir = ''

beforeAll(async () => {
  const fixture = readFileSync(`${root}/tests/fixtures/prices.json`)
  // A "newer pipeline" snapshot: same data, bumped timestamp.  The
  // staleness comparison is pipeline-only (includes are excluded), so
  // the stale scenarios need a pipeline difference to trigger.
  const bumped = (() => {
    const data = JSON.parse(fixture.toString('utf-8')) as { timestamp?: number }
    data.timestamp = (data.timestamp ?? 0) + 86400
    return Buffer.from(JSON.stringify(data))
  })()
  server = createServer((req, res) => {
    if (req.url === '/prices.json' || req.url === '/prices-v2.json') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(req.url === '/prices.json' ? fixture : bumped)
      return
    }
    res.writeHead(404)
    res.end('not found')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  outDir = mkdtempSync(join(tmpdir(), 'xlpricer-cli-'))
})

afterAll(() => {
  server.close()
  rmSync(outDir, { recursive: true, force: true })
})

/** Async spawn — the event loop must stay free to serve HTTP requests. */
function execFileP(
  file: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd: root, encoding: 'utf-8', timeout: 60_000 }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }))
      else resolve({ stdout, stderr })
    })
  })
}

/** The CLI prints progress lines, then a pretty-printed JSON blob. */
function lastJson(out: string): Record<string, unknown> {
  const lines = out.split('\n')
  const start = lines.findIndex(l => l.trim().startsWith('{'))
  if (start === -1) throw new Error(`no JSON in output:\n${out}`)
  return JSON.parse(lines.slice(start).join('\n'))
}

describe('CLI smoke', () => {
  it('generates a workbook from an HTTP source with fixtures', async () => {
    const out = join(outDir, 'pricing.xlsx')
    const { stdout } = await execFileP(TSCLI, ['src/xlsx/cli.ts',
      `${baseUrl}/prices.json`, 'tests/fixtures/includes/oracle.csv',
      '-o', out,
      '--assumptions', 'tests/fixtures/assumptions.csv',
      '--components', 'Components=tests/fixtures/components.csv',
      '--version', 'test', '--spa-url', 'http://spa/',
    ])
    expect(lastJson(stdout).status).toBe('ok')
    expect(existsSync(out)).toBe(true)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(readFileSync(out))
    let src: unknown
    wb.getWorksheet('T')?.eachRow((row) => {
      if (row.getCell(2).value === 'Source URL') src = row.getCell(3).value
    })
    expect(src).toBe(`${baseUrl}/prices.json`)
  }, 60_000)

  it('exits 2 with a JSON error on a failed fetch', async () => {
    let failed = false
    try {
      await execFileP(TSCLI, ['src/xlsx/cli.ts', `${baseUrl}/missing.json`])
    } catch (err) {
      failed = true
      const e = err as { code?: unknown; stderr?: string }
      expect(e.code).toBe(2)
      expect(lastJson(String(e.stderr)).status).toBe('error')
    }
    expect(failed).toBe(true)
  }, 60_000)
})

describe('CLI refresh smoke', () => {
  let fixture = ''

  beforeAll(async () => {
    fixture = join(outDir, 'cli-input.xlsx')
    const bytes = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    writeFileSync(fixture, Buffer.from(bytes))
  })

  it('refreshes a workbook, then reports unchanged on a rerun', async () => {
    const out1 = join(outDir, 'refresh.xlsx')
    const run1 = await execFileP(TSCLI, ['src/xlsx/cli.ts', '--update', fixture,
      `${baseUrl}/prices-v2.json`, 'tests/fixtures/includes/oracle.csv', '-o', out1])
    expect(lastJson(run1.stdout).status).toBe('ok')
    expect(existsSync(out1)).toBe(true)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(readFileSync(out1))
    let formatVer = ''
    wb.getWorksheet('T')?.eachRow((row) => {
      if (row.getCell(2).value === 'Format version') formatVer = String(row.getCell(3).value)
    })
    expect(formatVer).toBe('2.0.1')
    const names = wb.definedNames.model.map(n => n.name)
    expect(names).toContain('PriceListTable')
    expect(names).toContain('T_ONE_TIME')

    const out2 = join(outDir, 'refresh2.xlsx')
    const run2 = await execFileP(TSCLI, ['src/xlsx/cli.ts', '--update', out1,
      `${baseUrl}/prices-v2.json`, 'tests/fixtures/includes/oracle.csv', '-o', out2])
    expect(lastJson(run2.stdout).status).toBe('unchanged')
    expect(existsSync(out2)).toBe(false)
  }, 120_000)

  it('--check-only reports stale without writing anything', async () => {
    const { stdout } = await execFileP(TSCLI, ['src/xlsx/cli.ts', '--update', fixture,
      `${baseUrl}/prices-v2.json`, 'tests/fixtures/includes/oracle.csv', '--check-only'])
    const status = lastJson(stdout)
    expect(status.status).toBe('stale')
    expect(status.output).toBeUndefined()
    expect(existsSync(join(outDir, 'cli-input-reprice.xlsx'))).toBe(false)
  }, 60_000)

  it('--force writes a file with status forced', async () => {
    const out = join(outDir, 'forced.xlsx')
    const { stdout } = await execFileP(TSCLI, ['src/xlsx/cli.ts', '--update', fixture,
      `${baseUrl}/prices.json`, 'tests/fixtures/includes/oracle.csv', '-o', out, '--force'])
    expect(lastJson(stdout).status).toBe('forced')
    expect(existsSync(out)).toBe(true)
  }, 120_000)

  it('refuses same-path output with exit 2', async () => {
    let failed = false
    try {
      await execFileP(TSCLI, ['src/xlsx/cli.ts', '--update', fixture,
        `${baseUrl}/prices.json`, '-o', fixture])
    } catch (err) {
      failed = true
      const e = err as { code?: unknown; stderr?: string }
      expect(e.code).toBe(2)
      expect(lastJson(String(e.stderr)).status).toBe('error')
    }
    expect(failed).toBe(true)
  }, 60_000)
})

describe('CLI conversion smoke', () => {
  let templatePath = ''

  function hasVbaToolchain(): boolean {
    return existsSync(`${root}/vba/.venv/bin/python`)
  }

  beforeAll(() => {
    if (!hasVbaToolchain()) return
    execSync('make -C vba build', { cwd: root, stdio: 'pipe' })
    templatePath = `${root}/public/vba/template.xlsm`
  })

  it('--to-xlsx converts an xlsx and writes the default name', async () => {
    const input = join(outDir, 'conv-in.xlsx')
    const bytes = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    writeFileSync(input, Buffer.from(bytes))
    const out = join(outDir, 'conv-out.xlsx')
    const { stdout } = await execFileP(TSCLI, ['src/xlsx/cli.ts', input, '--to-xlsx', '-o', out])
    expect(lastJson(stdout).status).toBe('ok')
    expect(existsSync(out)).toBe(true)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(readFileSync(out))
    expect(wb.getWorksheet('Prices')).toBeTruthy()
  }, 60_000)

  it('--trim fails clearly on a never-calculated workbook', async () => {
    const input = join(outDir, 'conv-in2.xlsx')
    const bytes = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
    writeFileSync(input, Buffer.from(bytes))
    let failed = false
    try {
      await execFileP(TSCLI, ['src/xlsx/cli.ts', input, '--trim', '-o', join(outDir, 't.xlsx')])
    } catch (err) {
      failed = true
      const e = err as { code?: unknown; stderr?: string }
      expect(e.code).toBe(2)
      expect(String(e.stderr)).toContain('no cached results')
    }
    expect(failed).toBe(true)
  }, 60_000)

  it('--to-xlsm without a template is refused', async () => {
    const input = join(outDir, 'conv-in2.xlsx')
    let failed = false
    try {
      await execFileP(TSCLI, ['src/xlsx/cli.ts', input, '--to-xlsm', '-o', join(outDir, 't.xlsm')])
    } catch (err) {
      failed = true
      const e = err as { code?: unknown; stderr?: string }
      expect(e.code).toBe(2)
      expect(lastJson(String(e.stderr)).status).toBe('error')
    }
    expect(failed).toBe(true)
  }, 60_000)

  it.skipIf(!existsSync(`${root}/vba/.venv/bin/python`))(
    '--to-xlsm adds the macro project and template sheet',
    async () => {
      const input = join(outDir, 'conv-in3.xlsx')
      const bytes = await generatePricingXlsx(buildInput(), { vbaTemplate: false })
      writeFileSync(input, Buffer.from(bytes))
      const out = join(outDir, 'conv-out.xlsm')
      const { stdout } = await execFileP(TSCLI, ['src/xlsx/cli.ts', input,
        '--to-xlsm', '--xlsm', templatePath, '-o', out])
      expect(lastJson(stdout).status).toBe('ok')
      const zip = await JSZip.loadAsync(readFileSync(out))
      expect(zip.file('xl/vbaProject.bin')).toBeTruthy()
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(readFileSync(out))
      expect(wb.getWorksheet('_BOMTemplate')?.state).toBe('veryHidden')
    },
    120_000,
  )

  it.skipIf(!existsSync(`${root}/vba/.venv/bin/python`))(
    'refresh composes to a converted extension (xlsm → xlsx in one command)',
    async () => {
      // Build an xlsm input with macros
      const template = readFileSync(templatePath)
      const content = await generatePricingXlsx(buildInput(), { vbaTemplate: true })
      const merged = await mergeIntoMacroWorkbook(new Uint8Array(template), content)
      const input = join(outDir, 'comp-in.xlsm')
      writeFileSync(input, Buffer.from(merged))
      const out = join(outDir, 'comp-out.xlsx')
      const { stdout } = await execFileP(TSCLI, ['src/xlsx/cli.ts', '--update', input,
        `${baseUrl}/prices-v2.json`, 'tests/fixtures/includes/oracle.csv', '-o', out])
      expect(lastJson(stdout).status).toBe('ok')
      const zip = await JSZip.loadAsync(readFileSync(out))
      expect(zip.file('xl/vbaProject.bin')).toBeNull()
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(readFileSync(out))
      expect(wb.getWorksheet('Tools')).toBeUndefined()
      expect(wb.getWorksheet('_BOMTemplate')).toBeUndefined()
      expect(wb.getWorksheet('Prices')).toBeTruthy()
    },
    120_000,
  )
})
