/**
 * Lens tests. `npm test` (node:test under tsx - no test framework dependency).
 *
 * The grounding test is the one that matters. It is the grounding gate written as an
 * assertion: every number a lens shows a user must be traceable to a number the deck
 * actually holds. A lens that says "3%" when the deck says 3 passes; a lens that
 * computes, rounds oddly, or invents a figure fails.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DailyDeck } from '../src/spine/schema';
import { LensKey, AiPosture, buildLens, parseLens } from '../src/lens/lens';

const root = join(__dirname, '..');
const load = (p: string) => DailyDeck.parse(JSON.parse(readFileSync(p, 'utf8')));

// The committed fixture always runs. Synced decks (gitignored) run when present, so a
// real day is exercised on the machine that has them without CI depending on it.
const decks: Array<[string, DailyDeck]> = [['fixture', load(join(root, 'src/fixtures/sample-deck.json'))]];
const synced = join(root, 'data/decks');
if (existsSync(synced)) {
  for (const f of readdirSync(synced).filter((f) => f.endsWith('.json')).sort().slice(-3)) {
    decks.push([f.replace('.json', ''), load(join(synced, f))]);
  }
}

/** A day with nothing sized, nothing watched, no screen and no outcomes. */
const bare: DailyDeck = {
  ...decks[0][1],
  allocation: [],
  watches: [],
  momentum: [],
  outcomes: null,
};

/** Every number the deck holds: numeric fields, numbers inside its text, array lengths. */
function pool(deck: DailyDeck): number[] {
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

/**
 * Figures shown in a line. Window labels ("30-day", "21 days") name what a field
 * measures - they are schema vocabulary, not data - so they are stripped first.
 */
function figures(line: string): Array<{ raw: string; value: number; dp: number }> {
  const stripped = line.replace(/\b\d+(?:-day| days)\b/g, '');
  return [...stripped.matchAll(/[-+]?\d+(?:\.(\d+))?/g)].map((m) => ({
    raw: m[0],
    value: Number(m[0]),
    dp: m[1]?.length ?? 0,
  }));
}

const traceable = (f: { value: number; dp: number }, nums: number[]) =>
  nums.some((x) => Math.abs(x - f.value) <= 0.5 * 10 ** -f.dp + 1e-9);

const everyLens = () =>
  LensKey.options.flatMap((k) => [null, ...AiPosture.options].map((a) => [k, a] as const));

test('the lens keys are the contract investor-quiz links to', () => {
  assert.deepEqual(LensKey.options, [
    'autopilot', 'compounder', 'analyst', 'operator',
    'thrill-seeker', 'nervous-holder', 'drifter', 'rookie',
  ]);
  assert.deepEqual(AiPosture.options, [
    'accelerationist', 'cautious-believer', 'bear', 'undecided', 'unbothered',
  ]);
});

for (const [label, deck] of decks) {
  test(`every lens builds on ${label} with at least one point`, () => {
    for (const [k, a] of everyLens()) {
      const v = buildLens(deck, k, a);
      assert.ok(v.points.length > 0, `${k} produced no points on ${label}`);
      assert.ok(v.name && v.framing && v.caution, `${k} is missing copy`);
    }
  });

  test(`no lens prints NaN, undefined or null on ${label}`, () => {
    for (const [k, a] of everyLens()) {
      const v = buildLens(deck, k, a);
      for (const line of [v.framing, v.caution, v.aiNote ?? '', ...v.points]) {
        assert.doesNotMatch(line, /\b(NaN|undefined|null)\b/, `${k}: "${line}"`);
      }
    }
  });

  test(`every figure in every point is traceable to the ${label} deck`, () => {
    const nums = pool(deck);
    for (const k of LensKey.options) {
      for (const line of buildLens(deck, k, null).points) {
        for (const f of figures(line)) {
          assert.ok(traceable(f, nums), `${k} shows ${f.raw} but ${label} holds no such number: "${line}"`);
        }
      }
    }
  });

  test(`building a lens never changes the ${label} deck`, () => {
    const before = structuredClone(deck);
    for (const [k, a] of everyLens()) buildLens(deck, k, a);
    assert.deepEqual(deck, before, 'a lens mutated the deck - every viewer must see the same calls');
  });
}

test('a day with nothing sized drops position sentences instead of inventing them', () => {
  for (const [k, a] of everyLens()) {
    const v = buildLens(bare, k, a);
    for (const line of v.points) {
      assert.doesNotMatch(line, /of its book|tier \d|exit:|top call/, `${k} described a position that does not exist: "${line}"`);
    }
    for (const line of [...v.points, v.aiNote ?? '']) assert.doesNotMatch(line, /\b(NaN|undefined|null)\b/);
  }
});

test('the AI note appears only when the deck itself mentions AI', () => {
  const silent: DailyDeck = { ...bare, thesis: 'Energy led on supply news.' };
  assert.equal(buildLens(silent, 'analyst', 'bear').aiNote, null);
  const loud: DailyDeck = { ...bare, thesis: 'The AI capex cycle carried semis.' };
  assert.ok(buildLens(loud, 'analyst', 'bear').aiNote);
  assert.equal(buildLens(loud, 'analyst', null).aiNote, null, 'no posture, no posture note');
});

test('parseLens accepts the contract and nothing else', () => {
  assert.deepEqual(parseLens('analyst', 'bear'), { key: 'analyst', ai: 'bear' });
  assert.deepEqual(parseLens(['thrill-seeker', 'x'], undefined), { key: 'thrill-seeker', ai: null });
  assert.deepEqual(parseLens('rookie', 'not-a-posture'), { key: 'rookie', ai: null });
  assert.equal(parseLens('The Analyst', 'bear'), null, 'display names are not keys');
  assert.equal(parseLens('day-trader', 'bear'), null);
  assert.equal(parseLens(undefined, 'bear'), null);
});
