/**
 * The grounding gate: every figure shown to a reader must be traceable to the deck.
 *
 * "The model routes, the engine computes." A model may phrase an answer, but it may
 * not produce an arithmetic result, and it may not round, scale or invent one. This
 * checks the finished text: pull every number out of it, and require each to match a
 * number the deck actually holds. A reply with one untraceable figure is discarded
 * WHOLE - never patched - because a sentence with a wrong number in it is not
 * repairable by deleting the number, and the rest of it is no longer trustworthy.
 *
 * Also used by the lens tests, which check the same property for lens copy.
 */
import type { DailyDeck } from '../spine/schema';

/** Every number the deck holds: numeric fields, numbers inside its text, array lengths. */
export function deckNumbers(deck: DailyDeck): number[] {
  const out: number[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'number') out.push(v);
    else if (typeof v === 'string') for (const m of v.matchAll(/-?\d+(?:\.\d+)?/g)) out.push(Number(m[0]));
    else if (Array.isArray(v)) {
      out.push(v.length);
      v.forEach(walk);
    } else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(deck);
  return out;
}

export interface Figure {
  raw: string;
  value: number;
  /** Decimal places shown, which sets how much rounding slack a match gets. */
  dp: number;
}

/**
 * Figures stated in a line. Window labels ("30-day", "21 days") name what a field
 * measures rather than asserting a value, so they are stripped before the scan; so are
 * calendar dates, which are the deck's own identity rather than a figure about it.
 */
export function figuresIn(line: string): Figure[] {
  const stripped = line
    .replace(/\d{4}-\d{2}-\d{2}/g, '')
    .replace(/\b\d+(?:-day| days|-week| weeks|-month| months)\b/g, '');
  return [...stripped.matchAll(/[-+]?\d+(?:\.(\d+))?/g)].map((m) => ({
    raw: m[0],
    value: Number(m[0]),
    dp: m[1]?.length ?? 0,
  }));
}

/** True when some deck number rounds to the figure as shown. */
export function traceable(f: Figure, nums: number[]): boolean {
  return nums.some((x) => Math.abs(x - f.value) <= 0.5 * 10 ** -f.dp + 1e-9);
}

/**
 * What a figure is claiming, read from the words immediately after it.
 *
 * WHY THIS EXISTS. Matching a figure against every number anywhere in the deck gets
 * weaker the richer the deck is, and it fails on exactly the claims that matter. A
 * probe on 2026-07-29 found "LMT is 87.4% of the book today" passing the gate because
 * 87.4 appears in the deck - as `momentum[6].ret_63d`. A 63-day return had grounded a
 * position-size claim. The number was real; the sentence was false.
 *
 * So a figure wearing a unit is checked against the field that unit names, not against
 * the pool. A bare number keeps the old pool check, which is the conservative case.
 */
export type Claim = 'size' | 'portfolio_return' | 'count' | null;

export function claimAfter(text: string, at: number): Claim {
  const tail = text.slice(at, at + 40).toLowerCase();
  if (/^%?\s*(of (the )?(book|portfolio)|position\b|of (my|your) (book|portfolio))/.test(tail)) return 'size';
  if (/^%?\s*(since (inception|the start)|all[- ]time|lifetime|total return)/.test(tail)) return 'portfolio_return';
  if (/^\s*(names?|positions?|tickers?|stocks?)\b/.test(tail)) return 'count';
  return null;
}

/** Position sizes the deck actually allocated. The only numbers that may wear "% of the book". */
export function positionPcts(deck: DailyDeck): number[] {
  return deck.allocation.map((p) => p.positionPct);
}

/** Counts the deck can support: how many names are in each list it holds. */
export function deckCounts(deck: DailyDeck): number[] {
  const c = deck.counts;
  return [
    deck.allocation.length, deck.watches.length, deck.momentum.length,
    c.buy, c.watch, c.skip, c.screened, c.universe,
  ];
}

/** Figures in `text` that the deck cannot account for. Empty means the text is grounded. */
export function ungrounded(text: string, deck: DailyDeck): Figure[] {
  const nums = deckNumbers(deck);
  const sizes = positionPcts(deck);
  const counts = deckCounts(deck);
  const out: Figure[] = [];

  for (const f of figuresWithOffsets(text)) {
    const claim = claimAfter(text, f.end);
    // A portfolio-wide return is not a figure this deck holds at all, so no value of
    // it can be grounded. Saying so is the honest outcome, not finding a near match.
    if (claim === 'portfolio_return') { out.push(f.figure); continue; }
    const pool = claim === 'size' ? sizes : claim === 'count' ? counts : nums;
    if (!traceable(f.figure, pool)) out.push(f.figure);
  }
  return out;
}

/** figuresIn, keeping where each figure ended so its claim can be read off the text. */
function figuresWithOffsets(text: string): Array<{ figure: Figure; end: number }> {
  const masked = text
    .replace(/\d{4}-\d{2}-\d{2}/g, (m) => ' '.repeat(m.length))
    .replace(/\b\d+(?:-day| days|-week| weeks|-month| months)\b/g, (m) => ' '.repeat(m.length));
  return [...masked.matchAll(/[-+]?\d+(?:\.(\d+))?/g)].map((m) => ({
    figure: { raw: m[0], value: Number(m[0]), dp: m[1]?.length ?? 0 },
    end: (m.index ?? 0) + m[0].length,
  }));
}
