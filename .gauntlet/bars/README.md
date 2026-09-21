# Bars

One directory per piece, holding the reference artifact the critic compares ours against.
Captures must be at the **same viewport as ours** (390x844) or the comparison stops being
blind — the critic can tell which is which from the framing.

| Piece | Bar | How to get it |
|---|---|---|
| `board` (the day's verdicts + allocation at a glance) | **Robinhood** home/positions screen | Screenshot the app at 390x844, or use its App Store screenshots |
| `momentum` (the ranked screen) | **TradingView** screener on mobile web | tradingview.com/screener at 390x844 |
| `ask` (the question panel) | **Robinhood** "Learn"/answer surfaces, or Perplexity mobile | screenshot at 390x844 |
| `lens` (the profile panel) | **Robinhood** first-run / education cards | screenshot at 390x844 |
| `spine` (deck build + validation) | measured: `npm run check` clean on all three source paths | no A/B — measured |
| `ask-grounding` (agent correctness) | measured: `npm test` 39/39, zero ungrounded figures | no A/B — measured |

## Reachable vs not

Robinhood is a native brokerage app. Some of it is **unreachable in principle** from a
server-rendered Next.js board, and the critic must not be looped against it:

- order execution, account balances, anything requiring a broker
- real-time streaming ticks (this app is a once-a-day batch pipeline)
- native haptics, app-launch animation, push

What *is* fair game and is what the bar is for: density, hierarchy, typography, colour
discipline, how fast the eye finds today's state, chart craft, empty and error states,
and how the thing feels on a phone.
