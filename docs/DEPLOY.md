# Deploying StockPilot Daily

Production: **https://stockpilotdaily.vercel.app** — Vercel project `stockpilotdaily`
(Hobby plan, account `tsm5110-6848`).

This is the third project. `stockpilot-daily` and `stockpilot-board` both still exist,
both still serve their one successful deployment, and both refuse every deploy after
it. So does this one. See failure mode 2 before deploying anything.

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

**2. `readyState: BLOCKED` after the first deploy — cause unknown, unresolved.**
The deployment is created, never builds, emits no build events, and the CLI sits on
"Building…" until it dies with `fetch failed` or `Not authorized`. `vercel ls` shows
`UNKNOWN`, which reads like "queued" and is not.

Every StockPilot project on this account has done it, identically: the first
production deploy goes Ready, and every deploy after it blocks.

| Project | First deploy | Later deploys | Protection |
| --- | --- | --- | --- |
| stockpilot-daily | Ready | all blocked | disabled |
| stockpilot-board | Ready | all blocked | disabled |
| stockpilotdaily | Ready | blocked | **default, never touched** |
| investor-quiz, packcatch-activity | Ready | Ready, repeatedly | default |

Ruled out, each by a test rather than a guess:

- **The account** — investor-quiz deployed Ready in the middle of every outage.
- **The build** — a `--prebuilt` deploy, with no remote build at all, blocked the same.
- **Size** — 1-2 MB payloads blocked.
- **Concurrent deploys** — one clean deploy with nothing else running blocked.
- **Deployment protection** — this runbook briefly named disabled SSO protection as
  the cause, because it was the only setting that differed on the first two projects.
  `stockpilotdaily` was created with the default protection, left untouched, and its
  second deploy blocked anyway. That theory is dead.

What is left is something about this repo or what it serves, applied after the first
production deploy. One unverified possibility: automated abuse review reacting to a
new Hobby site that publishes BUY verdicts on named tickers. Nothing here confirms it.
**The Vercel dashboard is the next place to look**, not the CLI: open the Inspect page
of a blocked deployment, e.g.
https://vercel.com/travis-miragliottas-projects/stockpilotdaily/3VopHyYVHydnboNn98uNcF1FGqbu
— it may show a reason the API does not return. Failing that, Vercel support.

**Until this is solved, a code change reaches production only by a new project**,
because a new project's first deploy is the only one that works:

```bash
npx vercel link --yes --project <new-name>
npx vercel env add QUIZ_URL production        # env vars do not follow a project
npx vercel --prod --yes                        # first deploy: the one that works
# then point the quiz at <new-name>.vercel.app and redeploy the quiz:
cd ~/Projects/investor-quiz && printf 'https://<new-name>.vercel.app' | npx vercel env update STOCKPILOT_DAILY_URL production --yes && npx vercel --prod --yes
```

That changes the public URL every time, which is tolerable only because the quiz is
the one inbound link. It is a workaround, not a deploy process.

Read the real state of any deployment with the API, which is more honest than the CLI:
`GET https://api.vercel.com/v13/deployments/<host>` → `readyState`.

**3. Deployment protection is not the obstacle to a public site.** The default,
`all_except_custom_domains`, leaves the production domain public. Only per-deployment
URLs and the team alias (`<project>-<team>.vercel.app`) redirect to a login, and that
redirect is what made protection look like a problem on 2026-09-22. It wasn't: the
production domain was 404ing because of failure mode 1. Leave it at the default.

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
| `QUIZ_URL` | yes, on `stockpilotdaily` | No invite link on the board. Never a link to nowhere. |
| `ANTHROPIC_API_KEY` | **no, deliberately** | `/api/ask` returns `no_key` and the deterministic answerer runs. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | no | Store falls back to the local deck files traced into the build. |

Leave `ANTHROPIC_API_KEY` unset until `/api/ask` is behind a Vercel Firewall rate
limit. The route is public and every call would spend real money.

## The loop with the quiz

The quiz reads `STOCKPILOT_DAILY_URL` (set to `https://stockpilotdaily.vercel.app`) and returns `daily:` from `/api/submit`,
null until that variable is set. Only archetype and AI posture travel in the URL —
no name, no email, no answers. Vercel injects env vars at deploy time, so setting
the variable is not enough; the quiz has to be redeployed after.
