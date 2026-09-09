import ExcelJS from 'exceljs';
import type { Worksheet } from 'exceljs';
import { genMetaSheet } from './meta';
import { genAssSheet } from './params';
import { genPriceSheet } from './prices';
import { genBOMSheet } from './bom';
import { genVolumeSheet, updatePrices } from './vol';
import { genOverviewSheet } from './overview';
import { genEsaSheet } from './esa';
import type { PricesData } from '../prices/types';

/* ── Build workbook ────────────────────────── */

export interface AppMeta {
  version?: string;
  spaUrl?: string;
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

export async function generatePricingXlsx(data: PricingData): Promise<ArrayBuffer> {
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
  const wsVols = workbook.addWorksheet('Volumes');
  const wsPrc = workbook.addWorksheet('Prices');
  const wsAss = workbook.addWorksheet('Assumptions');
  const enableEsa = data.appMeta.enableEsa ?? true;
  let wsEsa: Worksheet | undefined;
  if (enableEsa) {
    wsEsa = workbook.addWorksheet('ESA');
  }
  const wsMeta = workbook.addWorksheet('T');

  genMetaSheet(
      wsMeta,
      refMap,
      data.appMeta.version ?? '',
      data.appMeta.spaUrl ?? '',
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
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}
