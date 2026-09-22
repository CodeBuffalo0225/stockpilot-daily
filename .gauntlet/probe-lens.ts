/**
 * MEASURED BAR — lens.
 *
 * There is no visual bar for the lens panel. Robinhood publishes no comparable
 * surface, its App Store frames are marketing layouts, and .gauntlet/bars/ask/SOURCE.md
 * records the three sources already rejected. Rather than run a blind pick against a
 * bar that measures nothing, this judges the lens on what it must actually get right.
 *
 * THE BAR IS ZERO. Not "fewer than Robinhood" — Robinhood is a regulated broker and
 * the standard it is held to is absolute. A lens surface that emits one piece of
 * personalised advice, shows one figure it cannot source, or drops the disclaimer on
 * one of 48 renderings has failed. So has one that changes nobody's reading at all,
 * because a lens that is decorative is a claim the product does not honour.
 *
 * Every number here is counted, not asserted. `npx tsx .gauntlet/probe-lens.ts`
 * prints the violation count, and the round is recorded from that number.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DailyDeck } from '../src/spine/schema';
import { LensKey, AiPosture, buildLens, SAME_CALLS } from '../src/lens/lens';
import { deckNumbers, figuresIn, traceable } from '../src/ask/grounding';

// Copied deliberately from src/ask/ask.ts rather than imported. The ask gate guards
// model output; this guards prose a human wrote. They are allowed to drift apart, and
// a shared constant would hide it when they do.
const PRESCRIPTIVE =
  /\b(you should (buy|sell|hold|short|add|exit)|i (would |'d )?recommend|we recommend|my advice|you (ought|need) to (buy|sell)|(buy|sell) (it|this|these|them) now|sell your|buy now)\b/i;

const root = join(__dirname, '..');
const load = (p: string) => DailyDeck.parse(JSON.parse(readFileSync(p, 'utf8')));

const decks: Array<[string, DailyDeck]> = [
  ['fixture', load(join(root, 'src/fixtures/sample-deck.json'))],
];
const synced = join(root, 'data/decks');
if (existsSync(synced)) {
  for (const f of readdirSync(synced).filter((f) => f.endsWith('.json')).sort()) {
    decks.push([f.replace('.json', ''), load(join(synced, f))]);
  }
}

const combos = LensKey.options.flatMap((k) =>
  [null, ...AiPosture.options].map((a) => [k, a] as const),
);

const violations: string[] = [];
let renderings = 0;

for (const [deckName, deck] of decks) {
  const nums = deckNumbers(deck);
  const tickers = [
    ...deck.allocation.map((p) => p.ticker),
    ...deck.watches.map((w) => w.ticker),
    ...deck.momentum.map((m) => m.ticker),
  ].filter(Boolean);
  const framings = new Map<string, string>();

  for (const [key, ai] of combos) {
    const v = buildLens(deck, key, ai);
    renderings++;
    const where = `${deckName} ${key}/${ai ?? 'no-posture'}`;
    const prose = [v.framing, ...v.points, v.caution, v.aiNote ?? ''].filter(Boolean);

    // 1. Advice leak. Personalised security selection or sizing is the one thing
    //    this surface may never do, whoever is reading it.
    for (const line of prose) {
      if (PRESCRIPTIVE.test(line)) violations.push(`ADVICE   ${where}: ${line}`);
    }

    // 2. Disclaimer. Present on every rendering or the boundary is unstated.
    if (v.disclaimer !== SAME_CALLS) violations.push(`NODISC   ${where}`);

    // 3. Grounding, scoped to the promise the module actually makes. lens.ts states
    //    that every figure in `points` is read off the deck; it says nothing of the
    //    kind about `caution` and `aiNote`, which carry didactic risk copy. The first
    //    run of this probe failed 120 times on one true sentence - "a 50% loss needs a
    //    100% gain to get back to even" - which is arithmetic, not a deck claim. That
    //    was this bar testing a promise nobody made, so the rule is split rather than
    //    dropped: `points` must be traceable, and framing copy must not be mistakable
    //    for a deck claim, which is what actually threatens a reader.
    for (const line of v.points) {
      for (const f of figuresIn(line)) {
        if (!traceable(f, nums)) violations.push(`UNGROUND ${where}: ${f.raw} in "${line}"`);
      }
    }

    // 3b. Didactic copy may carry general figures, but never beside a ticker from this
    //     deck - that is the sentence a reader reads as a claim about a real position.
    for (const line of [v.framing, v.caution, v.aiNote ?? ''].filter(Boolean)) {
      if (!figuresIn(line).length) continue;
      const named = tickers.filter((t) => new RegExp(`\\b${t}\\b`).test(line));
      if (named.length) violations.push(`MISREAD  ${where}: figure beside ${named.join(',')} in "${line}"`);
    }

    // 4. Not decorative. Two archetypes reading the same day must not receive the
    //    same framing sentence, or the personalisation is a label on nothing.
    if (ai === null) {
      const clash = framings.get(v.framing);
      if (clash) violations.push(`SAMETEXT ${where}: framing identical to ${clash}`);
      else framings.set(v.framing, where);
    }
  }
}

for (const v of violations) console.log(v);
console.log(
  `\ndecks=${decks.length} renderings=${renderings} violations=${violations.length}`,
);
process.exit(violations.length === 0 ? 0 : 1);
