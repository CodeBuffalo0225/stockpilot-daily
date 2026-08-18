// Fork gate + reconciliation: two validated sources in, one typed DailyDeck out.
//
// Precedence is deliberate and fixed in code, never inferred at runtime:
//   * structured arrays (momentum, outcomes, rotations, stop notes, alpha
//     scores) come from the local report — Notion has no columns for them;
//   * thesis / unanswered count prefer local, fall back to Notion;
//   * when local is absent entirely, the deck is rebuilt from Notion's parsed
//     text fields and every field Notion cannot supply stays null.
//
// Caps here are display caps. They exist so a 21-name scored list cannot push
// a scene past its safe area, and they are enforced in code rather than left
// to whatever the pipeline happened to emit that day.

import {
  DailyDeck,
  type DeckMomentum,
  type DeckPosition,
  type LocalReportSource,
  type TapeItem,
} from './schema';
import type { NotionReport } from './sources';

export const CAPS = {
  allocation: 6,
  momentum: 8,
  watches: 5,
  skips: 24,
  tape: 28,
  rotations: 3,
} as const;

// Conviction tiers, per the StockPilot spec: 5% / 3% / 1.5%.
export const TIER_PCT: Record<number, number> = { 1: 5, 2: 3, 3: 1.5 };

export function tierFromPct(pct: number | null): number {
  if (pct == null) return 3;
  if (pct >= 4.5) return 1;
  if (pct >= 2.5) return 2;
  return 3;
}

export interface BuildInput {
  date: string;
  local: LocalReportSource | null;
  notion: NotionReport | null;
}

export interface BuildResult {
  deck: DailyDeck;
  warnings: string[];
}

export function buildDeck({ date, local, notion }: BuildInput): BuildResult {
  const warnings: string[] = [];
  if (!local && !notion) {
    throw new Error(
      `No data for ${date}. Checked the local pipeline reports and the Notion StockPilot Reports database.`,
    );
  }

  const source: DailyDeck['source'] =
    local && notion ? 'local+notion' : local ? 'local' : 'notion';
  if (!local) {
    warnings.push(
      'Local report missing — momentum, outcomes, rotations and stop notes are unavailable from Notion and render as empty.',
    );
  }
  if (!notion) {
    warnings.push('Notion row missing — using the local report only.');
  }

  const universeEntries = [...(local?.core ?? []), ...(local?.watchlist ?? [])];
  const meta = new Map(universeEntries.map((e) => [e.ticker, e]));
  const scored = local?.scored ?? [];
  const scoredBy = new Map(scored.map((s) => [s.ticker, s]));

  // ---- allocation -------------------------------------------------------
  let allocation: DeckPosition[];
  if (local?.allocation?.length) {
    allocation = local.allocation.map((a) => {
      const s = scoredBy.get(a.ticker);
      const m = meta.get(a.ticker);
      return {
        ticker: a.ticker,
        name: m?.name ?? null,
        sector: m?.sector ?? null,
        tier: a.tier,
        positionPct: a.position_pct,
        entryNote: a.entry_note ?? s?.entry_note ?? null,
        stopNote: a.stop_loss_note ?? s?.stop_note ?? null,
        alphaScore: s?.alpha_score ?? null,
        timeHorizon: s?.time_horizon ?? null,
      };
    });
  } else {
    // Notion-only path. Tier is recovered from the TOON block when present,
    // otherwise inferred from the position size.
    allocation = (notion?.buys ?? []).map((b) => {
      const fromToon = notion?.allocationMeta.get(b.ticker);
      const pct = fromToon?.positionPct ?? b.positionPct ?? 0;
      return {
        ticker: b.ticker,
        name: null,
        sector: null,
        tier: fromToon?.tier ?? tierFromPct(pct),
        positionPct: pct,
        entryNote: b.entryNote,
        stopNote: null, // never parseable from Notion — see sources.ts
        alphaScore: null,
        timeHorizon: null,
      };
    });
  }

  for (const p of allocation) {
    const expected = TIER_PCT[p.tier];
    if (expected !== undefined && Math.abs(expected - p.positionPct) > 0.01) {
      warnings.push(
        `${p.ticker}: tier ${p.tier} implies ${expected}% but report says ${p.positionPct}% — rendering the report's value.`,
      );
    }
  }

  allocation = allocation
    .sort((a, b) => a.tier - b.tier || b.positionPct - a.positionPct)
    .slice(0, CAPS.allocation);

  // ---- watches / skips --------------------------------------------------
  const watches = (
    scored.length
      ? scored
          .filter((s) => s.verdict === 'WATCH')
          .map((s) => ({ ticker: s.ticker, note: s.reasoning, alphaScore: s.alpha_score }))
      : (notion?.watches ?? []).map((w) => ({
          ticker: w.ticker,
          note: w.note,
          alphaScore: null,
        }))
  )
    .sort((a, b) => (b.alphaScore ?? 0) - (a.alphaScore ?? 0))
    .slice(0, CAPS.watches);

  const skips = (
    scored.length
      ? scored.filter((s) => s.verdict === 'SKIP').map((s) => s.ticker)
      : (notion?.skips ?? [])
  ).slice(0, CAPS.skips);

  // ---- counts (always derived, never taken on trust) --------------------
  const buyCount = scored.length
    ? scored.filter((s) => s.verdict === 'BUY').length
    : (notion?.buys.length ?? 0);
  const watchCount = scored.length
    ? scored.filter((s) => s.verdict === 'WATCH').length
    : (notion?.watches.length ?? 0);
  const skipCount = scored.length
    ? scored.filter((s) => s.verdict === 'SKIP').length
    : (notion?.skips.length ?? 0);

  // ---- momentum ---------------------------------------------------------
  const momentum: DeckMomentum[] = (local?.momentum?.ranked ?? [])
    .filter((r) => r.momentum_score != null)
    .map((r) => ({
      ticker: r.ticker,
      momentumScore: r.momentum_score as number,
      ret21d: r.ret_21d,
      ret63d: r.ret_63d,
      rsExcess63d: r.rs_excess_63d,
      volSurge: r.vol_surge,
      pctOf52wHigh: r.pct_of_52w_high,
      lastClose: r.last_close,
    }))
    .sort((a, b) => b.momentumScore - a.momentumScore)
    .slice(0, CAPS.momentum);

  // ---- ticker tape ------------------------------------------------------
  // Real prices and 21-day returns where the momentum screen has them; verdict
  // colouring for everything the scorer touched. Deduped, capped, and never
  // empty (the schema rejects an empty tape).
  const tapeMap = new Map<string, TapeItem>();
  for (const r of local?.momentum?.ranked ?? []) {
    tapeMap.set(r.ticker, {
      ticker: r.ticker,
      price: r.last_close,
      changePct: r.ret_21d,
      verdict: scoredBy.get(r.ticker)?.verdict ?? null,
    });
  }
  for (const s of scored) {
    if (!tapeMap.has(s.ticker)) {
      tapeMap.set(s.ticker, { ticker: s.ticker, price: null, changePct: null, verdict: s.verdict });
    }
  }
  for (const t of [...allocation.map((a) => a.ticker), ...skips]) {
    if (!tapeMap.has(t)) {
      tapeMap.set(t, { ticker: t, price: null, changePct: null, verdict: null });
    }
  }
  const tape = [...tapeMap.values()].slice(0, CAPS.tape);
  if (tape.length === 0) {
    tape.push({ ticker: 'STOCKPILOT', price: null, changePct: null, verdict: null });
    warnings.push('No tickers in any source — tape falls back to a single placeholder cell.');
  }

  // ---- outcomes / rotations --------------------------------------------
  const o = local?.outcomes;
  const outcomes = o
    ? {
        scored5d: Math.max(0, Math.round(o.scored_5d ?? 0)),
        scored15d: Math.max(0, Math.round(o.scored_15d ?? 0)),
        scored30d: Math.max(0, Math.round(o.scored_30d ?? 0)),
        failedLookups: Math.max(0, Math.round(o.failed_lookups ?? 0)),
      }
    : null;

  const rotations = {
    flagged: Math.max(0, Math.round(local?.rotations?.flagged ?? 0)),
    suggestions: (local?.rotations?.suggestions ?? []).slice(0, CAPS.rotations).map((s) => ({
      tickerOut: s.ticker_out,
      reason: s.reason,
      healthSummary: s.health_summary,
      topCandidate: s.candidates[0]?.ticker ?? null,
    })),
  };

  const thesis = local?.thesis ?? notion?.thesis ?? '';
  if (!thesis) warnings.push('No thesis in either source — the thesis scene will be skipped.');

  const deck = DailyDeck.parse({
    date,
    source,
    generatedAt: new Date().toISOString(),
    thesis,
    counts: {
      buy: buyCount,
      watch: watchCount,
      skip: skipCount,
      screened: Math.max(0, Math.round(local?.momentum?.screened ?? 0)),
      universe: (local?.core?.length ?? 0) + (local?.sleeve?.length ?? 0),
    },
    allocation,
    watches,
    skips,
    momentum,
    tape,
    outcomes,
    rotations,
    unansweredCount: Math.max(
      0,
      Math.round(local?.unansweredCount ?? notion?.unansweredCount ?? 0),
    ),
  });

  return { deck, warnings };
}
