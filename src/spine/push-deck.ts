// Persist a validated deck. The jsonb row is written first and the child tables
// are derived from that same in-memory object, so the shredded rows can never
// describe a different deck than the one the video renders.
//
// Upsert on date makes a re-run idempotent: re-pushing a day corrects it rather
// than duplicating it. Child rows are deleted and rewritten instead of merged,
// because a re-run with fewer positions must not leave the dropped ones behind.

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { DailyDeck } from './schema';
import { supabase, storeKind } from './store';

export interface PushResult {
  target: 'supabase' | 'local';
  date: string;
  rows: { positions: number; tape: number; momentum: number };
}

export async function pushDeck(deck: DailyDeck, projectRoot: string): Promise<PushResult> {
  // Always mirror locally. It costs nothing, keeps the dev fallback warm, and
  // means a Supabase outage never loses the day's deck.
  const dir = join(projectRoot, 'data', 'decks');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${deck.date}.json`), JSON.stringify(deck, null, 2));

  const rows = {
    positions: deck.allocation.length,
    tape: deck.tape.length,
    momentum: deck.momentum.length,
  };

  if (storeKind === 'local') {
    return { target: 'local', date: deck.date, rows };
  }

  const db = supabase();

  const { error: deckErr } = await db.from('daily_decks').upsert(
    {
      date: deck.date,
      source: deck.source,
      generated_at: deck.generatedAt,
      thesis: deck.thesis,
      buy_count: deck.counts.buy,
      watch_count: deck.counts.watch,
      skip_count: deck.counts.skip,
      screened_count: deck.counts.screened,
      universe_count: deck.counts.universe,
      unanswered_count: deck.unansweredCount,
      rotations_flagged: deck.rotations.flagged,
      deck,
    },
    { onConflict: 'date' },
  );
  if (deckErr) throw new Error(`push daily_decks: ${deckErr.message}`);

  // Replace children rather than merge — a shorter re-run must shrink the day.
  for (const table of ['deck_positions', 'deck_tape', 'deck_momentum'] as const) {
    const { error } = await db.from(table).delete().eq('date', deck.date);
    if (error) throw new Error(`clear ${table}: ${error.message}`);
  }

  if (deck.allocation.length) {
    const { error } = await db.from('deck_positions').insert(
      deck.allocation.map((p) => ({
        date: deck.date,
        ticker: p.ticker,
        tier: p.tier,
        position_pct: p.positionPct,
        sector: p.sector,
        entry_note: p.entryNote,
        stop_note: p.stopNote,
        alpha_score: p.alphaScore,
        time_horizon: p.timeHorizon,
      })),
    );
    if (error) throw new Error(`push deck_positions: ${error.message}`);
  }

  if (deck.tape.length) {
    const { error } = await db.from('deck_tape').insert(
      deck.tape.map((t, i) => ({
        date: deck.date,
        ticker: t.ticker,
        ord: i,
        price: t.price,
        change_pct: t.changePct,
        verdict: t.verdict,
      })),
    );
    if (error) throw new Error(`push deck_tape: ${error.message}`);
  }

  if (deck.momentum.length) {
    const { error } = await db.from('deck_momentum').insert(
      deck.momentum.map((m, i) => ({
        date: deck.date,
        ticker: m.ticker,
        rank: i + 1,
        momentum_score: m.momentumScore,
        ret_21d: m.ret21d,
        ret_63d: m.ret63d,
        rs_excess_63d: m.rsExcess63d,
        vol_surge: m.volSurge,
        pct_of_52w_high: m.pctOf52wHigh,
        last_close: m.lastClose,
      })),
    );
    if (error) throw new Error(`push deck_momentum: ${error.message}`);
  }

  return { target: 'supabase', date: deck.date, rows };
}
