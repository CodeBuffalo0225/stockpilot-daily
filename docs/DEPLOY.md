# Deploying StockPilot Daily

Production: **https://stockpilotdaily.vercel.app** — Vercel project `stockpilotdaily`
(Hobby plan, account `tsm5110-6848`).

`stockpilot-daily` and `stockpilot-board` are earlier projects that still serve old
builds. They were abandoned while chasing failure mode 2, before its cause was known.

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

**2. `readyState: BLOCKED` after the first deploy — the commit author has no account.**
The deployment is created, never builds, emits no build events, and the CLI sits on
"Building…" until it dies with `fetch failed` or `Not authorized`. `vercel ls` shows
`UNKNOWN`. Nothing in the CLI output says why.

The API does, in a field that is easy to miss:

```
readyStateReason: "The deployment was blocked because Vercel couldn't find a Git
                   account for the commit author."
seatBlock:        { blockCode: "COMMIT_AUTHOR_REQUIRED" }
attribution:      commitMeta.email = teambuffalooutdoors@MacBookPro.lan
```

This repo had no `user.email` configured anywhere, so git fell back to
`<user>@<hostname>` for every commit — an address no GitHub or Vercel account owns.
The first deploy to a new project succeeds because Vercel links the Git repo during
that deploy; from then on every CLI deploy carries `HEAD`'s author and is checked.
That is why three projects in a row went Ready once and then blocked forever.

The repo now pins its identity locally, the same way packcatch-activity does:

```bash
git config --local user.email tsm5110@gmail.com
git config --local user.name "Travis Miragliotta"
```

Only `HEAD`'s author matters to the check, so older commits were left as they are —
rewriting pushed history to fix an email is not worth it.

**How the wrong answers happened, so they do not happen again.** Before the real cause
was found, this runbook blamed a rate limit, then concurrent builds, then disabled SSO
protection, each ruled out by the next test. The cause was in the deployment record the
whole time; the first diagnosis printed six fields of it and not the other forty. When a
deployment blocks, read the whole record before theorising:

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.vercel.com/v13/deployments/<host> | python3 -m json.tool | grep -iE 'reason|block|error'
```

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
