# Gauntlet Loop — StockPilot Daily

Built with the `gauntlet-loop-builder` skill. The bar is **Robinhood**.

## Run it

```bash
npm i -D playwright && npx playwright install chromium   # once, for captures
# set spend_ceiling_usd in .gauntlet/config.json         # required before the first run
```

Then start the app (`npm run dev`), paste the loop prompt from `loop-prompt.md` into
Claude Code at high effort, and open `.gauntlet/progress.html` to watch.

## What the script does

```bash
python .gauntlet/gauntlet.py pair   --piece board --round 1 --ours shots/board.png --bar bars/board/bar.png
python .gauntlet/gauntlet.py record --piece board --round 1 --o1 <verdict1.json> --o2 <verdict2.json>
python .gauntlet/gauntlet.py record --piece spine --round 1 --measured --ours-value 39 --bar-value 39
python .gauntlet/gauntlet.py status --piece board   # obey it before starting a round
```

`pair` writes two directories with the order swapped and the filenames stripped to `A.*`
and `B.*`. `status` returns STOP on the wall-clock ceiling and ESCALATE when the critic
names the same gap three rounds running.

## What is enforced where

| Gate | Enforced by |
|---|---|
| Wall clock (8h) | `gauntlet.py status` — code |
| Plateau (same gap 3x → escalate to Travis) | `gauntlet.py status` — code |
| Two-order rule (a win needs both orderings) | `gauntlet.py record` — code |
| Dollar ceiling | **Not code.** Claude Code exposes no spend hook; the lead agent checks `/cost` each wave and stops at 90%. |

## Honesty

The bar is a direction, not a promise. Shumer's own critic log shows the real product
winning every logged round. The value here is that the loop refuses to stop at "pretty
good for AI" — not that it reaches Robinhood. Do not report a piece as beating the bar
unless `log.jsonl` shows two-order wins for it.

Parts of Robinhood are unreachable in principle from this stack — order execution,
streaming ticks, native haptics. They are listed in `bars/README.md` and must not be
looped on.
