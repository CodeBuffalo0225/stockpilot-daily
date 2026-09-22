# Deploying StockPilot Daily

Production: Vercel project `stockpilot-daily` (Hobby plan, account `tsm5110-6848`).

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

## Three failure modes that do not announce themselves

**1. Framework detected as "Other".** Vercel guessed wrong on the first deploy.
It ran the build, then served the repo as static files — no root `index.html`, so
every route 404'd while the CLI reported Ready in 37 seconds. `vercel.json` now
pins `"framework": "nextjs"`. Check it with:

```bash
npx vercel project inspect stockpilot-daily
```

`Framework Preset` must read `Next.js`. If it reads `Other`, nothing else below
matters — the site is not being served, whatever the deploy output said.

**2. `readyState: BLOCKED`.** A burst of deploys trips a Vercel rate limit. The
deployment is created, never builds, emits no build events, and the CLI sits on
"Building…" indefinitely. `vercel ls` shows status `UNKNOWN`, which is not the
same as queued. It clears on its own — investor-quiz hit it on 2026-09-20 and
deployed normally the next morning. Retrying immediately just adds another
blocked deployment. Read the real state with:

```bash
npx vercel inspect <deployment-url>
```

and if that says `UNKNOWN`, the API is more honest:
`GET https://api.vercel.com/v13/deployments/<host>` → `readyState`.

**3. SSO deployment protection.** A new project may have it on, which sends every
visitor to a Vercel login. Public MVP means it must be off:

```bash
npx vercel project protection disable stockpilot-daily --sso
```

## Environment

| Variable | Set? | Effect when unset |
| --- | --- | --- |
| `QUIZ_URL` | yes | No invite link on the board. Never a link to nowhere. |
| `ANTHROPIC_API_KEY` | **no, deliberately** | `/api/ask` returns `no_key` and the deterministic answerer runs. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | no | Store falls back to the local deck files traced into the build. |

Leave `ANTHROPIC_API_KEY` unset until `/api/ask` is behind a Vercel Firewall rate
limit. The route is public and every call would spend real money.

## The loop with the quiz

The quiz reads `STOCKPILOT_DAILY_URL` and returns `daily:` from `/api/submit`,
null until that variable is set. Only archetype and AI posture travel in the URL —
no name, no email, no answers. Vercel injects env vars at deploy time, so setting
the variable is not enough; the quiz has to be redeployed after.
