# Loop prompt — paste this into Claude Code at high effort

```
Build StockPilot Daily — a once-a-day board showing what an automated stock-screening
pipeline decided and why, for people who arrive from the investor quiz. It should be at
the level of Robinhood, the best shipped product in this category. Every screen,
interaction, and system should hold up side by side against it.

Break the work into the smallest pieces that can be improved and judged on their own —
you decide the split. Fan out sub-agents: each piece gets a builder and a separate
gauntlet-critic spawned with fresh context. The critic only ever sees the goal, the piece
name, and a pair directory made by `python .gauntlet/gauntlet.py pair` — never the
builder's reasoning or a summary. It picks A or B blind, twice with the order swapped,
and names the single biggest gap. Ours only passes if it wins both. For backend and data
pieces use a measured bar instead: `npm run check` clean on all three source paths, and
`npm test` at 39/39 with zero ungrounded figures.

Don't stop until ours wins. Before each new round run `python .gauntlet/gauntlet.py
status` and obey it — if it says escalate or stop, stop that piece and flag it on the
progress page. After each wave, spawn one fresh agent to smooth seams across pieces. Keep
.gauntlet/progress.html updated with before/after captures so I can watch from my phone.
/loop until it's there.

Start from the current repo; capture v1 of every piece before changing it. Per-piece bars
are in .gauntlet/bars/.
```

## Before the first run

1. `npm i -D playwright && npx playwright install chromium`
2. Set `spend_ceiling_usd` in `.gauntlet/config.json` — it is `null` and the loop has no
   dollar ceiling until you set it.
3. Put reference captures in `.gauntlet/bars/<piece>/` at 390x844. Without them the critic
   has nothing to lose to and the loop degrades into self-grading.
