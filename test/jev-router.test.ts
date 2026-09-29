/**
 * Jev-router tests. No network: every call goes through a stub fetch.
 *
 * The router's contract is "Jev may pick the route; nothing Jev does can break an
 * answer". So the tests that matter are the failure ones - each way Jev can be missing,
 * slow, wrong-shaped or unsure has to end at the keyword router, never an exception.
 */
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DailyDeck } from '../src/spine/schema';
import { deckTickers } from '../src/ask/facts';
import { jevRoute, resetJevCap, JEV_MIN_CONFIDENCE } from '../src/ask/jev-router';
import { ask } from '../src/ask/ask';

const root = join(__dirname, '..');
const load = (p: string) => DailyDeck.parse(JSON.parse(readFileSync(p, 'utf8')));
let deck = load(join(root, 'src/fixtures/sample-deck.json'));
const synced = join(root, 'data/decks');
if (existsSync(synced)) {
  const latest = readdirSync(synced).filter((f) => f.endsWith('.json')).sort().pop();
  if (latest) deck = load(join(synced, latest));
}
const T = [...deckTickers(deck)][0];

const KEY = 'test-key-not-a-real-secret';
const envOf = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const env = envOf({ JEV_API_KEY: KEY });

type Pick = { choice: string; confidence: number };
const reply = (intent: Pick, ticker?: Pick) => ({ answers: { intent, ...(ticker ? { ticker } : {}) } });

function stub(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

beforeEach(() => resetJevCap());

/* -------------------------------------------------------------- degrade to keyword */

test('no key: returns null and never calls out', async () => {
  const s = stub(reply({ choice: 'buys', confidence: 0.99 }));
  assert.equal(await jevRoute('what did it buy today?', deck, {} as NodeJS.ProcessEnv, s.fn), null);
  assert.equal(s.calls.length, 0);
});

test('a blank key counts as no key', async () => {
  const s = stub(reply({ choice: 'buys', confidence: 0.99 }));
  assert.equal(await jevRoute('what did it buy today?', deck, envOf({ JEV_API_KEY: '   ' }), s.fn), null);
  assert.equal(s.calls.length, 0);
});

test('an uppercase ticker on the board is resolved in code; Jev is not called', async () => {
  const s = stub(reply({ choice: 'out_of_scope', confidence: 0.99 }));
  assert.equal(await jevRoute(`tell me about ${T}`, deck, env, s.fn), null);
  assert.equal(s.calls.length, 0);
});

test('confidence under the floor falls back to the keyword router', async () => {
  const s = stub(reply({ choice: 'buys', confidence: JEV_MIN_CONFIDENCE - 0.01 }));
  assert.equal(await jevRoute('what is in the portfolio right now', deck, env, s.fn), null);
});

test('confidence exactly at the floor is accepted', async () => {
  const s = stub(reply({ choice: 'buys', confidence: JEV_MIN_CONFIDENCE }));
  assert.deepEqual(await jevRoute('what is in the portfolio right now', deck, env, s.fn), { intent: 'buys' });
});

test('every failure mode ends at null, never a throw', async () => {
  const cases: Array<[string, typeof fetch]> = [
    ['401', stub({ detail: { error_type: 'authentication_error' } }, 401).fn],
    ['429', stub({}, 429).fn],
    ['529', stub({}, 529).fn],
    ['500', stub({}, 500).fn],
    ['not json', (async () => new Response('<html>oops</html>', { status: 200 })) as unknown as typeof fetch],
    ['wrong shape', stub({ answers: { intent: { choice: 'buys' } } }).fn],
    ['confidence out of range', stub(reply({ choice: 'buys', confidence: 1.4 })).fn],
    ['no answers', stub({}).fn],
    ['network error', (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch],
    ['timeout', (async () => { throw new DOMException('timed out', 'TimeoutError'); }) as unknown as typeof fetch],
  ];
  for (const [label, fn] of cases) {
    assert.equal(await jevRoute('what is in the portfolio right now', deck, env, fn), null, label);
  }
});

test('an option we never offered is rejected', async () => {
  const s = stub(reply({ choice: 'give_investment_advice', confidence: 0.99 }));
  assert.equal(await jevRoute('what is in the portfolio right now', deck, env, s.fn), null);
});

/* ------------------------------------------------------------------- routing works */

test('every offered intent routes, and out_of_scope becomes the engine\'s unknown', async () => {
  for (const intent of ['buys', 'exits', 'momentum', 'record', 'rotation', 'verify', 'thesis']) {
    resetJevCap();
    const s = stub(reply({ choice: intent, confidence: 0.9 }));
    assert.deepEqual(await jevRoute('a paraphrase with no trigger words', deck, env, s.fn), { intent });
  }
  resetJevCap();
  const s = stub(reply({ choice: 'out_of_scope', confidence: 0.9 }));
  assert.deepEqual(await jevRoute('what is the weather in Trenton', deck, env, s.fn), { intent: 'unknown' });
});

test('a company named without its symbol resolves through the same call', async () => {
  const s = stub(reply({ choice: 'ticker', confidence: 0.95 }, { choice: T, confidence: 0.9 }));
  assert.deepEqual(await jevRoute('what about that company', deck, env, s.fn), { intent: 'ticker', ticker: T });
  assert.equal(s.calls.length, 1, 'a second call would double the cost of every ticker question');
});

test('a ticker Jev names that is not on the board is rejected', async () => {
  const s = stub(reply({ choice: 'ticker', confidence: 0.95 }, { choice: 'ZZZZ', confidence: 0.99 }));
  assert.equal(await jevRoute('what about that company', deck, env, s.fn), null);
});

test('a ticker route with an unsure or missing symbol falls back', async () => {
  const unsure = stub(reply({ choice: 'ticker', confidence: 0.95 }, { choice: T, confidence: 0.4 }));
  assert.equal(await jevRoute('what about that company', deck, env, unsure.fn), null);
  resetJevCap();
  const none = stub(reply({ choice: 'ticker', confidence: 0.95 }, { choice: '__none__', confidence: 0.99 }));
  assert.equal(await jevRoute('what about that company', deck, env, none.fn), null);
  resetJevCap();
  const missing = stub(reply({ choice: 'ticker', confidence: 0.95 }));
  assert.equal(await jevRoute('what about that company', deck, env, missing.fn), null);
});

/* ------------------------------------------------------------------ what leaves us */

test('the request carries the question and ticker symbols, not the deck', async () => {
  const s = stub(reply({ choice: 'buys', confidence: 0.9 }));
  const q = 'what is in the portfolio right now';
  await jevRoute(q, deck, env, s.fn);
  assert.equal(s.calls.length, 1);
  const { url, init } = s.calls[0];
  assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${KEY}`);
  const body = JSON.parse(String(init.body));
  assert.deepEqual(body.state, { question: q });
  assert.deepEqual(Object.keys(body.questions).sort(), ['intent', 'ticker']);
  const wire = String(init.body);
  if (deck.thesis) assert.ok(!wire.includes(deck.thesis), 'the deck thesis must not be sent');
  for (const p of deck.allocation) assert.ok(!wire.includes(`${p.positionPct}%`), 'position sizes must not be sent');
});

test('neither the key nor the question is logged', async () => {
  const lines: string[] = [];
  const spy = mock.method(console, 'log', (...a: unknown[]) => void lines.push(a.map(String).join(' ')));
  try {
    const q = 'a very private question about my retirement';
    await jevRoute(q, deck, env, stub(reply({ choice: 'buys', confidence: 0.9 })).fn);
    await jevRoute(q, deck, env, stub({}, 401).fn);
    await jevRoute(q, deck, env, (async () => { throw new Error(`boom ${q}`); }) as unknown as typeof fetch);
    assert.ok(lines.length >= 3);
    for (const l of lines) {
      assert.ok(!l.includes(KEY), `key in log: ${l}`);
      assert.ok(!l.includes('retirement'), `question in log: ${l}`);
    }
  } finally {
    spy.mock.restore();
  }
});

test('the daily cap stops calls and the caller falls back', async () => {
  const s = stub(reply({ choice: 'buys', confidence: 0.9 }));
  const capped = envOf({ JEV_API_KEY: KEY, JEV_DAILY_CAP: '2' });
  assert.ok(await jevRoute('first paraphrase here', deck, capped, s.fn));
  assert.ok(await jevRoute('second paraphrase here', deck, capped, s.fn));
  assert.equal(await jevRoute('third paraphrase here', deck, capped, s.fn), null);
  assert.equal(s.calls.length, 2);
});

/* --------------------------------------------------------------- through ask() */

test('ask(): with no keys at all it is the keyword router and says so', async () => {
  const r = await ask('what did it buy today?', deck, null, {} as NodeJS.ProcessEnv);
  assert.equal(r.source, 'engine');
  assert.equal(r.router, 'keyword');
  assert.equal(r.reason, 'no_key');
  assert.equal(r.intent, 'buys');
});

test('ask(): Jev routes a paraphrase the keyword rules miss, and the engine writes the answer', async () => {
  const s = stub(reply({ choice: 'record', confidence: 0.95 }));
  const r = await ask('has the pipeline been right lately', deck, null, env, { fetch: s.fn });
  assert.equal(r.router, 'jev');
  assert.equal(r.intent, 'record');
  assert.equal(r.source, 'engine');
  assert.match(r.answer, /calls graded|no grading/i);
});

test('ask(): a company name reaches the ticker answer', async () => {
  const s = stub(reply({ choice: 'ticker', confidence: 0.95 }, { choice: T, confidence: 0.9 }));
  const r = await ask('what about that company', deck, null, env, { fetch: s.fn });
  assert.equal(r.router, 'jev');
  assert.equal(r.intent, 'ticker');
  assert.match(r.answer, new RegExp(`\\b${T}\\b`));
});

test('ask(): Jev sends a keyword trap to out_of_scope instead of a wrong answer', async () => {
  // "own" would send this to the buys answer under the keyword rules.
  const s = stub(reply({ choice: 'out_of_scope', confidence: 0.99 }));
  const r = await ask('do you own any crypto', deck, null, env, { fetch: s.fn });
  assert.equal(r.router, 'jev');
  assert.equal(r.intent, 'unknown');
  assert.match(r.answer, /cannot answer that/);
});

test('ask(): a Jev outage costs nothing but the router label', async () => {
  const s = stub({}, 529);
  const r = await ask('what would make it sell?', deck, null, env, { fetch: s.fn });
  assert.equal(r.router, 'keyword');
  assert.equal(r.intent, 'exits');
  assert.ok(r.answer.length > 0);
});

test('ask(): an unsure Jev defers to the keyword router', async () => {
  const s = stub(reply({ choice: 'out_of_scope', confidence: 0.65 }));
  const r = await ask('what would make it sell?', deck, null, env, { fetch: s.fn });
  assert.equal(r.router, 'keyword');
  assert.equal(r.intent, 'exits');
});
