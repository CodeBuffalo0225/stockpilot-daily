// One-time: put the Mac's pipeline (code + database + state + reports) and the board's
// decks on the `state` branch, so the cloud fallback has something to run from.
//
//   npm run state:seed            # refuses if a snapshot already exists
//   npm run state:show            # print the manifest and today's lease
//
// After the seed, every Mac pipeline run refreshes the snapshot itself.
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StateBranch, type Manifest } from '../src/ops/state-branch';
import { nyDate } from '../src/spine/market-calendar';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PIPELINE_DIR = process.env.STOCKPILOT_DIR ?? join(process.env.HOME ?? '', 'Documents', 'stockpilot');
const sb = new StateBranch(root);
const today = nyDate();

if (process.argv.includes('--show')) {
  sb.refresh();
  console.log(JSON.stringify({ tip: sb.tip, manifest: sb.manifest(), lease: sb.lease(today) }, null, 2));
  process.exit(0);
}

const generation = sb.transact('seed from mac', () => {
  const existing = sb.manifest();
  if (existing) {
    console.error(`state branch already seeded (generation ${existing.generation}, by ${existing.writer}); not overwriting`);
    process.exit(1);
  }
  sb.putPipelineCode(PIPELINE_DIR);
  sb.putPipelineState(PIPELINE_DIR);
  sb.putDecks(join(root, 'data', 'decks'));
  sb.write('manifest.json', { generation: 1, writer: 'mac', date: today, updatedAt: new Date().toISOString() } satisfies Manifest);
  return { write: true, value: 1 };
});
writeFileSync(join(root, '.state-gen'), String(generation));
console.log(`seeded state branch at ${sb.tip} (generation ${generation})`);
