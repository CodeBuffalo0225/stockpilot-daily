// Who runs a trading day: the Mac, or the cloud fallback. Never both.
//
// Each day has one lease record on the `state` branch (lease/<date>.json). A runner
// claims the day by pushing that record with a compare-and-swap (git push
// --force-with-lease against the tip it read), so when both race, exactly one push lands
// and the loser re-reads and backs off. The holder heartbeats while it works.
//
// The cloud is the fallback, not a peer: it only takes a day the Mac never claimed, or
// one whose holder went quiet (a Mac that fell asleep mid-run stops heartbeating). A
// holder that failed while awake keeps the day - the fallback covers a sleeping Mac, not
// a broken pipeline, and a failure is reported rather than papered over by a second run.
//
// This file is the rule only, with no git in it, so the rule can be tested directly.

export type Runner = 'mac' | 'cloud';
export type Phase = 'claimed' | 'reported' | 'published' | 'failed';

export interface Lease {
  date: string;
  runner: Runner;
  phase: Phase;
  claimedAt: string;
  heartbeatAt: string;
  takeoverFrom?: Runner;
  note?: string;
}

// A heartbeat every 4 minutes; 12 quiet minutes means the holder is gone. Long enough
// that a slow git push or a blocking deploy never looks like a dead Mac.
export const HEARTBEAT_MS = 4 * 60_000;
export const STALE_MIN = 12;

export type Decision =
  | { act: 'claim' }
  | { act: 'resume' }
  | { act: 'takeover'; quietMin: number }
  | { act: 'skip'; why: 'published' | 'held' | 'failed' };

export function decide(lease: Lease | null, me: Runner, now: number, staleMin = STALE_MIN): Decision {
  if (!lease) return { act: 'claim' };
  if (lease.phase === 'published') return { act: 'skip', why: 'published' };
  if (lease.phase === 'failed') return { act: 'skip', why: 'failed' };
  if (lease.runner === me) return { act: 'resume' };
  const quietMin = (now - Date.parse(lease.heartbeatAt)) / 60_000;
  return quietMin > staleMin ? { act: 'takeover', quietMin: Math.round(quietMin) } : { act: 'skip', why: 'held' };
}

export function claimed(date: string, me: Runner, now: Date, prior: Lease | null): Lease {
  return {
    date,
    runner: me,
    // A report the quiet holder already wrote is in the snapshot: the new holder
    // publishes it instead of running the pipeline a second time.
    phase: prior?.phase === 'reported' ? 'reported' : 'claimed',
    claimedAt: now.toISOString(),
    heartbeatAt: now.toISOString(),
    ...(prior ? { takeoverFrom: prior.runner } : {}),
  };
}
