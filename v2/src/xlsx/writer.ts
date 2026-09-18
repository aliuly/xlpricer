import ExcelJS from 'exceljs';
import type { Worksheet } from 'exceljs';
import { genMetaSheet } from './meta';
import { genAssSheet } from './params';
import { genPriceSheet } from './prices';
import { genFinderSheet, FINDER_SHEET_NAME, modernizeWorkbookMetadata } from './finder';
import { genBOMSheet, genBomTemplateSheet } from './bom';
import { genVolumeSheet, updatePrices } from './vol';
import { genOverviewSheet } from './overview';
import { genEsaSheet } from './esa';
import { TEMPLATE_SHEET_NAME, META_SHEET_NAME } from './constants';
import type { PricesData } from '../prices/types';

/* ── Build workbook ────────────────────────── */

export interface AppMeta {
  version?: string;
  spaUrl?: string;
  /** URL of the pricing JSON source; recorded in the T sheet. */
  sourceUrl?: string;
  /** Enable ESA (Enterprise Support Agreement) section in the Overview sheet. */
  enableEsa?: boolean;
}

export interface PricingData {
  assumptions: unknown;
  components: Record<string, unknown>;
  /** Already-fetched and pipeline-processed pricing data. */
  pricingData: PricesData;
  appMeta: AppMeta;
}

export interface GenerateOptions {
  /**
   * Include the hidden `_BOMTemplate` clone-template sheet used by the
   * VBA `AddTab` macro.  Set only when generating macro-enabled output.
   */
  vbaTemplate?: boolean;
}

export async function generatePricingXlsx(
  data: PricingData,
  opts: GenerateOptions = {},
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'XLPricer-TS';
  const refMap: Record<string, string> = {};

  const pricingData = data.pricingData;

  // create tabs (in the right order)
  const wsOverview = workbook.addWorksheet('Overview');
  const wsBOMs : Record<string, Worksheet> = {};
  for (const [label] of Object.entries(data.components)) {
    wsBOMs[label] = workbook.addWorksheet(label);
  }
  let wsTemplate: Worksheet | undefined;
  if (opts.vbaTemplate) {
    wsTemplate = workbook.addWorksheet(TEMPLATE_SHEET_NAME);
    wsTemplate.state = 'veryHidden';
  }
  const wsVols = workbook.addWorksheet('Volumes');
  const wsPrc = workbook.addWorksheet('Prices');
  const wsFinder = workbook.addWorksheet(FINDER_SHEET_NAME);
  const wsAss = workbook.addWorksheet('Assumptions');
  const enableEsa = data.appMeta.enableEsa ?? true;
  let wsEsa: Worksheet | undefined;
  if (enableEsa) {
    wsEsa = workbook.addWorksheet('ESA');
  }
  const wsMeta = workbook.addWorksheet(META_SHEET_NAME);

  genMetaSheet(
      wsMeta,
      refMap,
      data.appMeta.version ?? '',
      data.appMeta.spaUrl ?? '',
      data.appMeta.sourceUrl ?? '',
      pricingData,
  );
  genAssSheet(
    wsAss,
    refMap,
    data.assumptions,
  );
  genPriceSheet(
    wsPrc,
    refMap,
    pricingData,
  );
  genFinderSheet(
    wsFinder,
    pricingData,
  );

  /* ── Components sheets ──────────────────── */
  const tabs = Object.keys(data.components);
  for (const [label] of Object.entries(data.components)) {
    const wsC = wsBOMs[label];
    genBOMSheet(
      wsC,
      refMap,
      data.components[label]
    );
  }

  /* ── Hidden clone template for the VBA AddBOM macro ── */
  if (wsTemplate) {
    genBomTemplateSheet(wsTemplate, refMap);
  }
  /* ──  ──────────────────── */

  genVolumeSheet(
    wsVols,
    refMap,
    tabs,
    pricingData,
  );
  updatePrices(wsPrc, refMap);

  if (wsEsa) {
    genEsaSheet(wsEsa, refMap);
  }

  genOverviewSheet(
    wsOverview,
    refMap,
    data.components,
    enableEsa,
  );

  //~ console.log('refMap ',refMap);


  const raw = await workbook.xlsx.writeBuffer()
  // ExcelJS browser build returns a polyfilled Buffer, not a native
  // ArrayBuffer.  Slice out the real ArrayBuffer so callers always
  // get a standard transferable object.
  const buf = raw as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number }
  const sliced = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  return modernizeWorkbookMetadata(sliced)
}
