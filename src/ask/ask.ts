/**
 * "Ask the board" - one question about one day's deck, phrased for one reader.
 *
 * THE MODEL ROUTES, THE ENGINE COMPUTES. The model never sees the deck and never does
 * arithmetic. It is handed numbered fact lines that are already finished figures, and
 * its only job is to choose which ones answer the question and say so in plain words.
 *
 * FOUR GATES, ALL IN CODE. In order: the reply must parse against AskAnswer (schema
 * gate); it must cite fact lines that exist; every figure in it must be traceable to
 * the deck (grounding gate - a reply with one invented number is discarded whole, not
 * patched); and it must not tell the reader to buy or sell anything. A reply that
 * fails any gate is dropped and the deterministic answerer speaks instead, so the
 * reader always gets something true.
 *
 * NO KEY IS A REAL PRODUCT. Without ANTHROPIC_API_KEY the deterministic answerer is the
 * whole feature, and the page says which one answered.
 *
 * ON REFUSALS: a refusal falls back to the engine rather than to a second model. We
 * always hold a true answer already, so paying for another call would buy nothing.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { DailyDeck } from '../spine/schema';
import { deckFacts } from './facts';
import { engineAnswer, type Intent } from './answer';
import { ungrounded } from './grounding';
import { AskAnswer } from './schema';

const MODEL = 'claude-opus-5';
const MAX_TOKENS = 700;
const TIMEOUT_MS = 20_000;
const DEFAULT_DAILY_CAP = 200;

/** Phrases that turn a description of the board into an instruction to the reader. */
const PRESCRIPTIVE =
  /\b(you should (buy|sell|hold|short|add|exit)|i (would |'d )?recommend|we recommend|my advice|you (ought|need) to (buy|sell)|(buy|sell) (it|this|these|them) now|sell your|buy now)\b/i;

const SYSTEM = [
  'You explain one day of a stock-screening pipeline\'s output to the person reading it.',
  '',
  'You are given numbered FACTS. They are the only things you know.',
  '- Restate facts. Never calculate, total, average, convert or re-round anything.',
  '- Every number you write must appear in a fact exactly as written there.',
  '- If the facts do not answer the question, set answerable to false and say briefly what the board does cover.',
  '- Cite the fact numbers you used.',
  '',
  'Hard limits:',
  '- Never tell the reader what to buy, sell or hold, and never suggest a position size for them. You describe what the pipeline did with its own book.',
  '- Never predict a price or a return, and never say whether something is a good investment.',
  '- No greeting, no sign-off. At most 60 words, plain sentences.',
].join('\n');

export interface AskResult {
  answer: string;
  source: 'model' | 'engine';
  intent: Intent;
  /** Why the model's answer was not used, when it was not. */
  reason?: 'no_key' | 'daily_cap' | 'refusal' | 'no_output' | 'bad_shape' | 'bad_citation' | 'ungrounded' | 'prescriptive' | 'api_error' | 'not_answerable';
}

/**
 * Per-instance daily call ceiling. This bounds one warm serverless instance, NOT the
 * whole deployment - instances do not share memory. It is a backstop against a runaway
 * loop, not protection against a determined caller; a public deployment needs a request
 * rate limit in front of this endpoint. Documented in AGENTS.md.
 */
let capDay = '';
let capUsed = 0;
export function resetDailyCap() {
  capDay = '';
  capUsed = 0;
}
export function underDailyCap(cap: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== capDay) {
    capDay = today;
    capUsed = 0;
  }
  if (capUsed >= cap) return false;
  capUsed += 1;
  return true;
}

function log(deck: DailyDeck, outcome: string, extra: Record<string, unknown> = {}) {
  // The question is not logged: it is a stranger's words about their own money.
  console.log(JSON.stringify({ at: 'ask', date: deck.date, outcome, ...extra }));
}

export async function ask(
  question: string,
  deck: DailyDeck,
  lensName: string | null,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AskResult> {
  const fallback = engineAnswer(question, deck);
  const give = (reason: AskResult['reason']): AskResult => {
    log(deck, 'engine', { reason, intent: fallback.intent });
    return { ...fallback, source: 'engine', reason };
  };

  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return give('no_key');

  const cap = Number.parseInt(env.ASK_DAILY_CAP ?? '', 10);
  if (!underDailyCap(Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_DAILY_CAP)) return give('daily_cap');

  const facts = deckFacts(deck);
  const numbered = facts.map((f, i) => `${i + 1}. ${f}`).join('\n');
  const user = [
    lensName ? `The reader's investor profile is "${lensName}". Pitch the answer to that reader.` : null,
    `FACTS about ${deck.date}:`,
    numbered,
    '',
    `QUESTION: ${question}`,
  ].filter(Boolean).join('\n');

  let parsed: AskAnswer;
  try {
    const client = new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      output_config: { effort: 'low', format: zodOutputFormat(AskAnswer) },
      messages: [{ role: 'user', content: user }],
    });

    if (res.stop_reason === 'refusal') return give('refusal');
    if (!res.parsed_output) return give('no_output');
    // Re-validated here rather than trusted: the server-side format and this schema are
    // two separate promises, and only this one runs in our own process.
    parsed = AskAnswer.parse(res.parsed_output);
    log(deck, 'model_replied', { tokens: res.usage?.output_tokens ?? null });
  } catch (e) {
    // Never surface a provider error body: it can carry the request, and the request
    // carries a stranger's question.
    log(deck, 'api_error', { kind: e instanceof Anthropic.APIError ? e.constructor.name : 'unknown' });
    return give(e instanceof Anthropic.APIError && e.status === 400 ? 'bad_shape' : 'api_error');
  }

  const rejected = applyGates(parsed, facts.length, deck);
  if (rejected) {
    if (rejected === 'ungrounded') log(deck, 'ungrounded', { figures: ungrounded(parsed.answer, deck).map((f) => f.raw) });
    return give(rejected);
  }

  log(deck, 'model', { intent: fallback.intent, facts: parsed.usedFacts.length });
  return { answer: parsed.answer, source: 'model', intent: fallback.intent };
}

/**
 * The gates that decide whether a model reply may be shown, in order. Returns the
 * reason it was rejected, or null when it passes. Pure, so every gate is testable
 * without a network call - which is the point: these are the safety of the feature.
 */
export function applyGates(parsed: AskAnswer, factCount: number, deck: DailyDeck): AskResult['reason'] | null {
  if (!parsed.answerable) return 'not_answerable';
  if (parsed.usedFacts.some((n) => n > factCount)) return 'bad_citation';
  if (PRESCRIPTIVE.test(parsed.answer)) return 'prescriptive';
  if (ungrounded(parsed.answer, deck).length) return 'ungrounded';
  return null;
}
