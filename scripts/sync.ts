// Pull a deck through the spine and persist it.
//
//   npm run sync              # latest date
//   npm run sync 2026-08-17
//   npm run sync -- --backfill 20   # last N local report dates
//   npm run sync -- --local ...     # data/decks/ only, database untouched
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

// --local skips the database and mirrors to data/decks/ only. The local Supabase
// stack needs Docker; when it is down, a configured-but-unreachable URL makes every
// write fail. The dashboard reads data/decks/ whenever SUPABASE_URL is unset, so this
// is enough to bring a new day in. Safe here because the store reads the environment
// lazily on each call rather than at import time.
if (process.argv.includes('--local')) {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

import { fetchDeck } from '../src/spine/fetch-deck';
import { pushDeck } from '../src/spine/push-deck';
import { listLocalDates } from '../src/spine/sources';
import { describeStore } from '../src/spine/store';

async function main() {
  const argv = process.argv.slice(2);
  const publishing = argv.includes('--publish');
  if (publishing) {
    const url = new URL(process.env.SUPABASE_URL || 'http://localhost');
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Live publishing requires a hosted Supabase URL and server key. Local-only sync is not a successful publish.');
    }
  }
  const backfillAt = argv.indexOf('--backfill');
  const store = describeStore();
  console.log(`\nstore: ${store.label} (${store.detail})\n`);

  let dates: Array<string | undefined>;
  if (backfillAt >= 0) {
    const n = Number(argv[backfillAt + 1] ?? 10);
    dates = (await listLocalDates()).slice(0, n);
    console.log(`backfilling ${dates.length} dates\n`);
  } else {
    dates = publishing
      ? (await listLocalDates()).slice(0, 3)
      : [argv.find((a) => !a.startsWith('--'))];
  }

  if (!dates.length) throw new Error('No local pipeline reports found to publish.');

  let ok = 0;
  for (const date of dates) {
    try {
      const { deck, warnings } = await fetchDeck(date);
      if (publishing && !['local', 'local+notion'].includes(deck.source)) {
        throw new Error('The complete local report is unavailable; refusing a partial live update.');
      }
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
