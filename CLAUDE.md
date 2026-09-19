# CLAUDE.md — stockpilot-daily

Remotion app that renders the daily StockPilot run as a video. Sits downstream
of the pipeline at `~/Documents/stockpilot` and **never writes to it** — that
repo is read-only from here.

## Stack

Next.js 16 (App Router) on Vercel · Supabase spine · Remotion 4.0.513 +
`@remotion/player` · React 19 · TypeScript (strict) · Zod 4 ·
`@notionhq/client` · tsx for the CLIs.

## Commands

```bash
npm run dev                 # Next.js dashboard  <- not Studio any more
npm run studio              # Remotion Studio
npm run sync                # spine -> Supabase + data/decks/
npm run sync -- --local     # data/decks/ only (Docker/Supabase down)
npm test                    # lens tests
npm run daily -- --both     # pull deck + render both formats
npm run lint                # eslint + tsc
npx remotion still StockPilotDaily out/x.png --frame=450 --scale=0.5
```

## Investor lens (full rules in AGENTS.md)

`/?lens=<archetype>&ai=<posture>` reframes the day's board for one investor's
profile. The link comes from the investor-quiz repo when someone finishes it.

- **A lens changes emphasis, never a call.** Same tickers, verdicts, tiers and
  sizes for every viewer. Picking securities or sizes per person from a
  questionnaire is personalised investment advice; framing the same calls
  differently is not. `buildLens` must stay read-only — a test deep-compares
  the deck before and after.
- **Every figure in a lens point comes off the deck.** No model runs. A point
  whose data is missing is dropped, not filled. `npm test` checks every number
  in every point against the numbers the deck holds; plant an invented one and
  it fails naming the line.
- **The keys are a contract with investor-quiz** (`public/lens.js`). Both repos
  pin the exact lists in tests, because an unknown `?lens=` quietly means no
  lens — the link still opens, just untailored.
- **Built on the server.** `page.tsx` builds the view beside the validated deck
  and passes plain prose down. Do not import `src/lens/lens.ts` into a client
  component; it would pull zod into the browser bundle for nothing.
- **Folded, never hidden.** A lens may fold the Momentum and Rotation cards into
  a `<details>`; the data stays one click away.
- **`QUIZ_URL`** (optional, read at request time — deliberately not
  `NEXT_PUBLIC_`) shows the "take the profile" invite when no lens is active.
  Unset means no invite, never a dead link.

## Data layer

`src/spine/store.ts` (read) and `push-deck.ts` (write) are server-only by
construction — never import them into a client component. The service role key
bypasses RLS and must never be `NEXT_PUBLIC_`. Decks are re-validated on the way
out of Supabase, not just on the way in. `npm run sync` must run on the machine
holding the pipeline reports; Vercel cannot see them.

## Layout rules

- Scale unit `u` derives from the **shorter** edge (1080 in both formats), so
  type is physically identical in vertical and landscape. Only arrangement
  changes — branch on `isVertical`, never on raw pixel width.
- Every px value multiplies by `u`. No bare pixel constants in scenes.
- Sparse scenes pass `fill={1.1–1.2}` to `SceneShell` for the vertical cut; the
  shell narrows the inner box by the same factor before scaling, so content
  still lands inside the horizontal safe area. Dense scenes (momentum,
  allocation) leave `fill` at 1 — raising it will overflow at max caps.
- All frame constants resolve from `src/video/timing.ts`. Do not scatter frame
  numbers through scene files.

## Non-obvious constraints

- **Two ticker implementations, deliberately different.** Remotion's computes
  exact cell widths (a deterministic render cannot measure the DOM); the web
  rail duplicates the list and animates to -50%. Do not unify them.
- **The Remotion tape computes its cell widths rather than measuring them.** It is
  set in JetBrains Mono (0.6em advance), so widths are known before layout,
  which keeps the loop seamless and the render deterministic. Changing the tape
  font to a proportional face breaks the loop.
- **Notion's `Allocation` TOON rows cannot be split on commas** — the note
  fields contain them. See the parsing notes in README.
- Adding a scene means adding it to `SceneId`, `SCENES`, and the `lengths`
  table. A scene with duration 0 is skipped, which is how data-driven omission
  works.
- CSS transitions/animations are forbidden — they do not render. Animate from
  `useCurrentFrame()`.

## Rendering

Full renders need roughly 1–2 GB of free disk for intermediate frames. A render
that dies with `ENOSPC` is a disk problem, not a code problem — check
`df -h /System/Volumes/Data` before touching the render path. Lower
`--jpeg-quality` or render a frame range to shrink the temp footprint.

Both formats last rendered clean on 2026-08-19: 1424 frames, 47.51s.

## Verified / unverified

Supabase runs for real against the **local** stack (`npm run db:start`) —
migration applies, 12 decks sync, re-sync is idempotent, the dashboard reads
from Postgres, and the production build serves it with no credential in the
client bundle. It has **never** run against hosted Supabase, and it has never
been deployed to Vercel.

Two bugs only surfaced by running it: `store.ts` read `process.env` at module
scope (ESM hoisting meant the CLI's dotenv ran too late, so syncs silently fell
back to local files), and the migration granted no table privileges to
`service_role` (`BYPASSRLS` is not a grant). Both fixed — do not reintroduce
either pattern.
