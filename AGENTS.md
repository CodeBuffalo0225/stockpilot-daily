# AGENTS.md — stockpilot-daily

Codex guidance and handoff for this repository. Read this before touching files.

> Companion files: `CLAUDE.md` holds the same rules for Claude Code — if you
> change a rule here that is also stated there, change both. **`DEPLOY.md` is
> the runbook for shipping to Vercel + hosted Supabase**; read it before
> attempting a deploy, not this file.

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

Stack: Next.js 16.3.1 (App Router) · Remotion 4.0.513 + `@remotion/player` ·
React 19.2.3 · TypeScript strict · Zod 4.4.3 · Supabase (`@supabase/supabase-js`)
· `@notionhq/client` · `tsx` for the CLIs. Node 22. Deploys to Vercel.

The app has three faces over one `DailyDeck` record: the Next.js dashboard with
a live ticker UX, the Remotion Player embedded in it, and the Remotion CLI that
renders MP4s.

## State at handoff (2026-08-22)

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
- ✅ Both full-length MP4s rendered and verified with ffprobe: 1424 frames,
  47.51s, H.264 — 1080×1920 (17.7 MB) and 1920×1080 (22.1 MB).
- ✅ `npm run build` (Next production build) passes.
- ✅ Dashboard verified in a real browser: playback, format toggle, day
  switching, ticker click-through, mobile at 375px with no horizontal overflow.
- ✅ **Supabase exercised for real** against a local stack (`npm run db:start`):
  migration applies, 12 decks + 57 positions + 322 tape rows + 88 momentum rows
  written through `supabase-js`, re-sync confirmed idempotent, dashboard reads
  from Postgres, production build serves it.
- ✅ No credential leak: the served HTML and every static bundle were checked
  for the service role key, the project URL, any JWT-shaped token, and the
  string `service_role`. All absent.
- ⚠️ Never run against **hosted** Supabase — only the local stack, which is the
  same Postgres + PostgREST but not the same network, TLS, or connection limits.
- ⚠️ Not deployed to Vercel. Requires the owner's login.

Two bugs were found by running it that reading could not have caught, both now
fixed — see the data-layer rules below.

### Rendering needs disk headroom

Remotion writes intermediate JPEG frames to the OS temp directory and needs
roughly 1–2 GB for a 1424-frame render. An earlier attempt died at ~frame 1100
with `ENOSPC` when the machine had 394 MB free. If a render fails that way it is
**not a code defect** — check `df -h /System/Volumes/Data` before touching the
render path. To verify something while disk is tight, render a frame range:

```bash
npx remotion render StockPilotDaily out/clip.mp4 --props=data/deck.json --frames=0-150 --jpeg-quality=55
```

**File-safety rule for this machine: do not delete anything to free space.**
Not caches, not `out/`, not temp directories, not "obviously unused" files.
Report what is large and let the owner decide.

## Commands

```bash
npm run dev                   # Next.js dashboard — NOT Remotion Studio
npm run studio                # Remotion Studio
npm run db:start              # local Supabase stack (Docker) + applies migrations
npm run db:env                # write .env.local from the running stack
npm run db:reset              # reapply migrations from scratch (wipes data)
npm run db:stop               # shut the stack down
npm run sync -- --backfill 20 # spine -> Supabase + data/decks/
npm run daily -- --both       # pull + render MP4, vertical and landscape
npm run artifact              # build the shareable single-file preview
npm run check                 # exercise all three spine source paths
npm run build                 # production Next build
npm run lint                  # eslint + tsc  <- run before every commit
```

After `npm run db:reset` the database is empty — re-run `npm run sync` to
repopulate. There is deliberately no `seed.sql`: the decks in `data/decks/` are
the mirror, and a checked-in seed would go stale against them.

Renders land in `out/stockpilot-<date>-<format>.mp4`. Keep review stills in
`out/stills/`.

## Architecture

```
Notion  ─┐
         ├─→ Zod ─→ fork gate ─→ DailyDeck ─→ Supabase ─→ Next.js (Vercel)
local   ─┘                                 └─→ Remotion CLI ─→ MP4
```

```
app/           Next.js App Router. page.tsx is a server component.
components/    Client components: TickerRail, Dashboard.
supabase/migrations/0001_init.sql
src/spine/
  schema.ts      Zod. Lenient *Source shapes in, strict DailyDeck out.
  sources.ts     The two loaders + the Notion text parsers.
  build-deck.ts  Reconciliation, display caps, derived counts.
  store.ts       Read side. Supabase when configured, local files otherwise.
  push-deck.ts   Write side. Upsert jsonb + rewrite child tables.
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

## Data layer rules

- **Never import `src/spine/store.ts` or `push-deck.ts` into a client
  component.** They read `node:fs` and the service role key. Next will fail the
  build, but the reason is worth knowing before you hit it. (`server-only` is
  deliberately NOT used — the sync CLI imports these outside Next's bundler,
  where that package throws.)
- **`SUPABASE_SERVICE_ROLE_KEY` must never be prefixed `NEXT_PUBLIC_`.** RLS has
  no anon policy, so that key is the only thing standing between this data and
  the public. All reads happen in server components.
- Decks are re-validated with Zod on the way OUT of Supabase as well as in.
  The column is `jsonb` and a hand-edit in the Supabase dashboard is exactly the
  kind of thing that puts a broken deck in front of the renderer.
- `npm run sync` must run on the machine that has the pipeline reports. Vercel
  can reach Notion but not `~/Documents/stockpilot`, so a cron there would
  silently produce decks with no momentum, outcomes or rotations. There is no
  Vercel cron for this reason — do not add one without solving that.

## Data layer rules

- **Never read `process.env` at module scope in the spine.** ESM hoists imports
  above a CLI's `dotenv.config()`, so a module-level capture runs FIRST and sees
  nothing. This silently made every sync fall back to local files while
  reporting success. `store.ts` reads the environment lazily on each call; keep
  it that way.
- **`BYPASSRLS` is not a table privilege.** The service role authenticates fine
  and then fails every statement with `permission denied for table daily_decks`
  unless the migration grants explicitly. `0001_init.sql` grants to
  `service_role` and deliberately grants nothing to `anon`/`authenticated` — RLS
  with no policy already denies them, and withholding the grant is the second
  lock.
- **Never import `src/spine/store.ts` or `push-deck.ts` into a client
  component.** They read `node:fs` and the service role key. (`server-only` is
  deliberately NOT used — the sync CLI imports these outside Next's bundler,
  where that package throws.)
- **`SUPABASE_SERVICE_ROLE_KEY` must never be prefixed `NEXT_PUBLIC_`,** and
  never print it. `scripts/use-local-supabase.sh` writes `.env.local` from a
  pipe so the value never reaches a terminal or transcript.
- Decks are re-validated with Zod on the way OUT of Supabase as well as in — the
  column is `jsonb` and a hand-edit in the dashboard is exactly what puts a
  broken deck in front of the renderer.
- `npm run sync` must run on the machine holding the pipeline reports. Vercel
  can reach Notion but not `~/Documents/stockpilot`, so a cron there would
  silently produce decks with no momentum, outcomes or rotations. That is why
  there is no Vercel cron — do not add one without solving it.

## Non-obvious constraints — read before editing

1. **Notion's `Allocation` property is a TOON block whose note fields contain
   commas.** A row is therefore *not* splittable into five values. Only
   `ticker`, `tier`, `position_pct` are parsed from it. Entry notes come from
   the `Buys` property, which uses an unambiguous ` — ` (em dash) delimiter.
   Stop notes come from the local report and are `null` when only Notion is
   available. Do not "fix" the TOON parser with a CSV split — it will silently
   corrupt notes.

2. **There are TWO ticker implementations and they work differently on
   purpose.** The Remotion one (`src/video/components/TickerTape.tsx`) computes
   exact cell widths from the monospace advance because a deterministic render
   cannot measure the DOM. The web one (`components/TickerRail.tsx`) duplicates
   the list and animates to `-50%`, which loops seamlessly at any width. Do not
   "unify" them — the constraints are genuinely different. The web rail also
   pauses on hover and is disabled under `prefers-reduced-motion`; keep both.

3. **The Remotion tape computes cell widths; it does not measure them.** The tape
   is set in JetBrains Mono, whose advance width is a fixed `0.6em`, so exact
   pixel widths are known before layout. This is what keeps the loop seamless
   (the strip is drawn twice and translated by exactly one strip width) and the
   render deterministic. **Switching the tape to a proportional font breaks the
   loop.** If you change the tape font, it must stay monospaced and
   `CHAR_ADVANCE` must be updated to match.

4. **The scale unit derives from the shorter edge** (1080 in both formats), so
   type is physically identical in vertical and landscape. Branch layout on
   `isVertical`, never on raw pixel width. Every px value multiplies by `u` —
   no bare pixel constants in scenes.

5. **`SceneShell fill={…}` is only safe on sparse scenes.** It narrows the inner
   box by the same factor before scaling so content still lands inside the
   horizontal safe area. `Momentum` and `Allocation` deliberately leave it at 1
   — raising it overflows the frame at the max display caps.

6. **All frame constants live in `src/video/timing.ts`.** Do not scatter frame
   numbers through scene files. A scene whose computed duration is 0 is skipped
   — that is how data-driven omission works (e.g. no thesis ⇒ no thesis scene).

7. **Display caps in `CAPS` (`build-deck.ts`) are load-bearing**: 6 positions,
   8 momentum rows, 5 watches, 24 skips, 28 tape cells, 3 rotations. They exist
   so a 21-name scored list cannot push a scene past its safe area. Raising one
   means re-rendering that scene's stills and checking the safe area.

8. Verdict counts are **always derived** from the scored list, never taken on
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

1. **Deploy — follow `DEPLOY.md`.** It covers the hosted Supabase project, the
   Vercel env vars, the credential-leak check, and the one step that cannot be
   done from a cloud agent: populating the database from the pipeline reports on
   the owner's laptop.
3. Optional: audio bed, and a scheduled daily `npm run sync` on the pipeline
   machine. `stockpilot-daily` in `~/.claude/scheduled-tasks/` schedules the
   *pipeline*, not this app.
