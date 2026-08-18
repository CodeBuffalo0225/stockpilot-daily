# StockPilot Daily

Turns each day's StockPilot pipeline run into a broadcast-style video — scrolling
ticker tape, verdict board, momentum bars, allocation cards, the day's thesis,
and a self-grading scoreboard.

Two compositions, one set of scenes:

| Composition | Size | Use |
|---|---|---|
| `StockPilotDaily` | 1080×1920 | vertical — Reels / Shorts / LinkedIn |
| `StockPilotDailyLandscape` | 1920×1080 | landscape — desktop / YouTube |

Runtime is computed from the data, not fixed: a nine-position day runs longer
than a two-position day, and a day with no thesis drops that scene instead of
holding on an empty frame.

## Run it

```bash
npm run daily                 # latest available date, vertical
npm run daily -- 2026-08-17   # a specific date
npm run daily -- --both       # vertical + landscape
npm run deck                  # pull the deck only, no render
npm run dev                   # Remotion Studio
```

Output lands in `out/stockpilot-<date>-<format>.mp4`.

## The spine

```
Notion "StockPilot Reports" DB  ─┐
                                 ├─→ Zod ─→ fork gate ─→ DailyDeck ─→ Remotion
~/Documents/stockpilot/reports/ ─┘
```

Precedence is fixed in code (`src/spine/build-deck.ts`), never inferred at runtime:

- **Structured arrays** — momentum, outcomes, rotations, stop notes, alpha
  scores — come from the local pipeline report. The Notion database has no
  columns for them.
- **Thesis, verdict fields, unanswered count** prefer the local report and fall
  back to Notion.
- **Notion alone** is enough to render. On a machine without the pipeline
  checked out, the deck is rebuilt from Notion's text properties and every field
  Notion cannot supply stays `null` rather than being guessed.

The end card names the source (`PIPELINE + NOTION`, `PIPELINE REPORT`,
`NOTION LOG`) so a rendered video can never imply Notion confirmed something it
did not.

### Parsing notes

Notion stores the allocation as a TOON block whose note fields contain commas,
so a row is *not* safely splittable into five values. Only `ticker`, `tier` and
`position_pct` are read from it. Entry notes come from the `Buys` property,
which uses an unambiguous ` — ` delimiter; stop notes come from the local report
and are `null` when only Notion is available.

### Fork gates

Display caps live in `CAPS` (`src/spine/build-deck.ts`): 6 positions, 8 momentum
rows, 5 watches, 24 skips, 28 tape cells, 3 rotations. They exist so a 21-name
scored list cannot push a scene past its safe area. Verdict counts are always
derived from the scored list rather than taken on trust, and a tier whose
position size disagrees with the 5/3/1.5 conviction ladder renders the report's
actual value and emits a warning.

## Configuration

The spine reads `~/Documents/stockpilot/.env` for `NOTION_TOKEN` and
`NOTION_REPORT_DATABASE_ID` so credentials live in one place on the machine.
Override the pipeline location with `STOCKPILOT_DIR`. A local `.env` wins if
present.

Notion is optional. With no credentials the spine runs local-only and says so.

## Disclaimer

Automated research output. Not investment advice. The disclaimer is rendered
into the end card of every video.
