// The `state` branch: the one place both runners read and write, so a day run in the
// cloud continues exactly where the Mac left off and vice versa.
//
//   lease/<date>.json        who holds each trading day (src/ops/lease.ts)
//   manifest.json            generation counter + last writer of the snapshot
//   pipeline/                the pipeline's tracked files as the Mac last ran them, plus
//                            its state: data/stockpilot.db, suppression-state, watchlist,
//                            candidate pool, recent reports/
//   decks/                   every deck the board has published (its history)
//   vercel.json              turns off Vercel git deploys for this branch
//
// Every write is a new parentless commit pushed with --force-with-lease against the tip
// that was read, so the branch never accumulates copies of the database, and a write
// based on a stale read is rejected instead of silently winning. It is checked out as a
// git worktree in .state/ so it shares the repo's auth - keychain on the Mac, the
// workflow token in the cloud. .state/ is gitignored and vercelignored.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { claimed, decide, type Decision, type Lease, type Phase, type Runner } from './lease';

export const BRANCH = 'state';

// The pipeline's mutable state. Everything else in pipeline/ is code.
export const PIPELINE_STATE_FILES = [
  'data/stockpilot.db',
  'data/stockpilot.db-wal',
  'data/suppression-state.json',
  'data/watchlist.json',
  'data/candidate-pool.json',
];
const KEEP_REPORTS = 30;

export interface Manifest {
  generation: number;
  writer: Runner;
  date: string;
  updatedAt: string;
}

export class StateUnreachable extends Error {}

function git(cwd: string, args: string[]) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function copy(from: string, to: string) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

export class StateBranch {
  readonly dir: string;
  tip = ''; // origin/state as last read; '' when the branch does not exist yet

  constructor(readonly root: string) {
    this.dir = join(root, '.state');
  }

  // Re-read the branch and reset the worktree to it. Called before every decision, so
  // nothing is ever decided on a stale copy.
  refresh(): void {
    const f = git(this.root, ['fetch', '--quiet', 'origin', `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`]);
    const missing = f.code !== 0 && /couldn't find remote ref/i.test(f.out);
    if (f.code !== 0 && !missing) throw new StateUnreachable(`state fetch failed: ${f.out.trim().slice(-300)}`);
    this.tip = missing ? '' : git(this.root, ['rev-parse', `refs/remotes/origin/${BRANCH}`]).out.trim();

    if (!existsSync(join(this.dir, '.git'))) {
      git(this.root, ['worktree', 'prune']);
      const add = git(this.root, ['worktree', 'add', '--quiet', '--detach', '.state', this.tip || 'HEAD']);
      if (add.code !== 0) throw new Error(`state worktree: ${add.out.trim()}`);
    }
    if (this.tip) {
      git(this.dir, ['checkout', '--quiet', '--detach', '--force', this.tip]);
    } else {
      // First write ever: start from an empty tree, not from a copy of main.
      git(this.dir, ['read-tree', '--empty']);
    }
    git(this.dir, ['clean', '-fdxq']);
  }

  read<T>(rel: string): T | null {
    const p = join(this.dir, rel);
    return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : null;
  }

  write(rel: string, data: unknown): void {
    mkdirSync(dirname(join(this.dir, rel)), { recursive: true });
    writeFileSync(join(this.dir, rel), `${JSON.stringify(data, null, 2)}\n`);
  }

  // Compare-and-swap. false = someone else moved the branch since refresh(); re-read.
  commit(message: string): boolean {
    this.write('vercel.json', { git: { deploymentEnabled: false } });
    git(this.dir, ['add', '-A']);
    const tree = git(this.dir, ['write-tree']).out.trim();
    const sha = git(this.dir, ['commit-tree', tree, '-m', message]).out.trim();
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`state commit failed: ${sha}`);
    const push = git(this.dir, [
      'push', '--quiet', `--force-with-lease=refs/heads/${BRANCH}:${this.tip}`, 'origin', `${sha}:refs/heads/${BRANCH}`,
    ]);
    if (push.code === 0) {
      this.tip = sha;
      git(this.root, ['update-ref', `refs/remotes/origin/${BRANCH}`, sha]);
      return true;
    }
    if (/stale info|rejected|fetch first|non-fast-forward/i.test(push.out)) return false;
    throw new StateUnreachable(`state push failed: ${push.out.trim().slice(-300)}`);
  }

  // Refresh, apply, push; repeat when another runner wrote in between. `apply` returns
  // false to stop without writing.
  transact<T>(message: string, apply: () => { write: boolean; value: T }): T {
    for (let i = 0; i < 6; i++) {
      this.refresh();
      const { write, value } = apply();
      if (!write || this.commit(message)) return value;
    }
    throw new StateUnreachable('state branch kept moving; gave up after 6 attempts');
  }

  lease(date: string): Lease | null {
    return this.read<Lease>(`lease/${date}.json`);
  }

  manifest(): Manifest | null {
    return this.read<Manifest>('manifest.json');
  }

  // --- lease operations ------------------------------------------------------------

  acquire(date: string, me: Runner): { ok: boolean; decision: Decision; lease: Lease | null } {
    return this.transact(`${date}: ${me} claims`, () => {
      const prior = this.lease(date);
      const decision = decide(prior, me, Date.now());
      if (decision.act === 'skip') return { write: false, value: { ok: false, decision, lease: prior } };
      const next =
        decision.act === 'resume'
          ? { ...prior!, heartbeatAt: new Date().toISOString() }
          : claimed(date, me, new Date(), decision.act === 'takeover' ? prior : null);
      this.write(`lease/${date}.json`, next);
      return { write: true, value: { ok: true, decision, lease: next } };
    });
  }

  // true while the day is still ours. Also the check before anything with a side effect.
  heartbeat(date: string, me: Runner): boolean {
    return this.transact(`${date}: ${me} heartbeat`, () => {
      const l = this.lease(date);
      if (!l || l.runner !== me || l.phase === 'published' || l.phase === 'failed') {
        return { write: false, value: false };
      }
      this.write(`lease/${date}.json`, { ...l, heartbeatAt: new Date().toISOString() });
      return { write: true, value: true };
    });
  }

  // Move our lease to `phase`, writing any snapshot files in the same commit. false when
  // the day is no longer ours - the caller must not act as if it were.
  advance(date: string, me: Runner, phase: Phase, snapshot?: () => void, note?: string): boolean {
    return this.transact(`${date}: ${me} ${phase}`, () => {
      const l = this.lease(date);
      if (!l || l.runner !== me) return { write: false, value: false };
      this.write(`lease/${date}.json`, {
        ...l,
        phase,
        heartbeatAt: new Date().toISOString(),
        ...(note ? { note } : {}),
      });
      if (snapshot) {
        snapshot();
        const m = this.manifest();
        this.write('manifest.json', {
          generation: (m?.generation ?? 0) + 1,
          writer: me,
          date,
          updatedAt: new Date().toISOString(),
        } satisfies Manifest);
      }
      return { write: true, value: true };
    });
  }

  // --- snapshot contents (call inside advance's snapshot callback) -----------------

  // The Mac also sends its pipeline code (tracked files, working-tree versions), so the
  // cloud runs exactly what the Mac runs rather than whatever was last pushed to GitHub.
  putPipelineCode(pipelineDir: string): void {
    const files = git(pipelineDir, ['ls-files', '-z']).out.split('\0').filter(Boolean);
    for (const f of files) {
      if (PIPELINE_STATE_FILES.includes(f) || f.startsWith('reports/')) continue;
      const src = join(pipelineDir, f);
      if (existsSync(src)) copy(src, join(this.dir, 'pipeline', f));
    }
  }

  putPipelineState(pipelineDir: string): void {
    for (const f of PIPELINE_STATE_FILES) {
      const src = join(pipelineDir, f);
      if (existsSync(src)) copy(src, join(this.dir, 'pipeline', f));
    }
    const reports = listJson(join(pipelineDir, 'reports')).slice(-KEEP_REPORTS);
    for (const r of reports) copy(join(pipelineDir, 'reports', r), join(this.dir, 'pipeline', 'reports', r));
  }

  putDecks(decksDir: string): void {
    for (const d of listJson(decksDir)) copy(join(decksDir, d), join(this.dir, 'decks', d));
  }
}

export function listJson(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
}

export { copy };
