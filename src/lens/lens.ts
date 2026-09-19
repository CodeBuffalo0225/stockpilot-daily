/**
 * The investor lens: one shared deck, read through one person's profile.
 *
 * THE BOUNDARY. A lens changes what is emphasised, how it is framed, and what is
 * explained. It never changes a ticker, a verdict, a tier or a position size - every
 * viewer sees the same calls. Choosing securities or sizes per person from a
 * questionnaire is personalised investment advice; publishing the same calls to
 * everyone is not. `buildLens` takes the deck read-only and returns prose about it,
 * and a test pins that it cannot mutate what it was given.
 *
 * GROUNDED BY CONSTRUCTION. No model runs here. Every figure in `points` is read off
 * the deck, and a point whose data is missing is dropped rather than filled - a day
 * with no positions produces fewer sentences, not invented ones. A test checks every
 * number in every point against the numbers the deck actually holds.
 *
 * The keys are a contract with the investor-quiz repo, which links here as
 * `/?lens=<key>&ai=<posture>`. Change a key on one side and the link silently stops
 * applying a lens - both repos pin the list in tests.
 */
import { z } from 'zod';
import type { DailyDeck, DeckPosition, DeckMomentum } from '../spine/schema';

export const LensKey = z.enum([
  'autopilot',
  'compounder',
  'analyst',
  'operator',
  'thrill-seeker',
  'nervous-holder',
  'drifter',
  'rookie',
]);
export type LensKey = z.infer<typeof LensKey>;

export const AiPosture = z.enum([
  'accelerationist',
  'cautious-believer',
  'bear',
  'undecided',
  'unbothered',
]);
export type AiPosture = z.infer<typeof AiPosture>;

/** Rail cards a lens may fold away. Folded, never removed - the data stays one click off. */
export type Foldable = 'momentum' | 'rotation';

export interface LensView {
  key: LensKey;
  ai: AiPosture | null;
  name: string;
  framing: string;
  points: string[];
  caution: string;
  aiNote: string | null;
  fold: Foldable[];
  disclaimer: string;
}

export const SAME_CALLS =
  'Everyone sees the same calls. Your profile changes what is emphasised, not what is recommended. Not investment advice.';

type Param = string | string[] | undefined;
const first = (v: Param) => (Array.isArray(v) ? v[0] : v);

/**
 * URL input gate. An unknown lens yields no lens at all rather than a guessed one; an
 * unknown AI posture just drops the posture note.
 */
export function parseLens(lens: Param, ai: Param): { key: LensKey; ai: AiPosture | null } | null {
  const k = LensKey.safeParse(first(lens));
  if (!k.success) return null;
  const a = AiPosture.safeParse(first(ai));
  return { key: k.data, ai: a.success ? a.data : null };
}

/* ------------------------------------------------------------------ derived */

interface Derived {
  /** Largest position; ties go to the higher-conviction (lower) tier, then alpha. */
  top: DeckPosition | null;
  /** Positions that carry a written exit, in the same order. */
  withStops: DeckPosition[];
  /** Strongest name on the momentum screen. */
  lead: DeckMomentum | null;
}

function derive(d: DailyDeck): Derived {
  const ranked = [...d.allocation].sort(
    (a, b) =>
      b.positionPct - a.positionPct || a.tier - b.tier || (b.alphaScore ?? 0) - (a.alphaScore ?? 0),
  );
  return {
    top: ranked[0] ?? null,
    withStops: ranked.filter((p) => p.stopNote),
    lead: [...d.momentum].sort((a, b) => b.momentumScore - a.momentumScore)[0] ?? null,
  };
}

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const quote = (s: string) => `“${s.trim().replace(/[.\s]+$/, '')}.”`;

/* ------------------------------------------------------------------ lenses */

type Maybe = string | false | null | undefined;

interface LensDef {
  name: string;
  framing: string;
  caution: string;
  fold: Foldable[];
  points: (d: DailyDeck, x: Derived) => Maybe[];
}

const LENSES: Record<LensKey, LensDef> = {
  autopilot: {
    name: 'The Autopilot',
    framing:
      'Nothing on this board asks anything of you. It is what an active process looked at while yours ran on schedule.',
    caution:
      'The risk for your profile is not today’s list. It is the urge to start acting on lists like it.',
    fold: ['momentum', 'rotation'],
    points: (d, { top }) => [
      `Of the names StockPilot scored today, ${d.counts.buy} got a BUY, ${d.counts.watch} a WATCH and ${d.counts.skip} a SKIP.`,
      top && `Its largest position is ${top.ticker}, at ${top.positionPct}% of its book.`,
      d.outcomes && `It graded ${d.outcomes.scored30d} of its own earlier calls at the 30-day mark.`,
    ],
  },

  compounder: {
    name: 'The Compounder',
    framing: 'Read this for the long view. The daily move is the least useful number on the page.',
    caution:
      'A daily feed is built to be acted on. Your edge is that you mostly do not act on it.',
    fold: ['momentum'],
    points: (d, { top }) => [
      top?.timeHorizon && `Its lead position, ${top.ticker}, is set on a ${top.timeHorizon} horizon.`,
      d.outcomes &&
        `${d.outcomes.scored30d} earlier calls reached their 30-day grade today, and ${d.outcomes.scored5d} their 5-day grade.`,
      `${d.rotations.flagged} holdings were flagged for rotation — the pipeline re-checking its own book, not a signal about yours.`,
    ],
  },

  analyst: {
    name: 'The Analyst',
    framing: 'Read the reasoning, then read what it could not verify.',
    caution:
      'Conviction and confirmation feel identical from the inside. Start with the exits, not the entries.',
    fold: [],
    points: (d, { top }) => [
      `${d.unansweredCount} research questions went unanswered today — the pipeline’s own list of what it could not confirm.`,
      top &&
        `${top.ticker} leads at ${top.positionPct}%, tier ${top.tier}${top.alphaScore != null ? `, alpha ${top.alphaScore.toFixed(1)}` : ''}.`,
      top?.stopNote && `What would prove it wrong, in the pipeline’s words: ${quote(top.stopNote)}`,
    ],
  },

  operator: {
    name: 'The Operator',
    framing: 'Fast scan: what is moving, what got sized, and where each exit sits.',
    caution:
      'The screen is a starting list, not an edge. Measure your own activity against the index after costs.',
    fold: [],
    points: (d, { lead }) => [
      lead &&
        `${lead.ticker} tops the momentum screen at ${lead.momentumScore.toFixed(1)}${lead.ret21d != null ? `, ${signed(lead.ret21d)} over 21 days` : ''}.`,
      d.allocation.length > 0 &&
        `Sized today: ${d.allocation.map((p) => `${p.ticker} ${p.positionPct}%`).join(' · ')}.`,
      `${d.rotations.flagged} names flagged for rotation.`,
    ],
  },

  'thrill-seeker': {
    name: 'The Thrill Seeker',
    framing: 'Before the upside: every position here has a written exit. Read those first.',
    caution:
      'A 50% loss needs a 100% gain to get back to even. Position size decides whether a bad call is a lesson or the end of the account.',
    fold: [],
    points: (d, { top, withStops }) => [
      top && `The largest position StockPilot took today is ${top.ticker}, at ${top.positionPct}% of its book.`,
      ...withStops.slice(0, 2).map((p) => `${p.ticker} exit: ${quote(p.stopNote as string)}`),
      `It passed on ${d.counts.skip} of the names it scored. Passing is most of the job.`,
    ],
  },

  'nervous-holder': {
    name: 'The Nervous Holder',
    framing: 'You do not have to do anything with today’s list.',
    caution:
      'Selling into a red day is the most expensive habit in investing. If a drop makes you want to act, that is a sizing question, not a stock question.',
    fold: ['momentum', 'rotation'],
    points: (d, { top }) => [
      `Today: ${d.counts.buy} BUY, ${d.counts.watch} WATCH, ${d.counts.skip} SKIP.` +
        (d.counts.skip > d.counts.buy + d.counts.watch ? ' Most of the list is a pass.' : ''),
      top && `Even its largest position today is ${top.positionPct}% of its book.`,
    ],
  },

  drifter: {
    name: 'The Drifter',
    framing: 'One thing from today’s board worth taking with you.',
    caution:
      'Pick one rule to make automatic this month — a written exit, or a recurring contribution. Either one turns drift into a plan.',
    fold: ['momentum', 'rotation'],
    points: (_d, { top }) => [
      top &&
        `StockPilot’s top call today: ${top.ticker} at ${top.positionPct}%${top.timeHorizon ? `, on a ${top.timeHorizon} horizon` : ''}.`,
      top?.stopNote &&
        `It wrote the exit down before it bought: ${quote(top.stopNote)} That habit is worth more than the ticker.`,
    ],
  },

  rookie: {
    name: 'The Rookie',
    framing: 'How to read this board.',
    caution:
      'Do not judge this stage by returns. Judge it by whether you understand why each call was made.',
    fold: [],
    points: (d, { top, lead, withStops }) => [
      `BUY, WATCH, SKIP: today it was ${d.counts.buy}, ${d.counts.watch} and ${d.counts.skip}.` +
        (d.counts.skip >= d.counts.buy && d.counts.skip >= d.counts.watch
          ? ' SKIP is the most common answer, because most ideas do not make the cut.'
          : ''),
      top &&
        `${top.ticker} is tier ${top.tier} at ${top.positionPct}%. The tier is the pipeline’s conviction; the percent is its share of the book.`,
      lead &&
        `The momentum screen ranks how hard a stock has been moving. Today’s leader is ${lead.ticker}, at ${lead.momentumScore.toFixed(1)}.`,
      withStops[0] &&
        `A stop is the condition for getting out. ${withStops[0].ticker}’s: ${quote(withStops[0].stopNote as string)}`,
    ],
  },
};

/* ------------------------------------------------------------------ AI note */

const AI_NOTES: Record<AiPosture, string> = {
  accelerationist:
    'Today’s list leans on the AI story. You already believe it, so read each call for whether it names a confirmed catalyst or rests on the narrative.',
  'cautious-believer':
    'Today’s list leans on the AI story. Separating the technology from its price is exactly the right lens for these calls.',
  bear: 'Today’s list leans on the AI story. Read the stop conditions — they describe what the pipeline thinks would prove it wrong.',
  undecided:
    'Today’s list leans on the AI story. Notice how many calls rest on the narrative versus a named, confirmed catalyst.',
  unbothered:
    'Today’s list leans on the AI story, whether or not AI is part of how you think about investing.',
};

/** True when the deck's own words mention AI - the note is shown only when it applies. */
function mentionsAI(d: DailyDeck): boolean {
  const text = [d.thesis, ...d.allocation.map((p) => p.entryNote ?? ''), ...d.watches.map((w) => w.note ?? '')].join(' ');
  return /\bAI\b/.test(text);
}

/* ------------------------------------------------------------------ build */

export function buildLens(deck: DailyDeck, key: LensKey, ai: AiPosture | null): LensView {
  const def = LENSES[key];
  const points = def.points(deck, derive(deck)).filter((p): p is string => typeof p === 'string' && p.length > 0);
  return {
    key,
    ai,
    name: def.name,
    framing: def.framing,
    points,
    caution: def.caution,
    aiNote: ai && mentionsAI(deck) ? AI_NOTES[ai] : null,
    fold: def.fold,
    disclaimer: SAME_CALLS,
  };
}
