/* ── Pricing data types ──────────────────── */

/** Metadata for an included CSV file. */
export interface IncludeMeta {
  /** ISO 8601 timestamp (git commit date, file mtime, or Last-Modified). */
  version: string;
  /** Short git SHA of the commit that last changed this file. */
  sha?: string;
  /** First line of the commit message. */
  message?: string;
}

/**
 * Column-oriented (flattened) format
 */
export interface PricesData {
  keys: string[];
  /** Human-readable column labels (null for internal/unnamed columns). */
  columns: (string | null)[];
  /** Column-oriented data: `records[colIdx][rowIdx]`. */
  records: unknown[][];
  /** Total number of rows (may differ from `records[0].length`). */
  count?: number;
  /* ── metadata ──────── */
  schema?: string;
  params?: Record<string, string | Record<string, string>>;
  timestamp?: number;
  datetime?: string;
  cksum?: string;
  generatedBy?: string;
  /* --- additional metadata ------- */
  /** Include group → version string or IncludeMeta object. */
  includes?: Record<string, string | IncludeMeta>;
  patches?: Record<string, {
    count: number;
    description: string;
  }>;
  /** Validation lists: name → sorted values. E.g. { EVS: [...], REGIONS: [...] } */
  choices?: Record<string, string[]>;
  /** Tier definitions: tierID → { _XlTitle_, _tiers, _tariffs_, region, ... } */
  tiers?: Record<string, Record<string, unknown>>;
}


/**
 * Options controlling pipeline behaviour.
 */
export interface PipelineOptions {
  /** Included data — keyed by filename stem, with metadata and parsed records. */
  includes?: Record<string, IncludeMeta & {
    records: Record<string, unknown>[];
  }>;
  /** Log progress to stderr. */
  verbose?: boolean
}
