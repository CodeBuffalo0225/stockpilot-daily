# Deploying StockPilot Daily

Production: **https://stockpilot-board.vercel.app** — Vercel project `stockpilot-board`
(Hobby plan, account `tsm5110-6848`).

The project is not called `stockpilot-daily`. That project exists and blocks every
deployment after its first — see failure mode 2 for why, and for the likely fix.

## Why this deploys from the CLI, not from git

`data/decks/` is gitignored on purpose — the pipeline reports exist only on the
machine that ran the pipeline (see AGENTS.md). `.vercelignore` replaces
`.gitignore` for uploads, so a CLI deploy from that machine ships the decks and a
git-connected deploy would not. A git-push deploy would build fine and then show
"No decks yet" forever.

```bash
cd ~/Projects/stockpilot-daily && npx vercel --prod --yes
```

Run it from the pipeline machine, after `npm run sync`, so the decks in the build
are current.

## Failure modes that do not announce themselves

**1. Framework detected as "Other".** Vercel guessed wrong on the first deploy.
It ran the build, then served the repo as static files — no root `index.html`, so
every route 404'd while the CLI reported Ready in 37 seconds. `vercel.json` now
pins `"framework": "nextjs"`. Check it with:

```bash
npx vercel project inspect stockpilot-daily
```

`Framework Preset` must read `Next.js`. If it reads `Other`, nothing else below
matters — the site is not being served, whatever the deploy output said.

**2. `readyState: BLOCKED` — and the likely cause was a command in this runbook.**
The deployment is created, never builds, emits no build events, and the CLI sits on
"Building…" until it dies with `fetch failed` or `Not authorized`. `vercel ls` shows
status `UNKNOWN`, which reads like "queued" and is not.

It happened to both `stockpilot-daily` and `stockpilot-board` on 2026-09-22, in the
same order each time: the first deploy went Ready, then `protection disable --sso`
was run, then every deploy after that blocked. Diffing every project setting against
the projects that deploy fine turned up exactly one difference:

| Project | `ssoProtection` | Deploys |
| --- | --- | --- |
| investor-quiz | `all_except_custom_domains` (default) | fine |
| packcatch-activity | `all_except_custom_domains` (default) | fine |
| stockpilot-board | `null` (disabled) | blocked after first |
| stockpilot-daily | `null` (disabled) | blocked after first |

That is two for two either way, which is a strong correlation and not yet a proof —
nobody has re-enabled protection and watched a deploy go through. Things ruled out
first, each by a test rather than a guess: the account (investor-quiz deployed Ready
in the middle of it), the build (`--prebuilt` blocked the same), size (1-2 MB), and
concurrent deploys (one clean deploy with nothing else running still blocked).

**The next step, and the first thing to try when this recurs:**

```bash
npx vercel project protection enable stockpilot-board --sso
npx vercel --prod --yes
```

If that deploy goes Ready, the cause is confirmed and this section should say so. If
it still blocks, the cause is something else and the fallback is a fresh project:

```bash
npx vercel link --yes --project <new-name>
npx vercel env add QUIZ_URL production            # env vars do not follow
npx vercel --prod --yes
```

Read the real state with:

```bash
npx vercel inspect <deployment-url>
```

and if that says `UNKNOWN`, the API is more honest:
`GET https://api.vercel.com/v13/deployments/<host>` → `readyState`.

**3. Do not disable deployment protection to make the site public.** The default,
`all_except_custom_domains`, protects per-deployment URLs and the team alias
(`<project>-<team>.vercel.app` redirects to a Vercel login) but leaves the
production domain — `stockpilot-board.vercel.app` — public. That redirect on the team
alias is what made protection look like the problem on 2026-09-22. It wasn't: the
production domain was 404ing because of failure mode 1. Disabling protection fixed
nothing and is the prime suspect for failure mode 2.

**4. Never deploy `--prebuilt` from a checkout that holds `.env.local`.** Vercel's
Next builder (`@vercel/next`) adds every `.env*` file in the build directory to every
function it emits, whatever Next's `outputFileTracingExcludes` says — so a local
`vercel build` puts `.env.local`, and the Supabase service role key in it, into every
function in `.vercel/output`. Today `.vercelignore` drops it on upload and the CLI
warns; the CLI also says a coming release will fail that deploy instead. A source
deploy (`npx vercel --prod`) never uploads `.env.local` in the first place, so the
remote builder never sees it. On 2026-09-22 the live deployment's file tree was
checked: no `.env.local`, and the one env file present, `.env.example`, holds only
empty values.

## Environment

| Variable | Set? | Effect when unset |
| --- | --- | --- |
| `QUIZ_URL` | yes, on `stockpilot-board` | No invite link on the board. Never a link to nowhere. |
| `ANTHROPIC_API_KEY` | **no, deliberately** | `/api/ask` returns `no_key` and the deterministic answerer runs. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | no | Store falls back to the local deck files traced into the build. |

Leave `ANTHROPIC_API_KEY` unset until `/api/ask` is behind a Vercel Firewall rate
limit. The route is public and every call would spend real money.

## The loop with the quiz

The quiz reads `STOCKPILOT_DAILY_URL` (set to `https://stockpilot-board.vercel.app`) and returns `daily:` from `/api/submit`,
null until that variable is set. Only archetype and AI posture travel in the URL —
no name, no email, no answers. Vercel injects env vars at deploy time, so setting
the variable is not enough; the quiz has to be redeployed after.
