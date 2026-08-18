// Diagnostic: exercise each source path independently so a failure can be
// attributed to Notion, the local report, or the reconciliation between them.
//
//   npm run check           # today's latest date
//   npm run check 2026-08-17
//
// Notably this proves the Notion-only path still produces a renderable deck,
// which is the path that runs on a machine without the pipeline checked out.

import * as dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({
  path: join(
    process.env.STOCKPILOT_DIR ?? join(process.env.HOME ?? '', 'Documents', 'stockpilot'),
    '.env',
  ),
});
dotenv.config({ path: join(projectRoot, '.env'), override: true });

import { buildDeck } from '../src/spine/build-deck';
import { listLocalDates, loadLocalReport, loadNotionReport } from '../src/spine/sources';
import { DailyDeck } from '../src/spine/schema';

const line = (s: string) => console.log(s);

async function main() {
  const date = process.argv[2] ?? (await listLocalDates())[0];
  if (!date) throw new Error('No date given and no local reports found.');
  line(`\nchecking ${date}\n${'─'.repeat(46)}`);

  const [local, notion] = await Promise.all([loadLocalReport(date), loadNotionReport(date)]);

  line(`local report : ${local ? 'ok' : 'MISSING'}`);
  if (local) {
    line(
      `               scored ${local.scored?.length ?? 0} · allocation ${local.allocation?.length ?? 0} · momentum ${local.momentum?.ranked?.length ?? 0}`,
    );
  }
  line(`notion row   : ${notion ? 'ok' : 'MISSING'}`);
  if (notion) {
    line(
      `               buys ${notion.buys.length} · watches ${notion.watches.length} · skips ${notion.skips.length} · toon rows ${notion.allocationMeta.size}`,
    );
  }

  const cases: Array<[string, typeof local, typeof notion]> = [
    ['merged      ', local, notion],
    ['local only  ', local, null],
    ['notion only ', null, notion],
  ];

  line('');
  for (const [label, l, n] of cases) {
    if (!l && !n) {
      line(`${label} : skipped (source unavailable)`);
      continue;
    }
    try {
      const { deck, warnings } = buildDeck({ date, local: l, notion: n });
      DailyDeck.parse(deck); // re-validate the built record, not just the inputs
      line(
        `${label} : ok  [${deck.source}] buy ${deck.counts.buy} watch ${deck.counts.watch} skip ${deck.counts.skip} · alloc ${deck.allocation.length} · momentum ${deck.momentum.length} · tape ${deck.tape.length}`,
      );
      for (const w of warnings) line(`               ! ${w}`);
    } catch (err) {
      line(`${label} : FAILED — ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }
  line('');
}

main().catch((err) => {
  console.error(`\n[check] ${(err as Error).message}\n`);
  process.exit(1);
});
