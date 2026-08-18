// Schema gate for the StockPilot Daily spine.
//
// Every record that reaches the video passes through Zod first. Sources are
// untrusted by construction: the local report JSON is written by an LLM
// pipeline, and the Notion properties are free text typed by that same
// pipeline. Nothing downstream reads a raw source object.

import { z } from 'zod';

export const Verdict = z.enum(['BUY', 'WATCH', 'SKIP']);
export type Verdict = z.infer<typeof Verdict>;

// ---------------------------------------------------------------------------
// Source shapes — deliberately lenient. These describe what we *receive*.
// Unknown keys are dropped, absent keys become undefined, and every numeric
// field is coerced because Notion hands back strings.
// ---------------------------------------------------------------------------

const num = z.coerce.number().finite();
const optNum = num.nullish().transform((v) => (v == null ? null : v));
const str = z.string().transform((s) => s.trim());
const optStr = z
  .string()
  .nullish()
  .transform((s) => (s == null ? null : s.trim() || null));

export const ScoredSource = z.object({
  ticker: str,
  verdict: Verdict.catch('SKIP'),
  alpha_score: optNum,
  reasoning: optStr,
  time_horizon: optStr,
  entry_note: optStr,
  stop_note: optStr,
});

export const AllocationSource = z.object({
  ticker: str,
  tier: num.int().min(1).max(3).catch(3),
  position_pct: num.min(0).max(100),
  entry_note: optStr,
  stop_loss_note: optStr,
});

export const MomentumRowSource = z.object({
  ticker: str,
  last_close: optNum,
  ret_21d: optNum,
  ret_63d: optNum,
  rs_excess_63d: optNum,
  vol_surge: optNum,
  pct_of_52w_high: optNum,
  momentum_score: optNum,
});

export const UniverseEntry = z.object({
  ticker: str,
  name: optStr,
  sector: optStr,
});

export const RotationSuggestion = z.object({
  ticker_out: str,
  reason: optStr,
  health_summary: optStr,
  candidates: z
    .array(z.object({ ticker: str, rationale: optStr }))
    .nullish()
    .transform((c) => c ?? []),
});

// The whole local report. Every section is optional: older reports predate
// agents 7 and 8, and a partial run still deserves a video.
export const LocalReportSource = z.object({
  date: str,
  thesis: optStr,
  unansweredCount: optNum,
  core: z.array(UniverseEntry).nullish(),
  sleeve: z.array(z.string()).nullish(),
  watchlist: z.array(UniverseEntry).nullish(),
  scored: z.array(ScoredSource).nullish(),
  allocation: z.array(AllocationSource).nullish(),
  momentum: z
    .object({
      screened: optNum,
      skipped: optNum,
      ranked: z.array(MomentumRowSource).nullish(),
    })
    .nullish(),
  outcomes: z
    .object({
      scored_5d: optNum,
      scored_15d: optNum,
      scored_30d: optNum,
      failed_lookups: optNum,
    })
    .nullish(),
  rotations: z
    .object({
      flagged: optNum,
      suggestions: z.array(RotationSuggestion).nullish(),
    })
    .nullish(),
});
export type LocalReportSource = z.infer<typeof LocalReportSource>;

// ---------------------------------------------------------------------------
// DailyDeck — the typed record. This is the ONLY thing the video renders, and
// it is strict: required fields, no nulls where a scene needs a value, arrays
// already capped and sorted. If it parses, every scene can render it.
// ---------------------------------------------------------------------------

export const DeckPosition = z.object({
  ticker: z.string(),
  name: z.string().nullable(),
  sector: z.string().nullable(),
  tier: z.number().int().min(1).max(3),
  positionPct: z.number(),
  entryNote: z.string().nullable(),
  stopNote: z.string().nullable(),
  alphaScore: z.number().nullable(),
  timeHorizon: z.string().nullable(),
});
export type DeckPosition = z.infer<typeof DeckPosition>;

export const DeckWatch = z.object({
  ticker: z.string(),
  note: z.string().nullable(),
  alphaScore: z.number().nullable(),
});

export const DeckMomentum = z.object({
  ticker: z.string(),
  momentumScore: z.number(),
  ret21d: z.number().nullable(),
  ret63d: z.number().nullable(),
  rsExcess63d: z.number().nullable(),
  volSurge: z.number().nullable(),
  pctOf52wHigh: z.number().nullable(),
  lastClose: z.number().nullable(),
});
export type DeckMomentum = z.infer<typeof DeckMomentum>;

// One cell of the scrolling ticker tape.
export const TapeItem = z.object({
  ticker: z.string(),
  price: z.number().nullable(),
  changePct: z.number().nullable(),
  verdict: Verdict.nullable(),
});
export type TapeItem = z.infer<typeof TapeItem>;

export const DeckRotation = z.object({
  tickerOut: z.string(),
  reason: z.string().nullable(),
  healthSummary: z.string().nullable(),
  topCandidate: z.string().nullable(),
});

export const DailyDeck = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  // Where the numbers came from, surfaced on the end card so a rendered video
  // can never quietly imply Notion confirmed something it did not.
  source: z.enum(['local+notion', 'local', 'notion', 'fixture']),
  generatedAt: z.string(),

  thesis: z.string(),
  counts: z.object({
    buy: z.number().int().min(0),
    watch: z.number().int().min(0),
    skip: z.number().int().min(0),
    screened: z.number().int().min(0),
    universe: z.number().int().min(0),
  }),

  allocation: z.array(DeckPosition),
  watches: z.array(DeckWatch),
  skips: z.array(z.string()),
  momentum: z.array(DeckMomentum),
  tape: z.array(TapeItem).min(1, 'tape needs at least one item to scroll'),

  outcomes: z
    .object({
      scored5d: z.number().int().min(0),
      scored15d: z.number().int().min(0),
      scored30d: z.number().int().min(0),
      failedLookups: z.number().int().min(0),
    })
    .nullable(),
  rotations: z.object({
    flagged: z.number().int().min(0),
    suggestions: z.array(DeckRotation),
  }),
  unansweredCount: z.number().int().min(0),
});
export type DailyDeck = z.infer<typeof DailyDeck>;
