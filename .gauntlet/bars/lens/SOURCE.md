# lens — no visual bar, judged by a measured one

Robinhood publishes no comparable surface. It has no "read this day through your
investor profile" panel, so there is nothing to pair against; see ../ask/SOURCE.md
for the three sources already rejected and why a cross-surface pair is worthless.

## The bar

`.gauntlet/probe-lens.ts`. **Zero violations** across every lens rendering — 8
archetypes × (5 AI postures + none) × 15 decks = 720 renderings — on four rules:

1. **ADVICE** — no prescriptive or personalised advice in any lens prose. This is the
   compliance boundary: publishing the same calls to everyone is not advice; selecting
   or sizing securities per person from a questionnaire is.
2. **NODISC** — the `SAME_CALLS` disclaimer present on every rendering.
3. **UNGROUND / MISREAD** — every figure in `points` traceable to a number the deck
   holds, and no figure in framing copy sitting beside a ticker from this deck.
4. **SAMETEXT** — no two archetypes receive the same framing sentence. A lens that
   reads identically for everyone is a label on nothing.

## Round 1 failed, and the defect was in this bar

120 violations, all one sentence in the thrill-seeker caution: *"A 50% loss needs a
100% gain to get back to even."*

That is arithmetic, not a claim about the deck, and `src/lens/lens.ts` only ever
promises that figures in **`points`** are read off the deck. The first version of this
probe applied that promise to `caution` and `aiNote` as well, so it failed the product
for keeping a promise nobody made.

**The fix went into the bar, not the product. No product code changed for this round.**
Recording it any other way would claim a defect that did not exist.

The rule was split rather than dropped, because the underlying worry is real — a
reader should never mistake didactic copy for a claim about a real position. `points`
must still be fully traceable, and framing copy may carry a general figure only if no
ticker from that deck appears in the same sentence. `"AMD could fall 40% from here"`
fails; the 50/100 sentence passes.

## Round 2: 0 violations across 720 renderings

Before recording, each rule was proven to fire on a crafted violation — advice,
ungrounded figure, figure-beside-ticker — and proven not to fire on the clean
didactic sentence. A bar that cannot fail is not a bar.
