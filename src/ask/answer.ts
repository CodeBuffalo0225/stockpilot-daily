/**
 * The deterministic answerer.
 *
 * Two jobs. It is the whole product when no model key is set - the no-key path is a
 * real product, not a broken one - and it is the fallback whenever a gate rejects a
 * model answer, so a reader always gets something true rather than an error.
 *
 * Routing is keyword matching in code, not a model decision: a fork gate. Every
 * sentence is built from deck values, so its output passes the same grounding gate the
 * model's output has to pass.
 */
import type { DailyDeck } from '../spine/schema';
import { deckTickers } from './facts';

export type Intent =
  | 'buys' | 'exits' | 'momentum' | 'record' | 'rotation'
  | 'verify' | 'ticker' | 'thesis' | 'unknown';

const pct = (n: number | null, dp = 1) => (n == null ? '' : `${n >= 0 ? '+' : ''}${n.toFixed(dp)}%`);

/**
 * First matching rule wins; order is the design.
 *
 * Stems are anchored at the START of a word only. A trailing \b would defeat them -
 * `\brotat\b` never matches "rotating", which silently sent every rotation question to
 * the catch-all until a test caught it.
 */
const RULES: Array<[Intent, RegExp]> = [
  ['exits', /\b(exit|stop|sell|get out|cut|downside|risk|los(e|ing)|wrong)/i],
  ['record', /\b(record|how (is|are|has|have)|doing|accurate|grade|outcome|perform|beat)/i],
  ['verify', /\b(unanswered|verif|confirm|sure|certain|unknown|question)/i],
  ['rotation', /\b(rotat|replac|swap|flagged|drop)/i],
  ['momentum', /\b(moving|momentum|leader|strongest|fastest|runner|screen)/i],
  ['thesis', /\b(thesis|view|summary|overall|what happened)/i],
  ['buys', /\b(buy|bought|position|allocat|siz|own|holding|call)/i],
];

export function routeIntent(question: string, deck: DailyDeck): { intent: Intent; ticker?: string } {
  const named = [...question.matchAll(/\b[A-Z]{1,5}\b/g)].map((m) => m[0]).find((t) => deckTickers(deck).has(t));
  if (named) return { intent: 'ticker', ticker: named };
  for (const [intent, re] of RULES) if (re.test(question)) return { intent };
  return { intent: 'unknown' };
}

function aboutTicker(deck: DailyDeck, t: string): string {
  const pos = deck.allocation.find((p) => p.ticker === t);
  const mom = deck.momentum.find((m) => m.ticker === t);
  const watch = deck.watches.find((w) => w.ticker === t);
  const tape = deck.tape.find((x) => x.ticker === t);
  const lines: string[] = [];

  if (pos) {
    lines.push(`${t} is a position today: tier ${pos.tier}, ${pos.positionPct}% of the book${pos.timeHorizon ? `, on a ${pos.timeHorizon} horizon` : ''}.`);
    if (pos.stopNote) lines.push(`Its written exit: "${pos.stopNote}"`);
  } else if (watch) {
    lines.push(`${t} is on the watch list today, not a position.${watch.note ? ` The note reads: "${watch.note}"` : ''}`);
  } else if (deck.skips.includes(t)) {
    lines.push(`${t} was scored and skipped today, so nothing was bought.`);
  } else if (tape) {
    lines.push(`${t} appears on today's tape but was not sized.`);
  }

  if (mom) {
    lines.push(`On the momentum screen it scores ${mom.momentumScore}${mom.ret21d != null ? `, ${pct(mom.ret21d)} over 21 days` : ''}${mom.ret63d != null ? ` and ${pct(mom.ret63d)} over 63 days` : ''}.`);
  }
  return lines.length ? lines.join(' ') : `${t} is on today's board, but it carries no position, watch note or momentum row.`;
}

/** An answer built entirely from the deck. Never empty. */
export function engineAnswer(
  question: string,
  deck: DailyDeck,
  /** A route chosen elsewhere (Jev). Absent, the keyword router decides. */
  routed?: { intent: Intent; ticker?: string },
): { answer: string; intent: Intent } {
  const { intent, ticker } = routed ?? routeIntent(question, deck);
  const top = [...deck.allocation].sort((a, b) => b.positionPct - a.positionPct)[0] ?? null;
  const lead = [...deck.momentum].sort((a, b) => b.momentumScore - a.momentumScore)[0] ?? null;

  const answer = (() => {
    switch (intent) {
      case 'ticker':
        return aboutTicker(deck, ticker as string);

      case 'buys':
        if (!deck.allocation.length) return `Nothing was sized today. The scored names came out ${deck.counts.buy} BUY, ${deck.counts.watch} WATCH and ${deck.counts.skip} SKIP.`;
        return `Today's book: ${deck.allocation.map((p) => `${p.ticker} at ${p.positionPct}% (tier ${p.tier})`).join(', ')}. Of the names scored, ${deck.counts.buy} got a BUY, ${deck.counts.watch} a WATCH and ${deck.counts.skip} a SKIP.`;

      case 'exits': {
        const withStops = deck.allocation.filter((p) => p.stopNote);
        if (!withStops.length) return `No written exit conditions came through on today's deck.`;
        return `Each position carries a written exit. ${withStops.slice(0, 2).map((p) => `${p.ticker}: "${p.stopNote}"`).join(' ')}`;
      }

      case 'momentum':
        if (!lead) return `There is no momentum screen on today's deck.`;
        return `${lead.ticker} leads the screen at ${lead.momentumScore}${lead.ret21d != null ? `, ${pct(lead.ret21d)} over 21 days` : ''}. ${deck.counts.screened} names were screened.`;

      case 'record':
        if (!deck.outcomes) return `Today's deck carries no grading of earlier calls.`;
        return `Earlier calls graded today: ${deck.outcomes.scored5d} at the 5-day mark, ${deck.outcomes.scored15d} at 15 days and ${deck.outcomes.scored30d} at 30 days. This is a count of calls graded, not a return.`;

      case 'rotation': {
        const r = deck.rotations.suggestions[0];
        return `${deck.rotations.flagged} holdings are flagged for rotation.${r ? ` The first is ${r.tickerOut}${r.topCandidate ? `, with ${r.topCandidate} as the top replacement candidate` : ''}.` : ''}`;
      }

      case 'verify':
        return `${deck.unansweredCount} research questions went unanswered today - the pipeline's own list of what it could not confirm. The numbers on this board come from ${deck.source}.`;

      case 'thesis':
        return deck.thesis || `Today's deck carries no written thesis.`;

      default:
        return `Today's board cannot answer that. It can tell you what was bought and at what size${top ? ` (largest: ${top.ticker} at ${top.positionPct}%)` : ''}, the written exit conditions, what leads the momentum screen, what is flagged for rotation, how many earlier calls were graded, and what the pipeline could not verify.`;
    }
  })();

  return { answer, intent };
}
