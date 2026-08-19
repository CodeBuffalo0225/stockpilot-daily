// Pull a deck through the spine and persist it.
//
//   npm run sync              # latest date
//   npm run sync 2026-08-17
//   npm run sync -- --backfill 20   # last N local report dates
//
// Writes to Supabase when configured, and always mirrors to data/decks/.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({
  path: join(
    process.env.STOCKPILOT_DIR ?? join(process.env.HOME ?? '', 'Documents', 'stockpilot'),
    '.env',
  ),
});
dotenv.config({ path: join(projectRoot, '.env.local'), override: true });
dotenv.config({ path: join(projectRoot, '.env'), override: true });

import { fetchDeck } from '../src/spine/fetch-deck';
import { pushDeck } from '../src/spine/push-deck';
import { listLocalDates } from '../src/spine/sources';
import { describeStore } from '../src/spine/store';

async function main() {
  const argv = process.argv.slice(2);
  const backfillAt = argv.indexOf('--backfill');
  const store = describeStore();
  console.log(`\nstore: ${store.label} (${store.detail})\n`);

  let dates: Array<string | undefined>;
  if (backfillAt >= 0) {
    const n = Number(argv[backfillAt + 1] ?? 10);
    dates = (await listLocalDates()).slice(0, n);
    console.log(`backfilling ${dates.length} dates\n`);
  } else {
    dates = [argv.find((a) => !a.startsWith('--'))];
  }

  let ok = 0;
  for (const date of dates) {
    try {
      const { deck, warnings } = await fetchDeck(date);
      const res = await pushDeck(deck, projectRoot);
      console.log(
        `  ✓ ${res.date} → ${res.target}  [${deck.source}]  positions ${res.rows.positions} · tape ${res.rows.tape} · momentum ${res.rows.momentum}`,
      );
      for (const w of warnings) console.log(`      ! ${w}`);
      ok += 1;
    } catch (err) {
      console.error(`  ✗ ${date ?? 'latest'} — ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }
  console.log(`\n${ok}/${dates.length} synced.\n`);
}

main().catch((err) => {
  console.error(`\n[sync] ${(err as Error).message}\n`);
  process.exit(1);
});
