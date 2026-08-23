# StockPilot Daily

A deployable app around the daily StockPilot run: a **Supabase** spine, a
**Vercel**-hosted Next.js front end with a live ticker UX, and the day's brief
rendered as video by **Remotion** — playable in the browser and renderable to
MP4.

```
Notion "StockPilot Reports" ─┐
                             ├─→ Zod ─→ fork gate ─→ DailyDeck ─→ Supabase ─→ Next.js (Vercel)
~/Documents/stockpilot/       ┘                                                  ├─ ticker UX
  reports/*.json                                                                 └─ Remotion Player
                                                             DailyDeck ─→ Remotion CLI ─→ MP4
```

The `DailyDeck` is the contract. Everything downstream — the dashboard, the
ticker, both video formats — renders from that one validated record.

## Quick start

Without a database — runs on local deck files, good enough to see everything:

```bash
npm install
npm run sync -- --backfill 20   # pull decks from the pipeline
npm run dev                     # http://localhost:3000
```

With a real database — a full Supabase stack on your machine (needs Docker):

```bash
npm install
npm run db:start                # boots Postgres + PostgREST, applies migrations
npm run db:env                  # writes .env.local, never printing the key
npm run sync -- --backfill 20   # now writes to Postgres
npm run dev                     # badge reads "Supabase"
```

`npm run db:stop` shuts it down; `npm run db:reset` reapplies migrations from
scratch. The local stack is the same Postgres and PostgREST that Supabase runs
in production, so the code path the app takes is identical — only the URL and
key differ.

| Command | Does |
|---|---|
| `npm run dev` | Next.js dev server — the dashboard |
| `npm run sync` | pull latest deck through the spine → Supabase + `data/decks/` |
| `npm run sync -- 2026-08-17` | one specific day |
| `npm run sync -- --backfill 20` | last 20 local report dates |
| `npm run daily -- --both` | pull + render MP4, vertical and landscape |
| `npm run studio` | Remotion Studio |
| `npm run check` | verify all three spine source paths |
| `npm run build` | production Next build |
| `npm run artifact` | build the self-contained shareable preview |
| `npm run db:start` / `db:stop` | local Supabase stack (Docker) |
| `npm run db:env` | point `.env.local` at the local stack |
| `npm run lint` | eslint + tsc |

## The spine

Source precedence is fixed in code (`src/spine/build-deck.ts`), never inferred:

- **Structured arrays** — momentum, outcomes, rotations, stop notes, alpha
  scores — come from the local pipeline report. The Notion database has no
  columns for them.
- **Thesis, verdict fields, unanswered count** prefer local, fall back to Notion.
- **Notion alone is enough to render.** Fields Notion cannot supply stay `null`
  rather than being guessed, and the build emits a warning.

The video's end card names the source (`PIPELINE + NOTION` / `PIPELINE REPORT` /
`NOTION LOG`), so a shared clip can never imply Notion confirmed data it never
held. The dashboard shows the same thing as a badge.

Display caps live in `CAPS`: 6 positions, 8 momentum rows, 5 watches, 24 skips,
28 tape cells, 3 rotations. They keep a 21-name scored list from pushing a scene
past its safe area. Verdict counts are always derived from the scored list, never
taken on trust.

### Notion parsing

Notion stores the allocation as a TOON block whose note fields contain commas,
so a row is **not** splittable into five values. Only `ticker`, `tier` and
`position_pct` are read from it. Entry notes come from the `Buys` property,
which uses an unambiguous ` — ` delimiter. Stop notes come from the local report
and are `null` when only Notion is available. Lines that do not parse are
dropped — the pipeline writes `(none)` on a no-BUY day, and salvaging that
produced a position card reading `(none) 0%`.

## Supabase

Apply `supabase/migrations/0001_init.sql`. Four tables:

- `daily_decks` — one row per day. The full validated deck lives in a `jsonb`
  column; scalar columns beside it exist for listing without loading every deck.
- `deck_positions`, `deck_tape`, `deck_momentum` — the same data shredded so it
  can be queried **across** days (`select * from deck_positions where ticker='NVDA'`).
  Derived from the same in-memory deck as the jsonb, so they cannot disagree.

Child rows are deleted and rewritten on each sync rather than merged, so a
re-run with fewer positions shrinks the day instead of leaving orphans. Upsert
on `date` makes re-running a day idempotent.

**Security posture: RLS is on with no anon policy.** Nothing reads this with a
publishable key. The Next.js app queries server-side with the service role, so
the browser never receives a Supabase credential and the allocations are not one
leaked key away from being public. If you ever want a public read-only view, add
an explicit anon policy and understand what it exposes.

Without `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` the app falls back to
`data/decks/*.json` and the dashboard badge says **Local files** — the degraded
state is visible rather than silent.

## Deploying

**Where sync runs matters.** The pipeline reports only exist on your machine, so
`npm run sync` runs *there* and pushes to Supabase. Vercel only ever reads. A
cron on Vercel could reach Notion but not the local reports, and would silently
produce decks with no momentum, outcomes or rotations — so there isn't one.

1. Create a Supabase project, run the migration in the SQL editor.
2. Push this repo to GitHub and import it at vercel.com.
3. Add environment variables in Vercel (Project → Settings → Environment
   Variables) — **`SUPABASE_SERVICE_ROLE_KEY` must not be prefixed
   `NEXT_PUBLIC_`**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy. Then locally: `npm run sync -- --backfill 30` to populate.

Or with the CLI:

```bash
npm i -g vercel && vercel link && vercel env add SUPABASE_URL && vercel --prod
```

## The video

| Composition | Size | Use |
|---|---|---|
| `StockPilotDaily` | 1080×1920 | vertical — Reels / Shorts / LinkedIn |
| `StockPilotDailyLandscape` | 1920×1080 | landscape — desktop / YouTube |

Runtime is computed from the data: a nine-position day runs longer than a
two-position day, and scenes with nothing to show are dropped rather than held
on an empty frame. 2026-08-17 renders 47.5s; 2026-07-17, a no-BUY day, renders
30.2s with the allocation and momentum scenes absent.

Full MP4 renders need roughly 1–2 GB free disk for intermediate frames.

## Disclaimer

Automated research output. Not investment advice. Rendered into the end card of
every video.
