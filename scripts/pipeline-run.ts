// Run the StockPilot pipeline for today, under the day's lease, so the Mac and the cloud
// fallback never both run it.
//
//   npm run pipeline -- --runner mac             # the weekday 7:15 task on the Mac
//   npm run pipeline -- --runner cloud           # the GitHub Actions fallback
//   npm run pipeline -- --runner cloud --check   # decide only; claims nothing
//
// Last line: PIPELINE {json}. Exit codes:
//   0  ran, or nothing to do: market_closed, outside_window, held (the other runner has
//      the day), published, report_ready (took over a day whose report already exists)
//   2  needs_key - the cloud is missing a secret it must have. Checked BEFORE claiming,
//      so a runner that cannot run never takes the day from one that can.
//   3  pipeline_failed - the lease is marked failed, so the fallback does not re-run it
//   4  lost_lease - another runner took the day while this one was asleep; this run was
//      stopped and killed on wake, and wrote nothing
//   5  state_unreachable - could not read or write the state branch
//   1  crashed
//
// Sleep: a Mac that sleeps mid-run stops heartbeating, and after 12 quiet minutes the
// cloud may take the day. On wake, the wall clock jumps; the tick below sees the jump,
// SIGSTOPs the pipeline before anything else, asks the state branch whose day it is,
// and only then resumes or kills it.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HEARTBEAT_MS, decide, type Runner } from '../src/ops/lease';
import { StateBranch, StateUnreachable, PIPELINE_STATE_FILES, listJson, copy } from '../src/ops/state-branch';
import { marketClosedReason, nyDate, nyMinutes, hhmm } from '../src/spine/market-calendar';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const runner = flag('--runner') as Runner;
if (runner !== 'mac' && runner !== 'cloud') {
  console.error('usage: npm run pipeline -- --runner mac|cloud [--check] [--date YYYY-MM-DD] [--ignore-window]');
  process.exit(1);
}
const date = flag('--date') ?? nyDate();
const checkOnly = argv.includes('--check');
// The cloud acts inside the pre-market window only; its crons fire in both EDT and EST,
// and the out-of-season one lands outside this window and exits.
const CLOUD_WINDOW = [hhmm('07:35'), hhmm('09:00')];
const CLOUD_NEEDS = ['ANTHROPIC_API_KEY', 'VERCEL_TOKEN'];

// The cloud's pipeline dir is always .pipeline/ in this repo, never STOCKPILOT_DIR:
// materializing it starts by emptying it, and that must never reach the Mac's real one.
const PIPELINE_DIR =
  runner === 'cloud'
    ? join(root, '.pipeline')
    : (process.env.STOCKPILOT_DIR ?? join(process.env.HOME ?? '', 'Documents', 'stockpilot'));
const MARKER = join(root, '.state-gen'); // snapshot generation this Mac last wrote or restored

const sb = new StateBranch(root);
let holding = false;

function finish(code: number, result: string, extra: Record<string, unknown> = {}): never {
  const line = { at: new Date().toISOString(), date, runner, result, code, ...extra };
  console.log(`\nPIPELINE ${JSON.stringify(line)}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `owned=${code === 0 && holding ? 'true' : 'false'}\nresult=${result}\n`);
  }
  process.exit(code);
}

const sleepSync = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// The cloud wrote the last snapshot: bring its database, state files and reports onto
// the Mac before running, so today builds on yesterday. The Mac's own files are moved
// aside, not deleted - and the SQLite -wal/-shm go with the database, because a stale
// write-ahead log replayed onto a different database corrupts it.
function restoreOntoMac(): string[] {
  const m = sb.manifest();
  const seen = existsSync(MARKER) ? Number(readFileSync(MARKER, 'utf8')) : 0;
  if (!m || m.writer !== 'cloud' || m.generation <= seen) return [];
  const backup = join(root, '.state-backups', `${date}-gen${seen}`);
  const restored: string[] = [];
  for (const f of [...PIPELINE_STATE_FILES, 'data/stockpilot.db-shm']) {
    const local = join(PIPELINE_DIR, f);
    if (existsSync(local)) {
      mkdirSync(dirname(join(backup, f)), { recursive: true });
      renameSync(local, join(backup, f));
    }
    const snap = join(sb.dir, 'pipeline', f);
    if (existsSync(snap)) {
      copy(snap, local);
      restored.push(f);
    }
  }
  for (const r of listJson(join(sb.dir, 'pipeline', 'reports'))) {
    const local = join(PIPELINE_DIR, 'reports', r);
    if (!existsSync(local)) {
      copy(join(sb.dir, 'pipeline', 'reports', r), local);
      restored.push(`reports/${r}`);
    }
  }
  writeFileSync(MARKER, String(m.generation));
  return restored;
}

// The cloud has no pipeline checkout: it runs the snapshot the Mac last sent.
function materializeInCloud(install: boolean) {
  if (!existsSync(join(sb.dir, 'pipeline', 'package.json'))) {
    finish(5, 'state_unreachable', { error: 'state branch has no pipeline snapshot yet - run npm run state:seed on the Mac' });
  }
  rmSync(PIPELINE_DIR, { recursive: true, force: true });
  cpSync(join(sb.dir, 'pipeline'), PIPELINE_DIR, { recursive: true });
  if (!install) return;
  for (const [cmd, args] of [
    ['npm', ['ci', '--no-audit', '--no-fund']],
    ['npx', ['--yes', 'playwright', 'install', '--with-deps', 'chromium']],
  ] as const) {
    const r = spawnSync(cmd, [...args], { cwd: PIPELINE_DIR, stdio: 'inherit' });
    if (r.status !== 0) finish(1, 'crashed', { error: `${cmd} ${args.join(' ')} failed in the cloud pipeline dir` });
  }
}

function beat(): boolean | null {
  for (let i = 0; i < 3; i++) {
    try {
      return sb.heartbeat(date, runner);
    } catch {
      sleepSync(20_000); // network still coming up after wake
    }
  }
  return null;
}

async function runGuarded(): Promise<{ code: number; lost: boolean }> {
  // Own process group, so SIGSTOP/SIGKILL reach npm, ts-node and Playwright's browser.
  const child = spawn('npm', ['run', 'run-now'], { cwd: PIPELINE_DIR, stdio: 'inherit', detached: true });
  const group = -(child.pid as number);
  let last = Date.now();
  let lastBeat = Date.now();
  let lost = false;
  const tick = setInterval(() => {
    const now = Date.now();
    const slept = now - last > 30_000;
    last = now;
    if (!slept && now - lastBeat < HEARTBEAT_MS) return;
    if (slept) process.kill(group, 'SIGSTOP');
    const mine = beat();
    lastBeat = Date.now();
    last = Date.now();
    if (mine === false || (mine === null && slept)) {
      lost = true;
      process.kill(group, 'SIGKILL');
    } else if (slept) {
      process.kill(group, 'SIGCONT');
    }
  }, 1000);
  const code = await new Promise<number>((r) => child.on('exit', (c) => r(c ?? 1)));
  clearInterval(tick);
  return { code, lost };
}

async function main() {
  const closed = marketClosedReason(date);
  if (closed) finish(0, 'market_closed', { reason: closed });

  if (runner === 'cloud' && !argv.includes('--ignore-window')) {
    const t = nyMinutes();
    if (t < CLOUD_WINDOW[0] || t > CLOUD_WINDOW[1]) finish(0, 'outside_window', { nyMinutes: t });
  }

  if (checkOnly) {
    sb.refresh();
    const lease = sb.lease(date);
    finish(0, 'check', { decision: decide(lease, runner, Date.now()), lease, manifest: sb.manifest() });
  }

  if (runner === 'cloud') {
    const missing = CLOUD_NEEDS.filter((k) => !process.env[k]);
    if (missing.length) finish(2, 'needs_key', { missing });
  }

  const got = sb.acquire(date, runner);
  if (!got.ok) {
    const why = got.decision.act === 'skip' ? got.decision.why : 'held';
    finish(0, why, { holder: got.lease?.runner, phase: got.lease?.phase });
  }
  holding = true;
  const via = got.decision.act === 'takeover' ? { takeoverFrom: got.lease?.takeoverFrom, quietMin: got.decision.quietMin } : {};

  if (got.lease?.phase === 'reported') {
    // Took over (or resumed) a day whose report is already in the snapshot.
    if (runner === 'cloud') materializeInCloud(false);
    else restoreOntoMac();
    finish(0, 'report_ready', via);
  }

  const restored = runner === 'mac' ? restoreOntoMac() : (materializeInCloud(true), []);

  const { code, lost } = await runGuarded();
  if (lost) finish(4, 'lost_lease', via);

  const report = join(PIPELINE_DIR, 'reports', `${date}.json`);
  if (code !== 0 || !existsSync(report)) {
    sb.advance(date, runner, 'failed', undefined, `pipeline exit ${code}${existsSync(report) ? '' : ', no report'}`);
    finish(3, 'pipeline_failed', { exit: code });
  }

  const stillMine = sb.advance(date, runner, 'reported', () => {
    if (runner === 'mac') sb.putPipelineCode(PIPELINE_DIR);
    sb.putPipelineState(PIPELINE_DIR);
  });
  if (!stillMine) finish(4, 'lost_lease', via);
  if (runner === 'mac') writeFileSync(MARKER, String(sb.manifest()?.generation ?? 0));
  finish(0, 'ran', { ...via, restored });
}

main().catch((err) =>
  finish(err instanceof StateUnreachable ? 5 : 1, err instanceof StateUnreachable ? 'state_unreachable' : 'crashed', {
    error: (err as Error).message,
  }),
);
