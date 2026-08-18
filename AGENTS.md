# AGENTS.md — stockpilot-daily

Codex guidance and handoff for this repository. Read this before touching files.

> Companion file: `CLAUDE.md` holds the same rules for Claude Code. If you
> change a rule here that is also stated there, change both.

## What this repo is

A Remotion app that renders each day's **StockPilot** pipeline run as a
broadcast-style video: scrolling ticker tape, verdict board, momentum bars,
allocation cards, the day's thesis, and a self-grading scoreboard.

It is a **consumer** of the StockPilot pipeline, which lives separately at
`~/Documents/stockpilot`. That directory is **read-only from here** — never
write to it, never modify it, never "fix" it as part of a change here. If the
pipeline looks wrong, report it; do not edit it.

Two compositions off one shared scene set:

| Composition ID | Size | Use |
|---|---|---|
| `StockPilotDaily` | 1080×1920 | vertical, **primary** — Reels / Shorts / LinkedIn |
| `StockPilotDailyLandscape` | 1920×1080 | landscape — desktop / YouTube |

Stack: Remotion 4.0.513 · React 19.2.3 · TypeScript strict · Zod 4.4.3 ·
`@notionhq/client` 2.2.15 · `tsx` for the CLIs. Node 22.

## State at handoff (2026-08-18)

Everything below is verified, not assumed.

- ✅ Spine runs end to end against real data, pulling from **both** sources
  (`source: local+notion`), zero warnings.
- ✅ `npm run check` passes all three source paths: merged, local-only,
  Notion-only.
- ✅ `npm run lint` (eslint + tsc) clean.
- ✅ Both compositions register; duration computes from data (1424 frames /
  47.47s for the 2026-08-17 deck).
- ✅ Stills rendered and **visually inspected** across all 8 scenes in both
  orientations.
- ✅ A 151-frame render produced valid H.264 1080×1920 @30fps (ffprobe
  confirmed).
- ❌ **No full-length MP4 has ever been produced.** See the blocker below.

### The one open blocker: disk space, not code

A full render fails at roughly frame 1100/1424:

```
Error: ENOSPC: no space left on device, write
    at async screenshotTask (.../@remotion/renderer/dist/screenshot-task.js:69:13)
```

The machine had **394Mi free of 466Gi**. Remotion writes intermediate JPEG
frames to the OS temp directory and needs roughly 1–2 GB for a render this
length. This reproduced at `--jpeg-quality=50 --concurrency=2`.

**Do not treat this as a code defect and do not refactor the render path to
chase it.** The first step is to confirm free space:

```bash
df -h /System/Volumes/Data
```

Once there is >2 GB free, the deliverable is one command:

```bash
npm run daily -- --both
```

If you must verify something while disk is still tight, render a frame range
instead — this is known to work:

```bash
npx remotion render StockPilotDaily out/clip.mp4 --props=data/deck.json --frames=0-150 --jpeg-quality=55
```

**File-safety rule for this machine: do not delete anything to free space.**
Not caches, not `out/`, not temp directories, not "obviously unused" files.
Report what is large and let the owner decide.

## Commands

```bash
npm run daily                 # pull latest deck + render vertical
npm run daily -- 2026-08-17   # a specific date
npm run daily -- --both       # vertical + landscape
npm run daily -- --landscape  # landscape only
npm run deck                  # pull deck only -> data/deck.json (no render)
npm run check                 # exercise all three source paths
npm run dev                   # Remotion Studio
npm run lint                  # eslint + tsc  <- run before every commit
```

Renders land in `out/stockpilot-<date>-<format>.mp4`. Keep review stills in
`out/stills/`.

## Architecture

```
Notion "StockPilot Reports" DB  ─┐
                                 ├─→ Zod ─→ fork gate ─→ DailyDeck ─→ Remotion
~/Documents/stockpilot/reports/ ─┘
```

```
src/spine/
  schema.ts      Zod. Lenient *Source shapes in, strict DailyDeck out.
  sources.ts     The two loaders + the Notion text parsers.
  build-deck.ts  Reconciliation, display caps, derived counts.
  fetch-deck.ts  CLI: resolve date -> build -> write data/deck.json
src/video/
  theme.ts       Colours, fonts, formatters.
  layout.ts      useLayout(): scale unit, safe area, type ramp.
  timing.ts      buildTimeline(): the ONLY source of frame constants.
  StockPilotDaily.tsx   Assembles backdrop + tapes + sequenced scenes.
  components/    Backdrop, TickerTape, Hud, SceneShell, Primitives.
  scenes/        Open, Scan, Verdicts, Momentum, Allocation, Thesis,
                 Scoreboard, EndCard.
scripts/
  daily.ts          Pull + render driver.
  check-sources.ts  Per-path diagnostic.
```

### Source precedence — fixed in code, never inferred

- **Structured arrays** — momentum, outcomes, rotations, stop notes, alpha
  scores — come from the **local report only**. The Notion database has no
  columns for them. Do not attempt to synthesize them from Notion.
- **Thesis, verdict fields, unanswered count** prefer local, fall back to Notion.
- **Notion alone is enough to render.** Fields Notion cannot supply stay `null`
  rather than being guessed, and `buildDeck` emits a warning.

The end card renders the source label (`PIPELINE + NOTION` / `PIPELINE REPORT` /
`NOTION LOG`). **Keep it.** It is what stops a shared clip from implying Notion
confirmed data it never held.

## Non-obvious constraints — read before editing

1. **Notion's `Allocation` property is a TOON block whose note fields contain
   commas.** A row is therefore *not* splittable into five values. Only
   `ticker`, `tier`, `position_pct` are parsed from it. Entry notes come from
   the `Buys` property, which uses an unambiguous ` — ` (em dash) delimiter.
   Stop notes come from the local report and are `null` when only Notion is
   available. Do not "fix" the TOON parser with a CSV split — it will silently
   corrupt notes.

2. **The ticker tape computes cell widths; it does not measure them.** The tape
   is set in JetBrains Mono, whose advance width is a fixed `0.6em`, so exact
   pixel widths are known before layout. This is what keeps the loop seamless
   (the strip is drawn twice and translated by exactly one strip width) and the
   render deterministic. **Switching the tape to a proportional font breaks the
   loop.** If you change the tape font, it must stay monospaced and
   `CHAR_ADVANCE` must be updated to match.

3. **The scale unit derives from the shorter edge** (1080 in both formats), so
   type is physically identical in vertical and landscape. Branch layout on
   `isVertical`, never on raw pixel width. Every px value multiplies by `u` —
   no bare pixel constants in scenes.

4. **`SceneShell fill={…}` is only safe on sparse scenes.** It narrows the inner
   box by the same factor before scaling so content still lands inside the
   horizontal safe area. `Momentum` and `Allocation` deliberately leave it at 1
   — raising it overflows the frame at the max display caps.

5. **All frame constants live in `src/video/timing.ts`.** Do not scatter frame
   numbers through scene files. A scene whose computed duration is 0 is skipped
   — that is how data-driven omission works (e.g. no thesis ⇒ no thesis scene).

6. **Display caps in `CAPS` (`build-deck.ts`) are load-bearing**: 6 positions,
   8 momentum rows, 5 watches, 24 skips, 28 tape cells, 3 rotations. They exist
   so a 21-name scored list cannot push a scene past its safe area. Raising one
   means re-rendering that scene's stills and checking the safe area.

7. Verdict counts are **always derived** from the scored list, never taken on
   trust from any source.

## Rules for changes

- Build deterministic, frame-driven animation from `useCurrentFrame()` /
  `interpolate()` / `spring()`. **CSS transitions and CSS animations are
  forbidden — they do not render.** No unseeded randomness. No network requests
  at render time.
- Keep `interpolate()` inline in the `style` prop; prefer `scale` / `translate`
  / `rotate` over `transform` strings (keeps Studio edits writable).
- Adding a scene means updating three places: the `SceneId` union, the `SCENES`
  map in `StockPilotDaily.tsx`, and the `lengths` table in `timing.ts`.
- Respect the safe area. At 1080px width: key text ≥80px from the sides,
  ≥100px from top/bottom; headline ≥84px, important supporting text ≥44px.
- Run `npm run lint` before committing. Run `npm run check` after any change to
  `src/spine/`.
- **Verify visually.** Render stills at the scene boundaries you touched and
  actually look at them before claiming the change works. Console output is not
  verification.
- **Never claim a render exists unless the file was produced.** Report the
  composition ID, duration, fps, resolution, output path, and what you verified.
- Do not delete files as part of unrelated work.

## Credentials

The spine reads `~/Documents/stockpilot/.env` for `NOTION_TOKEN` and
`NOTION_REPORT_DATABASE_ID` so credentials live in one place on the machine.
Override the pipeline location with `STOCKPILOT_DIR`. A local `.env` wins if
present, and both are gitignored. Notion is optional — with no credentials the
spine runs local-only and says so.

Never print a token, and never commit one.

## Known loose end

`src/Composition.tsx` is leftover scaffold from `create-video` and is imported
by nothing. It was deliberately left in place rather than deleted. Remove it
only if the repo owner asks.

## Suggested next steps

1. Free disk space (owner's decision), then `npm run daily -- --both` to produce
   the first full-length renders and confirm both formats end to end.
2. Watch the finished MP4 for tape-loop continuity across scene cuts — the loop
   is verified by construction and in stills, but has never been checked over a
   full 47s playback.
3. Optional: audio bed + a scheduled daily run. There is currently no audio and
   no cron; `stockpilot-daily` in `~/.claude/scheduled-tasks/` schedules the
   *pipeline*, not this renderer.
