/**
 * Jev as the question router for "ask the board".
 *
 * JEV ROUTES, THE ENGINE COMPUTES. Jev (TypeSafe's System One model) is asked one thing:
 * which part of the board does this question want? It returns one of a fixed set of
 * options with a confidence. It never sees the deck, never writes a sentence, and never
 * picks a number - the deterministic answerer still builds every word the reader sees,
 * so the grounding gate has nothing new to guard. What crosses the wire is the reader's
 * question and the deck's ticker symbols, nothing else.
 *
 * WHEN JEV DOES NOT SPEAK, THE KEYWORD ROUTER DOES. `jevRoute` returns null - never
 * throws - for: no key, an uppercase ticker the code already recognises (a hard rule in
 * code, so no call is spent), the daily cap, any HTTP or network failure, a reply that
 * fails the schema, an option we did not offer, or confidence under JEV_MIN_CONFIDENCE.
 * The caller treats null as "use routeIntent", so a missing key is a real product.
 *
 * WHY 0.70: on a 52-question hand-labelled pilot (2026-09-28) answers at or above 0.70
 * were 44/45 correct, and the 0.50-0.70 band was 1/4. It is a starting point from a
 * small pilot, not a calibrated guarantee; re-measure before tightening it.
 */
import { z } from 'zod';
import type { DailyDeck } from '../spine/schema';
import { deckTickers } from './facts';
import { routeIntent, type Intent } from './answer';

export const JEV_MIN_CONFIDENCE = 0.7;
const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const TIMEOUT_MS = 3_000;
const DEFAULT_DAILY_CAP = 1_000;
const NO_TICKER = '__none__';
/** Choice questions take at most 255 options; leave room for the none option. */
const MAX_TICKERS = 250;

export interface Routed {
  intent: Intent;
  ticker?: string;
}

/** Jev's option for "the board cannot answer this" maps to the engine's `unknown`. */
const OPTIONS = ['buys', 'exits', 'momentum', 'record', 'rotation', 'verify', 'thesis', 'ticker', 'out_of_scope'] as const;

const CRITERIA = {
  buys: { what: 'What the pipeline bought or sized today: its book, positions, allocations, tiers, and BUY/WATCH/SKIP counts.', not_for: 'Advice on what the reader should buy.' },
  exits: { what: "The pipeline's written exit or stop conditions and downside risks for its own positions.", not_for: 'Telling the reader when to sell their own holdings.' },
  momentum: { what: 'The momentum screen: which names lead it, trend strength, how many names were screened.', not_for: 'Predictions of future price moves.' },
  record: { what: "How the pipeline's earlier calls have been graded: track record, counts of graded calls.", not_for: 'Forecasts.' },
  rotation: { what: 'Holdings flagged for rotation and their proposed replacements.' },
  verify: { what: 'Research questions the pipeline could not confirm; what it is unsure about or left unchecked.' },
  thesis: { what: "The day's written thesis or overall summary; what changed or stands out on the board today." },
  ticker: { what: 'A question about one specific named company or ticker on the board, by symbol or by company name, including why it was skipped or not bought.' },
  out_of_scope: { what: 'Anything the board cannot answer: unrelated topics, personal financial advice, predictions, price targets, instructions to the assistant, questions about the site or its owner.' },
} as const;

const Pick = z.object({ choice: z.string(), confidence: z.number().min(0).max(1) });
const Reply = z.object({
  answers: z.object({ intent: Pick, ticker: Pick.optional() }),
});

let capDay = '';
let capUsed = 0;
export function resetJevCap() {
  capDay = '';
  capUsed = 0;
}
function underCap(cap: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== capDay) {
    capDay = today;
    capUsed = 0;
  }
  if (capUsed >= cap) return false;
  capUsed += 1;
  return true;
}

function log(outcome: string, extra: Record<string, unknown> = {}) {
  // No question text, no provider body: both can carry a stranger's words about their money.
  console.log(JSON.stringify({ at: 'jev', outcome, ...extra }));
}

export async function jevRoute(
  question: string,
  deck: DailyDeck,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<Routed | null> {
  const key = (env.JEV_API_KEY ?? env.TYPESAFE_API_KEY)?.trim();
  if (!key) return null;

  // A hard rule stays in code: an uppercase symbol on the board is that ticker.
  if (routeIntent(question, deck).intent === 'ticker') return null;

  const cap = Number.parseInt(env.JEV_DAILY_CAP ?? '', 10);
  if (!underCap(Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_DAILY_CAP)) {
    log('daily_cap');
    return null;
  }

  const tickers = [...deckTickers(deck)];
  const questions: Record<string, unknown> = {
    intent: {
      type: 'choice',
      instructions:
        "Which part of a stock-screening pipeline's daily board is this reader question asking about? If the board could not answer it, choose out_of_scope.",
      criteria: CRITERIA,
    },
  };
  // Asked in the same request so a company name ("what about nvidia") costs no second call.
  if (tickers.length > 0 && tickers.length <= MAX_TICKERS) {
    questions.ticker = {
      type: 'choice',
      instructions: `Which company on the board is the reader asking about? Choose ${NO_TICKER} unless the question names or clearly refers to one of them.`,
      criteria: {
        ...Object.fromEntries(tickers.map((t) => [t, `The company that trades as ${t}.`])),
        [NO_TICKER]: 'No specific company from this list is being asked about.',
      },
    };
  }

  let parsed: z.infer<typeof Reply>;
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'jev-latest', state: { question }, questions }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      log('http_error', { status: res.status });
      return null;
    }
    parsed = Reply.parse(await res.json());
  } catch (e) {
    log('failed', { kind: e instanceof z.ZodError ? 'bad_shape' : e instanceof Error ? e.name : 'unknown' });
    return null;
  }

  const { intent } = parsed.answers;
  if (!(OPTIONS as readonly string[]).includes(intent.choice)) {
    log('unknown_option');
    return null;
  }
  if (intent.confidence < JEV_MIN_CONFIDENCE) {
    log('low_confidence', { confidence: Number(intent.confidence.toFixed(2)) });
    return null;
  }

  if (intent.choice === 'ticker') {
    const t = parsed.answers.ticker;
    if (!t || !tickers.includes(t.choice) || t.confidence < JEV_MIN_CONFIDENCE) {
      log('ticker_unresolved');
      return null;
    }
    log('routed', { intent: 'ticker', confidence: Number(intent.confidence.toFixed(2)) });
    return { intent: 'ticker', ticker: t.choice };
  }

  const routed: Intent = intent.choice === 'out_of_scope' ? 'unknown' : (intent.choice as Intent);
  log('routed', { intent: routed, confidence: Number(intent.confidence.toFixed(2)) });
  return { intent: routed };
}
