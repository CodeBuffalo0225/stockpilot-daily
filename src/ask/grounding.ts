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

/** Figures in `text` that the deck cannot account for. Empty means the text is grounded. */
export function ungrounded(text: string, deck: DailyDeck): Figure[] {
  const nums = deckNumbers(deck);
  return figuresIn(text).filter((f) => !traceable(f, nums));
}
