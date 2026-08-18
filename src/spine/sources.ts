// The two upstream sources for a daily deck.
//
// local  — the StockPilot pipeline's own report JSON. Full fidelity: momentum,
//          outcomes and rotations exist ONLY here (the Notion DB has no
//          columns for them).
// notion — the StockPilot Reports database. This is the published record of
//          what the pipeline actually logged, and the only source available on
//          a machine that does not have the pipeline checked out.
//
// Neither is trusted. Both return source-shaped objects that build-deck.ts
// validates and reconciles.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from '@notionhq/client';
import { LocalReportSource } from './schema';

export const DEFAULT_PIPELINE_DIR =
  process.env.STOCKPILOT_DIR ??
  join(process.env.HOME ?? '', 'Documents', 'stockpilot');

// --------------------------------------------------------------------------
// Local report JSON
// --------------------------------------------------------------------------

export async function listLocalDates(pipelineDir = DEFAULT_PIPELINE_DIR): Promise<string[]> {
  try {
    const files = await readdir(join(pipelineDir, 'reports'));
    return files
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ''))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export async function loadLocalReport(
  date: string,
  pipelineDir = DEFAULT_PIPELINE_DIR,
): Promise<LocalReportSource | null> {
  try {
    const raw = await readFile(join(pipelineDir, 'reports', `${date}.json`), 'utf8');
    const parsed = LocalReportSource.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn(
        `[spine] local report ${date}.json failed validation: ${parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      );
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

// --------------------------------------------------------------------------
// Notion — StockPilot Reports database
// --------------------------------------------------------------------------

export interface NotionReport {
  date: string;
  thesis: string | null;
  unansweredCount: number | null;
  // Parsed from the free-text properties. See parse notes below.
  buys: Array<{ ticker: string; positionPct: number | null; entryNote: string | null }>;
  watches: Array<{ ticker: string; note: string | null }>;
  skips: string[];
  // ticker -> {tier, positionPct} recovered from the TOON Allocation block.
  allocationMeta: Map<string, { tier: number; positionPct: number }>;
}

function plainText(prop: unknown): string | null {
  const rich = (prop as { rich_text?: Array<{ plain_text?: string }> } | undefined)?.rich_text;
  if (!Array.isArray(rich)) return null;
  const joined = rich.map((r) => r.plain_text ?? '').join('');
  return joined.trim() || null;
}

// "AMD (3%) — Confirmed institutional block accumulation..."
// The em dash is the delimiter the pipeline writes; hyphens appear inside the
// notes themselves, so only " — " may be used to split.
export function parseBuysField(text: string | null) {
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^([A-Z][A-Z.\-]{0,9})\s*(?:\((\d+(?:\.\d+)?)%\))?\s*(?:—|–|-{2,})\s*(.*)$/.exec(line);
      if (!m) return { ticker: line.split(/\s/)[0] ?? line, positionPct: null, entryNote: null };
      return {
        ticker: m[1],
        positionPct: m[2] ? Number(m[2]) : null,
        entryNote: m[3]?.trim() || null,
      };
    });
}

// "NVDA — AI infrastructure demand remains..."
export function parseWatchesField(text: string | null) {
  if (!text) return [];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = /^([A-Z][A-Z.\-]{0,9})\s*(?:—|–|-{2,})\s*(.*)$/.exec(line);
      if (!m) return { ticker: line.split(/\s/)[0] ?? line, note: null };
      return { ticker: m[1], note: m[2]?.trim() || null };
    });
}

// "MSFT, IBM, GOOGL, ..."
export function parseSkipsField(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => /^[A-Z][A-Z.\-]{0,9}$/.test(s));
}

// The Allocation property is a TOON block:
//   allocation[4]{ticker,tier,position_pct,entry_note,stop_loss_note}:
//     AMD,2,3,Confirmed institutional...,Failure to clear $180-$200...
//
// The trailing note fields contain commas, so the row is NOT safely splittable
// into five values. Only the first three fields are unambiguous, so only those
// are read here; entry notes come from the Buys property, which uses an
// unambiguous " — " delimiter, and stop notes come from the local report.
export function parseAllocationToon(text: string | null) {
  const out = new Map<string, { tier: number; positionPct: number }>();
  if (!text) return out;
  for (const line of text.split('\n')) {
    const row = line.trim();
    if (!row || row.startsWith('allocation[')) continue;
    const m = /^([A-Z][A-Z.\-]{0,9}),\s*(\d+),\s*(\d+(?:\.\d+)?)\s*(?:,|$)/.exec(row);
    if (!m) continue;
    out.set(m[1], { tier: Number(m[2]), positionPct: Number(m[3]) });
  }
  return out;
}

export async function loadNotionReport(date: string): Promise<NotionReport | null> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_REPORT_DATABASE_ID;
  if (!token || !dbId) {
    console.warn('[spine] NOTION_TOKEN / NOTION_REPORT_DATABASE_ID not set — skipping Notion');
    return null;
  }

  try {
    const notion = new Client({ auth: token });
    const res = await notion.databases.query({
      database_id: dbId,
      filter: { property: 'Date', date: { equals: date } },
      page_size: 1,
    });
    const page = res.results[0] as { properties?: Record<string, unknown> } | undefined;
    if (!page?.properties) return null;

    const props = page.properties;
    const count = (props['Unanswered Count'] as { number?: number } | undefined)?.number;

    return {
      date,
      thesis: plainText(props['Thesis']),
      unansweredCount: typeof count === 'number' ? count : null,
      buys: parseBuysField(plainText(props['Buys'])),
      watches: parseWatchesField(plainText(props['Watches'])),
      skips: parseSkipsField(plainText(props['Skips'])),
      allocationMeta: parseAllocationToon(plainText(props['Allocation'])),
    };
  } catch (err) {
    console.warn(`[spine] Notion fetch failed: ${(err as Error).message}`);
    return null;
  }
}

export async function listNotionDates(limit = 30): Promise<string[]> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_REPORT_DATABASE_ID;
  if (!token || !dbId) return [];
  try {
    const notion = new Client({ auth: token });
    const res = await notion.databases.query({
      database_id: dbId,
      sorts: [{ property: 'Date', direction: 'descending' }],
      page_size: limit,
    });
    return res.results
      .map((p) => {
        const d = (p as { properties?: Record<string, unknown> }).properties?.['Date'] as
          | { date?: { start?: string } }
          | undefined;
        return d?.date?.start ?? null;
      })
      .filter((d): d is string => typeof d === 'string');
  } catch {
    return [];
  }
}
