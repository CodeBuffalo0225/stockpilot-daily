/**
 * The structured book answer. It draws money, so the two things that matter are that
 * every figure comes from the deck and that no verdict tag is ever guessed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DailyDeck } from '../src/spine/schema';
import { buildBook } from '../src/ask/book';

const deck = DailyDeck.parse(
  JSON.parse(readFileSync(join(__dirname, '..', 'src/fixtures/sample-deck.json'), 'utf8')),
);

test('rows are the deck allocation, largest first, with deck sizes', () => {
  const book = buildBook(deck)!;
  assert.equal(book.rows.length, deck.allocation.length);
  const sizes = book.rows.map((r) => r.pct);
  assert.deepEqual(sizes, [...sizes].sort((a, b) => b - a));
  for (const r of book.rows) {
    const p = deck.allocation.find((a) => a.ticker === r.ticker)!;
    assert.equal(r.pct, p.positionPct);
    assert.equal(r.tier, p.tier);
  }
});

test('deployed is the sum of sizes and unallocated is never called cash', () => {
  const book = buildBook(deck)!;
  const sum = deck.allocation.reduce((s, p) => s + p.positionPct, 0);
  assert.ok(Math.abs(book.deployed - sum) < 0.01);
  assert.ok(Math.abs((book.unallocated ?? 0) - (100 - sum)) < 0.01);
});

test('verdict tags appear only when the WATCH list reconciles with the BUY count', () => {
  const [first, ...rest] = deck.allocation;
  const reconciling: DailyDeck = {
    ...deck,
    allocation: [first, ...rest],
    watches: rest.map((p) => ({ ticker: p.ticker, note: `watched ${p.ticker}`, alphaScore: null })),
    counts: { ...deck.counts, buy: 1 },
  };
  const book = buildBook(reconciling)!;
  assert.equal(book.rows.find((r) => r.ticker === first.ticker)!.verdict, 'BUY');
  for (const p of rest) {
    const row = book.rows.find((r) => r.ticker === p.ticker)!;
    assert.equal(row.verdict, 'WATCH');
    // A WATCH reason is a thesis sentence naming it, else its own note - verbatim either way.
    if (row.whySource === 'thesis') assert.ok(reconciling.thesis.includes(row.why!));
    else assert.equal(row.why, `watched ${p.ticker}`);
  }

  // Same positions, but a BUY count the lists cannot explain: no verdicts, and no watch
  // note either (that would imply one). A thesis quote may stay - it claims no verdict.
  const off = buildBook({ ...reconciling, counts: { ...deck.counts, buy: 3 } })!;
  for (const r of off.rows) {
    assert.equal(r.verdict, null);
    assert.notEqual(r.whySource, 'watch-note');
    if (r.why != null) assert.ok(reconciling.thesis.includes(r.why));
  }
});

test('a day with nothing sized has no book, rather than an empty chart', () => {
  assert.equal(buildBook({ ...deck, allocation: [] }), null);
});

test('a reason is always verbatim deck text, and an entry trigger is never shown as one', () => {
  const book = buildBook(deck)!;
  for (const r of book.rows) {
    const p = deck.allocation.find((a) => a.ticker === r.ticker)!;
    if (r.why == null) continue;
    if (r.whySource === 'thesis') {
      assert.ok(deck.thesis.includes(r.why), `${r.ticker}: quote must be a thesis substring`);
      assert.match(r.why, new RegExp(`\\b${r.ticker}\\b`), `${r.ticker}: quote must name it`);
    }
    assert.notEqual(r.why, p.entryNote, `${r.ticker}: an entry trigger is not a reason`);
  }
});

test('a thesis sentence shared by two holdings is quoted once when the second has its own note', () => {
  const [a, b] = deck.allocation;
  const shared: DailyDeck = {
    ...deck,
    thesis: `${a.ticker} and ${b.ticker} earn monitoring allocations only.`,
    allocation: [a, b],
    watches: [a, b].map((p) => ({ ticker: p.ticker, note: `own note ${p.ticker}`, alphaScore: null })),
    counts: { ...deck.counts, buy: 0 },
  };
  const rows = buildBook(shared)!.rows;
  const quotes = rows.filter((r) => r.whySource === 'thesis');
  assert.equal(quotes.length, 1, 'the shared sentence appears once');
  const other = rows.find((r) => r.whySource !== 'thesis')!;
  assert.equal(other.why, `own note ${other.ticker}`);
});
