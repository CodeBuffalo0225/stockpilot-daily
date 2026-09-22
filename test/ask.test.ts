/**
 * Ask-the-board tests.
 *
 * The gate tests are the important ones. They are the difference between a feature that
 * explains a board and one that invents numbers about someone's money, so each gate is
 * tested by handing it a reply that should be rejected and checking that it is.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DailyDeck } from '../src/spine/schema';
import { ungrounded } from '../src/ask/grounding';
import { deckFacts, deckTickers } from '../src/ask/facts';
import { engineAnswer, routeIntent } from '../src/ask/answer';
import { applyGates, ask, underDailyCap, resetDailyCap } from '../src/ask/ask';
import { AskRequest, type AskAnswer } from '../src/ask/schema';

const root = join(__dirname, '..');
const load = (p: string) => DailyDeck.parse(JSON.parse(readFileSync(p, 'utf8')));
const decks: Array<[string, DailyDeck]> = [['fixture', load(join(root, 'src/fixtures/sample-deck.json'))]];
const synced = join(root, 'data/decks');
if (existsSync(synced)) {
  for (const f of readdirSync(synced).filter((f) => f.endsWith('.json')).sort().slice(-2)) {
    decks.push([f.replace('.json', ''), load(join(synced, f))]);
  }
}
const deck = decks[decks.length - 1][1];

const QUESTIONS = [
  'what did it buy today?', 'what would make it sell?', 'what is moving fastest?',
  'how has it been doing?', 'anything being rotated out?', 'what could it not verify?',
  "what's the thesis?", 'what is the weather in Trenton?', 'how much should I put in?',
];

/* ------------------------------------------------------------------ engine */

for (const [label, d] of decks) {
  test(`every engine answer on ${label} is grounded in the deck`, () => {
    for (const q of QUESTIONS) {
      const { answer } = engineAnswer(q, d);
      assert.ok(answer.length > 0, `empty answer for "${q}"`);
      assert.doesNotMatch(answer, /\b(NaN|undefined|null)\b/, `"${q}" -> ${answer}`);
      const bad = ungrounded(answer, d);
      assert.deepEqual(bad.map((f) => f.raw), [], `"${q}" stated ungrounded figures: ${answer}`);
    }
  });

  test(`a question about a real ticker is answered about that ticker on ${label}`, () => {
    const ticker = [...deckTickers(d)][0];
    const { intent } = routeIntent(`what about ${ticker}?`, d);
    assert.equal(intent, 'ticker');
    assert.match(engineAnswer(`what about ${ticker}?`, d).answer, new RegExp(`\\b${ticker}\\b`));
  });
}

test('questions route to the intent that answers them', () => {
  assert.equal(routeIntent('what would make it sell?', deck).intent, 'exits');
  assert.equal(routeIntent('how accurate has it been?', deck).intent, 'record');
  assert.equal(routeIntent('what is it rotating out?', deck).intent, 'rotation');
  assert.equal(routeIntent('what could it not confirm?', deck).intent, 'verify');
  assert.equal(routeIntent('who is on top of the momentum screen?', deck).intent, 'momentum');
  assert.equal(routeIntent('what did it buy?', deck).intent, 'buys');
  assert.equal(routeIntent('what is the capital of France?', deck).intent, 'unknown');
});

test('an unanswerable question says what the board does cover, without inventing', () => {
  const { answer, intent } = engineAnswer('what is the capital of France?', deck);
  assert.equal(intent, 'unknown');
  assert.match(answer, /cannot answer that/);
  assert.deepEqual(ungrounded(answer, deck), []);
});

test('a day with nothing sized still answers every question', () => {
  const bare: DailyDeck = { ...deck, allocation: [], watches: [], momentum: [], outcomes: null, thesis: '' };
  for (const q of QUESTIONS) {
    const { answer } = engineAnswer(q, bare);
    assert.ok(answer.length > 0);
    assert.doesNotMatch(answer, /\b(NaN|undefined)\b/);
    assert.deepEqual(ungrounded(answer, bare), []);
  }
});

test('the fact block is bounded and carries the figures a reader would ask about', () => {
  const facts = deckFacts(deck);
  assert.ok(facts.length > 4 && facts.length < 60, `unbounded fact block: ${facts.length}`);
  assert.ok(facts.some((f) => f.startsWith('Verdicts:')));
  assert.ok(facts.join('\n').length < 8000, 'fact block would dominate the prompt');
});

/* ------------------------------------------------------------------- gates */

const reply = (over: Partial<AskAnswer> = {}): AskAnswer => ({
  answerable: true,
  answer: 'The pipeline scored its names and sized a small book today.',
  usedFacts: [1, 2],
  ...over,
});
const facts = deckFacts(deck).length;

test('a clean reply passes every gate', () => {
  assert.equal(applyGates(reply(), facts, deck), null);
});

test('a reply the model marks unanswerable is not shown', () => {
  assert.equal(applyGates(reply({ answerable: false }), facts, deck), 'not_answerable');
});

test('a reply citing a fact that does not exist is rejected', () => {
  assert.equal(applyGates(reply({ usedFacts: [facts + 5] }), facts, deck), 'bad_citation');
});

test('a reply telling the reader to trade is rejected, however it is phrased', () => {
  for (const line of [
    'You should buy CRWD here.',
    'I recommend selling into the move.',
    'My advice is to wait for a pullback.',
    'Sell your position before earnings.',
    'You need to buy this before it runs.',
  ]) {
    assert.equal(applyGates(reply({ answer: line }), facts, deck), 'prescriptive', line);
  }
});

test('a reply containing a figure the deck does not hold is discarded whole', () => {
  const r = applyGates(reply({ answer: 'It sized the book at 41.7% of capital today.' }), facts, deck);
  assert.equal(r, 'ungrounded');
});

test('a real number from the wrong field cannot ground a size claim', () => {
  // The leak a .gauntlet probe found on 2026-07-29: "87.4% of the book" passed the
  // gate because 87.4 was in the deck - as a 63-day return. The figure was real and
  // the sentence was false, which is the case a pooled number check cannot see.
  const ret = deck.momentum.find((m) => m.ret63d != null)?.ret63d;
  assert.ok(ret != null, 'fixture needs a momentum row with a 63-day return');
  const sizes = deck.allocation.map((p) => p.positionPct);
  assert.ok(!sizes.some((p) => Math.abs(p - ret) < 0.05), 'that return must not also be a real size');

  const answer = `${deck.allocation[0].ticker} is ${ret.toFixed(1)}% of the book today.`;
  assert.equal(applyGates(reply({ answer }), facts, deck), 'ungrounded');
});

test('a portfolio-wide return is never grounded, because the deck holds no such number', () => {
  for (const answer of [
    'The book is up 41.9% since inception.',
    'That is a 12% total return.',
    'You are up 3.5% all-time.',
  ]) {
    assert.equal(applyGates(reply({ answer }), facts, deck), 'ungrounded', answer);
  }
});

test('a real position size still passes when stated as one', () => {
  const p = deck.allocation[0];
  const answer = `${p.ticker} is ${p.positionPct}% of the book.`;
  assert.equal(applyGates(reply({ answer }), facts, deck), null);
});

test('a reply restating a figure the deck does hold is kept', () => {
  const answer = `Of the names scored, ${deck.counts.skip} were skipped.`;
  assert.equal(applyGates(reply({ answer }), facts, deck), null);
});

/* ------------------------------------------------------- degradation & cost */

test('with no API key the deterministic answerer is the product, and says so', async () => {
  const r = await ask('what did it buy today?', deck, 'The Analyst', {} as NodeJS.ProcessEnv);
  assert.equal(r.source, 'engine');
  assert.equal(r.reason, 'no_key');
  assert.ok(r.answer.length > 0);
  assert.deepEqual(ungrounded(r.answer, deck), []);
});

test('the per-instance daily cap stops a runaway loop', () => {
  resetDailyCap();
  assert.equal(underDailyCap(2), true);
  assert.equal(underDailyCap(2), true);
  assert.equal(underDailyCap(2), false, 'a third call past a cap of two must be refused');
  resetDailyCap();
  assert.equal(underDailyCap(2), true, 'the cap resets');
});

test('the request gate accepts a real question and nothing else', () => {
  assert.equal(AskRequest.safeParse({ question: 'what did it buy?' }).success, true);
  assert.equal(AskRequest.safeParse({ question: 'hi' }).success, false);
  assert.equal(AskRequest.safeParse({ question: 'x'.repeat(301) }).success, false);
  assert.equal(AskRequest.safeParse({ question: 'what did it buy?', date: '17-09-2026' }).success, false);
  assert.equal(AskRequest.safeParse({}).success, false);
});
