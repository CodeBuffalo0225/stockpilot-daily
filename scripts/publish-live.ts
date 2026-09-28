// Weekday publish: turn the pipeline's report for a day into the live board.
//
//   npm run publish:live                      # today's report; waits up to 30 min for it
//   npm run publish:live -- --date 2026-09-23 --wait-min 0
//   npm run publish:live -- --dry-run         # every gate, no deploy
//   npm run publish:live -- --wait-min 75 --not-before 08:00   # the weekday task's form
//
// Runs on the pipeline machine, because the reports only exist there (see AGENTS.md).
// The site reads the decks baked into its deployment, so the deploy IS the publish.
//
// Every rule that decides whether something reaches the public site lives here, in code,
// not in the scheduled task's prompt - a prompt can be skimmed; an exit code cannot:
//
//   2  no report for the date, after waiting for the pipeline to write it
//   3  the deck would not build from the complete local report (partial data is not
//      published - a board missing half its day is worse than yesterday's board)
//   4  the working tree has uncommitted changes. A CLI deploy uploads the working tree,
//      so anyone's half-finished edit would ship with the data. Refuse, and say which.
//   5  tests failed
//   6  the deploy failed
//   7  deployed, but the live site never showed the new date. A deploy nobody confirmed
//      is not a publish - 2026-09-22 had a Ready deploy serving 404s on every route.
//   0  published and confirmed live, or it was already live, or the market is closed
//      that day (weekend / NYSE holiday - the pipeline has nothing to say about a day
//      nobody can trade, so there is nothing to wait for)
//
// The board is meant to be live before the 9:30 ET open. Every publish records
// `beforeOpen`, so a late morning shows up in the log instead of passing as a success.
//
// One JSON line per run is appended to data/publish-log.jsonl, so a missed day can be
// read off the machine rather than reconstructed.
import { spawnSync } from 'node:child_process';
import { readFile, appendFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { marketClosedReason, nyDate, nyMinutes } from '../src/spine/market-calendar';
import { HEARTBEAT_MS, type Runner } from '../src/ops/lease';
import { StateBranch, listJson, copy } from '../src/ops/state-branch';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PIPELINE_DIR = process.env.STOCKPILOT_DIR ?? join(process.env.HOME ?? '', 'Documents', 'stockpilot');
const LIVE_URL = process.env.LIVE_URL ?? 'https://stockpilotdaily.vercel.app';
// Tracked by accident and rewritten by every `tsc`. It changes nothing the site serves.
const IGNORABLE_DIRT = new Set(['tsconfig.tsbuildinfo']);

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const dryRun = argv.includes('--dry-run');
const date = flag('--date') ?? nyDate();
const waitMin = Number(flag('--wait-min') ?? 30);
// --not-before 08:00 holds the deploy until that New York time. The weekday task starts
// earlier, under caffeinate, so one scheduled wake keeps the Mac up through the pipeline
// and the publish; this is what keeps the board from going out before the 8-9 am window.
const notBefore = flag('--not-before');
// --runner mac|cloud publishes under the day's lease (see scripts/pipeline-run.ts): only
// the runner holding the day deploys, and it steps aside the moment it no longer does.
// Without --runner (a manual publish) the lease is not consulted.
const runner = flag('--runner') as Runner | undefined;
const sb = runner ? new StateBranch(root) : null;
let holding = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const exists = (p: string) => access(p).then(() => true, () => false);

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', env: process.env });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

async function finish(code: number, result: string, extra: Record<string, unknown> = {}) {
  const line = { at: new Date().toISOString(), date, result, code, dryRun, ...(runner ? { runner } : {}), ...extra };
  // A holder that failed keeps the day, marked failed: the fallback covers a sleeping Mac,
  // it does not re-run a publish that broke while the Mac was awake.
  if (sb && holding && code !== 0 && !dryRun) {
    try {
      sb.advance(date, runner!, 'failed', undefined, `publish ${result}`);
    } catch {
      /* the failure itself is what gets reported */
    }
  }
  await appendFile(join(root, 'data', 'publish-log.jsonl'), `${JSON.stringify(line)}\n`).catch(() => {});
  console.log(`\nPUBLISH ${JSON.stringify(line)}`);
  process.exit(code);
}

async function liveShows(d: string): Promise<boolean> {
  try {
    const r = await fetch(`${LIVE_URL}/?_=${Date.now()}`, { cache: 'no-store' });
    const html = await r.text();
    // The date only exists on the page once a deployment carrying that deck is serving:
    // the date chip and the day picker are both built from the decks in the deployment.
    return r.ok && html.includes(d) && !/No decks yet|Store error/.test(html);
  } catch {
    return false;
  }
}

const OPEN_MIN = 9 * 60 + 30;

// The CLI's login is an OAuth token that expires every few hours and refreshes on use.
// On 2026-09-24 the unattended run hit it mid-refresh and the deploy died "Not authorized"
// (auth.json was rewritten the same minute). So touch the API first, and if a deploy
// still fails on auth, refresh once more and retry - once, not in a loop.
const AUTH_FAILURE = /Not authorized|token.*(expired|invalid)|Please log in|vercel login/i;
// In the cloud there is no login: VERCEL_TOKEN (a repo secret) is passed explicitly, and
// VERCEL_ORG_ID / VERCEL_PROJECT_ID in the workflow stand in for .vercel/project.json.
const tokenArgs = process.env.VERCEL_TOKEN ? ['--token', process.env.VERCEL_TOKEN] : [];
function deploy() {
  run('npx', ['--yes', 'vercel', 'whoami', ...tokenArgs]);
  let dep = run('npx', ['--yes', 'vercel', '--prod', '--yes', ...tokenArgs]);
  if (dep.code !== 0 && AUTH_FAILURE.test(dep.out)) {
    console.log('deploy failed on auth; refreshing the login and retrying once');
    run('npx', ['--yes', 'vercel', 'whoami', ...tokenArgs]);
    dep = run('npx', ['--yes', 'vercel', '--prod', '--yes', ...tokenArgs]);
  }
  return dep;
}

async function main() {
  // Gate 0: a day the market is closed has no board to publish.
  const closed = marketClosedReason(date);
  if (closed) return finish(0, 'market_closed', { reason: closed });

  // Gate L: publish only a day this runner holds, once its pipeline has reported.
  if (sb) {
    const until = Date.now() + waitMin * 60_000;
    for (;;) {
      sb.refresh();
      const l = sb.lease(date);
      if (l?.phase === 'published') return finish(0, 'already_live', { holder: l.runner });
      if (l && l.runner !== runner) return finish(0, 'other_runner', { holder: l.runner, phase: l.phase });
      if (l?.phase === 'failed') return finish(3, 'pipeline_failed', { note: l.note });
      if (l?.phase === 'reported') break;
      if (Date.now() >= until) return finish(2, 'no_report', { lease: l?.phase ?? 'unclaimed' });
      console.log(`waiting for the ${runner} pipeline to report ${date} (lease: ${l?.phase ?? 'unclaimed'}) ...`);
      await sleep(30_000);
    }
    holding = true;
    // Decks the other runner published that this machine lacks: the board is deployed
    // with its whole history, whichever runner deploys it.
    for (const d of listJson(join(sb.dir, 'decks'))) {
      const local = join(root, 'data', 'decks', d);
      if (!existsSync(local)) copy(join(sb.dir, 'decks', d), local);
    }
  }

  // Gate 1: the pipeline's report for the day. The weekday task fires after the pipeline
  // task, but if the Mac was asleep both fire on wake in no promised order - so wait for
  // the report rather than failing a race.
  const report = join(PIPELINE_DIR, 'reports', `${date}.json`);
  const deadline = Date.now() + waitMin * 60_000;
  while (!(await exists(report))) {
    if (Date.now() >= deadline) return finish(2, 'no_report', { report });
    console.log(`waiting for ${report} ...`);
    await sleep(30_000);
  }

  if (await liveShows(date)) {
    // Close the day, or a quiet 'reported' lease would invite the other runner to redo it.
    if (sb && !dryRun) sb.advance(date, runner!, 'published', () => sb.putDecks(join(root, 'data', 'decks')), 'already live');
    return finish(0, 'already_live', { url: LIVE_URL });
  }

  // Gate 2: build the deck from the complete local report. Also bring in any report
  // from the last week that never became a deck - a missed day heals on the next run.
  const recent = (await (await import('../src/spine/sources')).listLocalDates(PIPELINE_DIR)).slice(0, 7);
  const backfilled: string[] = [];
  for (const d of recent) {
    if (d === date || (await exists(join(root, 'data', 'decks', `${d}.json`)))) continue;
    if (run('npm', ['run', 'sync', '--', '--local', d]).code === 0) backfilled.push(d);
  }
  const sync = run('npm', ['run', 'sync', '--', '--local', date]);
  const deckPath = join(root, 'data', 'decks', `${date}.json`);
  if (sync.code !== 0 || !(await exists(deckPath))) {
    return finish(3, 'sync_failed', { tail: sync.out.slice(-600) });
  }
  const deck = JSON.parse(await readFile(deckPath, 'utf8'));
  if (!['local', 'local+notion'].includes(deck.source)) {
    return finish(3, 'partial_deck', { source: deck.source });
  }

  // Gate 3: nothing uncommitted rides along with the data.
  const dirty = run('git', ['status', '--porcelain'])
    .out.split('\n')
    .map((l) => l.slice(3).trim())
    .filter((p) => p && !IGNORABLE_DIRT.has(p));
  if (dirty.length) return finish(4, 'dirty_tree', { dirty });

  // Gate 4: the tests that pin grounding, the lens contract and the book answer.
  const tests = run('npm', ['test']);
  if (tests.code !== 0) return finish(5, 'tests_failed', { tail: tests.out.slice(-600) });

  if (dryRun) return finish(0, 'dry_run_ok', { backfilled, positions: deck.allocation?.length ?? 0 });

  if (notBefore) {
    const [h, m] = notBefore.split(':').map(Number);
    let lastBeat = 0;
    while (nyMinutes() < h * 60 + m) {
      if (sb && Date.now() - lastBeat >= HEARTBEAT_MS) {
        if (!sb.heartbeat(date, runner!)) return finish(0, 'other_runner', { during: 'hold' });
        lastBeat = Date.now();
      }
      console.log(`holding until ${notBefore} New York time ...`);
      await sleep(30_000);
    }
  }

  // Last check before the one step with a public effect.
  if (sb && !sb.heartbeat(date, runner!)) {
    holding = false;
    return finish(0, 'other_runner', { during: 'pre-deploy' });
  }

  // Gate 5: deploy, then confirm the public site actually serves the day.
  const dep = deploy();
  const deployUrl = dep.out.match(/https:\/\/stockpilotdaily-[a-z0-9]+-[a-z0-9-]+\.vercel\.app/)?.[0] ?? null;
  if (dep.code !== 0) return finish(6, 'deploy_failed', { deployUrl, tail: dep.out.slice(-600) });

  for (let i = 0; i < 12; i++) {
    if (await liveShows(date)) {
      if (sb) {
        sb.advance(date, runner!, 'published', () => sb.putDecks(join(root, 'data', 'decks')), deployUrl ?? undefined);
      }
      return finish(0, 'published', {
        url: LIVE_URL,
        deployUrl,
        backfilled,
        positions: deck.allocation?.length ?? 0,
        beforeOpen: nyMinutes() < OPEN_MIN,
      });
    }
    await sleep(10_000);
  }
  return finish(7, 'not_confirmed_live', { url: LIVE_URL, deployUrl });
}

main().catch((err) => finish(1, 'crashed', { error: (err as Error).message }));
