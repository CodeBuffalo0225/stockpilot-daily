/**
 * The deck, flattened into labelled facts for the model to phrase.
 *
 * The model never receives the raw deck and never does arithmetic on it. It receives
 * these lines - each already a finished figure - and may only restate them. Anything it
 * computes instead is caught by the grounding gate and the answer is discarded.
 *
 * Bounded on purpose: caps keep the prompt a fixed size no matter how large a day gets,
 * so cost per question cannot grow with the board.
 */
import type { DailyDeck } from '../spine/schema';

const CAPS = { positions: 6, momentum: 6, watches: 4, skips: 12, rotations: 3 } as const;

const pct = (n: number | null, dp = 1) => (n == null ? null : `${n >= 0 ? '+' : ''}${n.toFixed(dp)}%`);

export function deckFacts(deck: DailyDeck): string[] {
  const f: string[] = [
    `Date: ${deck.date}`,
    `Source of the numbers: ${deck.source}`,
    `Verdicts: ${deck.counts.buy} BUY, ${deck.counts.watch} WATCH, ${deck.counts.skip} SKIP`,
    `Names screened on momentum: ${deck.counts.screened}`,
    `Research questions left unanswered: ${deck.unansweredCount}`,
    `Holdings flagged for rotation: ${deck.rotations.flagged}`,
  ];

  if (deck.outcomes) {
    f.push(
      `Earlier calls graded today: ${deck.outcomes.scored5d} at 5 days, ${deck.outcomes.scored15d} at 15 days, ${deck.outcomes.scored30d} at 30 days`,
      `Price lookups that failed while grading: ${deck.outcomes.failedLookups}`,
    );
  }

  for (const p of deck.allocation.slice(0, CAPS.positions)) {
    const bits = [
      `Position ${p.ticker}${p.name ? ` (${p.name})` : ''}: tier ${p.tier}, ${p.positionPct}% of the book`,
      p.sector && `sector ${p.sector}`,
      p.alphaScore != null && `alpha score ${p.alphaScore}`,
      p.timeHorizon && `horizon ${p.timeHorizon}`,
    ].filter(Boolean);
    f.push(bits.join(', '));
    if (p.entryNote) f.push(`${p.ticker} entry condition, verbatim: "${p.entryNote}"`);
    if (p.stopNote) f.push(`${p.ticker} exit condition, verbatim: "${p.stopNote}"`);
  }

  for (const w of deck.watches.slice(0, CAPS.watches)) {
    f.push(`Watch ${w.ticker}${w.alphaScore != null ? `, alpha score ${w.alphaScore}` : ''}${w.note ? `: "${w.note}"` : ''}`);
  }

  for (const m of [...deck.momentum].sort((a, b) => b.momentumScore - a.momentumScore).slice(0, CAPS.momentum)) {
    const bits = [
      `Momentum ${m.ticker}: score ${m.momentumScore}`,
      m.ret21d != null && `21-day return ${pct(m.ret21d)}`,
      m.ret63d != null && `63-day return ${pct(m.ret63d)}`,
      m.lastClose != null && `last close ${m.lastClose.toFixed(2)}`,
    ].filter(Boolean);
    f.push(bits.join(', '));
  }

  for (const r of deck.rotations.suggestions.slice(0, CAPS.rotations)) {
    f.push(`Rotation flag: ${r.tickerOut} out${r.topCandidate ? `, top replacement candidate ${r.topCandidate}` : ''}${r.reason ? ` (${r.reason})` : ''}`);
  }

  if (deck.skips.length) f.push(`Skipped today: ${deck.skips.slice(0, CAPS.skips).join(', ')}`);
  if (deck.thesis) f.push(`The day's written thesis, verbatim: "${deck.thesis}"`);

  return f;
}

/** Every ticker the deck knows, for spotting one named in a question. */
export function deckTickers(deck: DailyDeck): Set<string> {
  return new Set([
    ...deck.allocation.map((p) => p.ticker),
    ...deck.watches.map((w) => w.ticker),
    ...deck.momentum.map((m) => m.ticker),
    ...deck.tape.map((t) => t.ticker),
    ...deck.skips,
  ]);
}
