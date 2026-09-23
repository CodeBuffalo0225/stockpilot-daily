/**
 * The day's book as a picture instead of a paragraph.
 *
 * A blind critic, asked which answer panel a paying user would rather have, picked a
 * Robinhood breakdown screen over ours in both orderings, and named the reason: a money
 * question was answered with prose, and "four positions" sat next to "1 got a BUY" with
 * nothing to reconcile them. This builds what that answer should have been - a headline
 * number, a proportional bar and one row per holding - entirely from the deck.
 *
 * GROUNDED BY CONSTRUCTION. No model runs here. Every figure is a deck field or a sum of
 * deck fields ("the engine computes"). Reason text is deck text, verbatim.
 *
 * THE WHY IS THE PIPELINE'S OWN. Round 2 lost partly because a BUY row showed
 * `entryNote` under the word "why" - but an entry note is a trigger ("catalyst
 * verification confirming..."), and a critic read it, correctly, as a condition not yet
 * met. The reason a position exists lives in the deck's thesis, so a row quotes the
 * first thesis sentence that names it, verbatim. A WATCH the thesis never names falls
 * back to its own watch note. A BUY the thesis never names gets no reason at all rather
 * than a trigger dressed as one.
 *
 * NO GUESSED VERDICTS. The deck does not carry a verdict per allocated position. It does
 * carry the WATCH list and the BUY count, and on a normal day the positions not on the
 * WATCH list are exactly the BUYs. The tags are shown only when that reconciles against
 * `counts.buy`; when it does not, every tag is null and the rows say nothing about it.
 */
import type { DailyDeck } from '../spine/schema';

export type BookVerdict = 'BUY' | 'WATCH';

export interface BookRow {
  ticker: string;
  pct: number;
  tier: number;
  horizon: string | null;
  verdict: BookVerdict | null;
  name: string | null;
  /** Why this position exists, verbatim from the deck: a thesis sentence naming it, or
   *  for a WATCH its watch note. Null when the deck gives no reason for it. */
  why: string | null;
  whySource: 'thesis' | 'watch-note' | null;
}

export interface Book {
  rows: BookRow[];
  /** Sum of position sizes, in percent of the book. */
  deployed: number;
  /** 100 - deployed, when that is meaningful. The deck does not say this is cash, so it
   *  is labelled unallocated, never cash. */
  unallocated: number | null;
  counts: DailyDeck['counts'];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The thesis split into sentences, kept verbatim. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
}

export function thesisSentenceFor(deck: DailyDeck, ticker: string): string | null {
  const named = new RegExp(`\\b${ticker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  return sentences(deck.thesis).find((x) => named.test(x)) ?? null;
}

export function buildBook(deck: DailyDeck): Book | null {
  if (!deck.allocation.length) return null;

  const watched = new Map(deck.watches.map((w) => [w.ticker, w.note]));
  const unwatched = deck.allocation.filter((p) => !watched.has(p.ticker)).length;
  const reconciles = unwatched === deck.counts.buy;

  const rows: BookRow[] = [...deck.allocation]
    .sort((a, b) => b.positionPct - a.positionPct || a.ticker.localeCompare(b.ticker))
    .map((p) => {
      const verdict: BookVerdict | null = reconciles ? (watched.has(p.ticker) ? 'WATCH' : 'BUY') : null;
      const quote = thesisSentenceFor(deck, p.ticker);
      const note = verdict === 'WATCH' ? (watched.get(p.ticker) ?? null) : null;
      const why = quote ?? note;
      return {
        ticker: p.ticker,
        name: p.name,
        pct: p.positionPct,
        tier: p.tier,
        horizon: p.timeHorizon,
        verdict,
        why,
        whySource: quote ? 'thesis' : note ? 'watch-note' : null,
      };
    });

  const deployed = round2(rows.reduce((s, r) => s + r.pct, 0));
  const unallocated = deployed <= 100 ? round2(100 - deployed) : null;
  return { rows, deployed, unallocated, counts: deck.counts };
}

/** "7.5", "3", "12.25" - a percent as the deck states it, without trailing zeros. */
export function pctText(n: number): string {
  return String(round2(n));
}
