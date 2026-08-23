// The deck store — Supabase in deployment, local files in development.
//
// Everything server-side reads decks through this module, never through the
// Supabase client directly, so the fallback is a property of the store rather
// than something every caller re-implements. `describeStore()` reports which
// backend is live; the UI surfaces it, because "the dashboard is showing you
// yesterday's local file, not production" should never be a silent state.
//
// The service role key is used deliberately: RLS denies every other role, and
// this module only ever runs on the server. It must never be imported into a
// client component — it reads node:fs and process.env, so Next fails the build
// if one does. (`server-only` is not used here because the sync CLI imports
// this module outside Next's bundler, where that package throws.)

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DailyDeck } from './schema';

export type StoreKind = 'supabase' | 'local';

// Read the environment on every call rather than once at module load.
//
// ESM hoists imports above module-level statements, so a CLI that calls
// dotenv.config() before importing this file still has its imports evaluated
// FIRST. Capturing process.env at load time made every script silently fall
// back to local files even with .env.local present — the store reported
// "Local files" while the operator believed they were writing to Postgres.
// Lazy reads make the behaviour independent of import order.
const readEnv = () => ({
  url: process.env.SUPABASE_URL?.trim() || undefined,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
});

export function storeKind(): StoreKind {
  const { url, key } = readEnv();
  return url && key ? 'supabase' : 'local';
}

let client: SupabaseClient | null = null;
let clientUrl: string | null = null;

export function supabase(): SupabaseClient {
  const { url, key } = readEnv();
  if (!url || !key) {
    throw new Error('Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
  }
  // Rebuild if the target moved, so a re-pointed env cannot be served by a
  // client still aimed at the previous project.
  if (!client || clientUrl !== url) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    clientUrl = url;
  }
  return client;
}

export function describeStore() {
  const { url } = readEnv();
  const kind = storeKind();
  return {
    kind,
    label: kind === 'supabase' ? 'Supabase' : 'Local files',
    detail:
      kind === 'supabase' && url
        ? new URL(url).host
        : 'data/ — set SUPABASE_URL to use the database',
  };
}

export interface DeckSummary {
  date: string;
  source: DailyDeck['source'];
  buyCount: number;
  watchCount: number;
  skipCount: number;
  screenedCount: number;
  thesis: string;
}

// ---------------------------------------------------------------------------
// Local backend — data/decks/*.json, with data/deck.json as a single-day
// fallback so a fresh clone that has only run `npm run deck` still works.
// ---------------------------------------------------------------------------

const localDir = join(process.cwd(), 'data', 'decks');

async function localDecks(): Promise<DailyDeck[]> {
  const out: DailyDeck[] = [];
  try {
    const files = await readdir(localDir);
    for (const f of files.filter((f) => f.endsWith('.json'))) {
      try {
        out.push(DailyDeck.parse(JSON.parse(await readFile(join(localDir, f), 'utf8'))));
      } catch {
        // A malformed file is skipped rather than taking down the listing.
      }
    }
  } catch {
    // directory absent
  }
  if (out.length === 0) {
    try {
      const raw = await readFile(join(process.cwd(), 'data', 'deck.json'), 'utf8');
      out.push(DailyDeck.parse(JSON.parse(raw)));
    } catch {
      // nothing available
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listDecks(limit = 60): Promise<DeckSummary[]> {
  if (storeKind() === 'local') {
    return (await localDecks()).slice(0, limit).map((d) => ({
      date: d.date,
      source: d.source,
      buyCount: d.counts.buy,
      watchCount: d.counts.watch,
      skipCount: d.counts.skip,
      screenedCount: d.counts.screened,
      thesis: d.thesis,
    }));
  }

  const { data, error } = await supabase()
    .from('daily_decks')
    .select('date, source, buy_count, watch_count, skip_count, screened_count, thesis')
    .order('date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`listDecks: ${error.message}`);

  return (data ?? []).map((r) => ({
    date: r.date as string,
    source: r.source as DailyDeck['source'],
    buyCount: r.buy_count as number,
    watchCount: r.watch_count as number,
    skipCount: r.skip_count as number,
    screenedCount: r.screened_count as number,
    thesis: (r.thesis as string) ?? '',
  }));
}

export async function getDeck(date?: string): Promise<DailyDeck | null> {
  if (storeKind() === 'local') {
    const all = await localDecks();
    if (all.length === 0) return null;
    return (date ? all.find((d) => d.date === date) : all[0]) ?? null;
  }

  const base = supabase().from('daily_decks').select('deck');
  const { data, error } = await (date
    ? base.eq('date', date)
    : base.order('date', { ascending: false })
  ).limit(1);
  if (error) throw new Error(`getDeck: ${error.message}`);
  if (!data?.length) return null;

  // Re-validate on the way out. The column is jsonb and nothing stops a manual
  // edit in the Supabase dashboard from putting a broken deck in front of the
  // renderer.
  const parsed = DailyDeck.safeParse(data[0].deck);
  if (!parsed.success) {
    throw new Error(
      `getDeck(${date ?? 'latest'}): stored deck failed validation — ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}
