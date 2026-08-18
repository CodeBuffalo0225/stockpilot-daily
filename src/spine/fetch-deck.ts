// CLI: resolve a date, pull both sources, gate them, write data/deck.json.
//
//   npx tsx src/spine/fetch-deck.ts            # latest available date
//   npx tsx src/spine/fetch-deck.ts 2026-08-17 # a specific date
//
// Writing the deck to disk is what makes the render reproducible: the video
// never reaches the network, so a render is always of a deck someone can open
// and read.

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import { buildDeck } from './build-deck';
import { listLocalDates, listNotionDates, loadLocalReport, loadNotionReport } from './sources';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..', '..');

// Read the pipeline's own .env so the Notion credentials live in exactly one
// place on this machine. A local .env still wins if present.
dotenv.config({
  path: join(
    process.env.STOCKPILOT_DIR ?? join(process.env.HOME ?? '', 'Documents', 'stockpilot'),
    '.env',
  ),
});
dotenv.config({ path: join(projectRoot, '.env'), override: true });

export async function resolveDate(requested?: string): Promise<string> {
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) return requested;
  if (requested) throw new Error(`Invalid date "${requested}" — expected YYYY-MM-DD.`);
  const [local, notion] = await Promise.all([listLocalDates(), listNotionDates(5)]);
  const latest = [...local, ...notion].sort().reverse()[0];
  if (!latest) {
    throw new Error(
      'No StockPilot reports found locally or in Notion. Set STOCKPILOT_DIR, or add NOTION_TOKEN and NOTION_REPORT_DATABASE_ID.',
    );
  }
  return latest;
}

export async function fetchDeck(requested?: string) {
  const date = await resolveDate(requested);
  const [local, notion] = await Promise.all([loadLocalReport(date), loadNotionReport(date)]);
  const { deck, warnings } = buildDeck({ date, local, notion });
  return { deck, warnings };
}

async function main() {
  const { deck, warnings } = await fetchDeck(process.argv[2]);

  const outPath = join(projectRoot, 'data', 'deck.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(deck, null, 2));

  console.log(`\nStockPilot Daily — ${deck.date}  [source: ${deck.source}]`);
  console.log(
    `  BUY ${deck.counts.buy} · WATCH ${deck.counts.watch} · SKIP ${deck.counts.skip}` +
      `   screened ${deck.counts.screened} · tape ${deck.tape.length} tickers`,
  );
  console.log(
    `  allocation ${deck.allocation.length} · momentum ${deck.momentum.length} · rotations flagged ${deck.rotations.flagged}`,
  );
  if (warnings.length) {
    console.log('\n  warnings:');
    for (const w of warnings) console.log(`   ! ${w}`);
  }
  console.log(`\n  wrote ${outPath}\n`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`\n[spine] ${(err as Error).message}\n`);
    process.exit(1);
  });
}
