# DEPLOY.md — taking StockPilot Daily to production

Runbook for deploying this repo to **Vercel** with a hosted **Supabase**
database. Written for an agent working with repo access (Codex), and equally
usable by a human.

Read `AGENTS.md` first for how the app is built. This file covers only shipping
it.

---

## 0. Read this before you start

**You cannot finish this deploy alone, and you should not pretend otherwise.**
Three things require the repo owner and cannot be delegated:

| Step | Why only the owner |
|---|---|
| Creating the Supabase project | account creation + billing |
| Creating / linking the Vercel project | account auth |
| **Populating the database** | the source data lives on the owner's laptop |

That third one is the important one and it is explained in §4. A deploy that
"succeeds" with an empty database is not done — it renders an empty-state page.

**Never ask the owner to paste a service role key, database password, or access
token into a chat.** They belong in the Vercel dashboard and in a local
`.env.local` only. If you need one, tell the owner where to put it, not to show
it to you.

---

## 1. Preconditions

```bash
node -v          # 22.x
npm install
npm run lint     # eslint + tsc, must pass
```

`npm run build` must succeed **without any Supabase environment variables set** —
that is exactly what Vercel does on the first build, before env vars exist.
This is verified working; if it fails, something regressed:

```bash
SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= npm run build
```

---

## 2. Supabase

1. Owner creates a project at supabase.com and notes the region.
2. Apply the schema. Either paste `supabase/migrations/0001_init.sql` into the
   project's SQL editor, or link and push:

   ```bash
   npx supabase link --project-ref <ref>   # owner authenticates
   npx supabase db push
   ```

3. Verify the schema landed:

   ```sql
   select tablename, rowsecurity from pg_tables
   where schemaname = 'public' order by tablename;
   ```

   Expect exactly four tables — `daily_decks`, `deck_momentum`,
   `deck_positions`, `deck_tape` — each with `rowsecurity = true`.

   ```sql
   select count(*) from pg_policies where schemaname = 'public';  -- expect 0
   ```

   **Zero policies is correct, not a bug.** Access is deny-by-default; the
   service role bypasses RLS and is granted table privileges explicitly at the
   bottom of the migration. Do not "fix" this by adding an `anon` policy — that
   would make the allocations world-readable to anyone holding the publishable
   key.

4. From Project Settings → API, the owner copies the **Project URL** and the
   **`service_role`** key. Not the `anon` key — the app does all reads
   server-side and RLS denies `anon` entirely.

---

## 3. Vercel

Next.js is auto-detected; there is no `vercel.json` and none is needed.

Set two environment variables (Project → Settings → Environment Variables), for
Production and Preview:

```
SUPABASE_URL                 = https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY    = <service_role key>
```

**`SUPABASE_SERVICE_ROLE_KEY` must never be prefixed `NEXT_PUBLIC_`.** That
prefix inlines the value into the client bundle. With RLS denying every other
role, that key is the only thing standing between this data and the public.

Then deploy. After deploying, verify no credential reached the browser:

```bash
curl -s https://<deployment>/ | grep -c 'service_role'          # expect 0
curl -s https://<deployment>/ | grep -coE 'eyJ[A-Za-z0-9_-]{20,}'  # expect 0
```

Both return 0 on the verified local production build. A non-zero result means a
credential is being serialized into the page — stop and fix before sharing the
URL.

---

## 4. Populating the database — the part that needs the owner's machine

The deck pipeline writes JSON reports to `~/Documents/stockpilot/reports/` on
the owner's laptop. **Vercel cannot see that directory, and neither can you.**
So the sync runs locally and pushes up:

```bash
# On the owner's machine, in this repo:
#   .env.local must hold the HOSTED SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm run sync -- --backfill 30
```

Expect `→ supabase` on each line. `→ local` means the environment was not
picked up (see §6).

### Do not work around this with Notion

Notion *is* reachable from a server, so a Vercel cron pulling from Notion looks
like an obvious fix. It is not, and there is deliberately no cron in this repo.
The Notion database has no columns for momentum, outcomes, rotations, or stop
notes — those exist only in the local report. A Notion-only sync produces decks
that validate, render, and are quietly missing half their content, on a
schedule. If scheduled ingest is wanted, schedule it on the owner's machine.

### Smoke-testing before real data exists

`data/decks/` is gitignored, so a fresh clone has no decks. One real deck is
committed at `src/fixtures/sample-deck.json` for exactly this purpose. To put a
single row in a fresh database without the pipeline, insert that file's contents
into `daily_decks.deck` along with its scalar columns. Treat it as a smoke test,
not as data — it is one day, dated 2026-08-17.

---

## 5. Definition of done

- [ ] `npm run lint` passes
- [ ] Build succeeds with no Supabase env set
- [ ] Four tables exist, RLS on, zero policies
- [ ] Vercel env vars set, service role key **not** `NEXT_PUBLIC_`
- [ ] Deployment loads and the store badge reads **Supabase**, not *Local files*
- [ ] `service_role` and JWT greps against the deployed HTML both return 0
- [ ] Owner has run `npm run sync -- --backfill 30` and the day switcher lists
      real dates
- [ ] Switching to **2026-07-17** shows 0 BUY, empty allocation and momentum
      cards, and a shorter runtime — this exercises the data-driven empty path

---

## 6. Failure modes you will actually hit

Both of these were hit for real during development. Recognize them rather than
rediscovering them.

**`permission denied for table daily_decks`**
The service role authenticated fine and was then refused. `BYPASSRLS` is *not* a
table privilege. The grants at the bottom of `0001_init.sql` fix this — confirm
that section actually ran; a partially-applied migration is the usual cause.

**Sync reports success but writes nowhere — `store: Local files`**
The environment was not visible to the process. Historically this was caused by
reading `process.env` at module scope: ESM hoists imports above a CLI's
`dotenv.config()`, so the capture ran before the env was loaded and every sync
silently fell back to local files while printing `✓`. `src/spine/store.ts` now
reads the environment lazily on every call — **do not** reintroduce a
module-scope capture. If you see `→ local` when you expect `→ supabase`, check
that `.env.local` exists and holds both variables.

**Deployed page says "No decks yet"**
Expected on a fresh deploy. The database is empty until §4 runs. This is not a
bug in the app.

---

## 7. Things not to do

- Do not commit `.env.local`, or any key, to the repo.
- Do not add an `anon` RLS policy to make something work.
- Do not add a Vercel cron that ingests from Notion (§4).
- Do not delete files to free disk space on the owner's machine.
- Do not change `src/spine/schema.ts` shapes to make a deploy pass — the
  `DailyDeck` contract is shared by the database, the dashboard, and both video
  compositions.
