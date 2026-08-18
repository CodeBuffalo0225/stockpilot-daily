// Design tokens for StockPilot Daily.
//
// The look is a trading terminal: near-black ground, a faint instrument grid,
// monospaced numerals that never reflow, and colour used only to encode a
// verdict. Nothing is decorative for its own sake — if an element is coloured,
// the colour means BUY, WATCH or SKIP.

import { loadFont as loadDisplay } from '@remotion/google-fonts/InterTight';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

export const { fontFamily: DISPLAY } = loadDisplay('normal', {
  weights: ['500', '700', '800', '900'],
  subsets: ['latin'],
});

export const { fontFamily: MONO } = loadMono('normal', {
  weights: ['400', '500', '700', '800'],
  subsets: ['latin'],
});

export const COLORS = {
  bg: '#05070D',
  bgLift: '#0A0E18',
  panel: 'rgba(255,255,255,0.035)',
  panelEdge: 'rgba(255,255,255,0.09)',
  grid: 'rgba(120,150,190,0.07)',

  text: '#E9EFF7',
  textDim: '#8D9CB2',
  textFaint: '#4E5C71',

  buy: '#00E58C',
  buyGlow: 'rgba(0,229,140,0.35)',
  watch: '#FFB020',
  watchGlow: 'rgba(255,176,32,0.32)',
  skip: '#FF3D5E',
  skipGlow: 'rgba(255,61,94,0.30)',
  accent: '#2ED9F0',
  accentGlow: 'rgba(46,217,240,0.35)',
} as const;

export type VerdictKey = 'BUY' | 'WATCH' | 'SKIP';

export const verdictColor = (v: VerdictKey | null): string =>
  v === 'BUY' ? COLORS.buy : v === 'WATCH' ? COLORS.watch : v === 'SKIP' ? COLORS.skip : COLORS.textDim;

export const verdictGlow = (v: VerdictKey | null): string =>
  v === 'BUY'
    ? COLORS.buyGlow
    : v === 'WATCH'
      ? COLORS.watchGlow
      : v === 'SKIP'
        ? COLORS.skipGlow
        : 'rgba(141,156,178,0.25)';

// Green when up, red when down — the one place colour tracks sign, not verdict.
export const signColor = (n: number | null | undefined): string =>
  n == null ? COLORS.textDim : n >= 0 ? COLORS.buy : COLORS.skip;

// Tier 1/2/3 map to the 5% / 3% / 1.5% conviction sizes.
export const TIER_LABEL: Record<number, string> = {
  1: 'CONVICTION',
  2: 'STANDARD',
  3: 'STARTER',
};

export const fmtPct = (n: number | null | undefined, digits = 1): string =>
  n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;

export const fmtPrice = (n: number | null | undefined): string =>
  n == null ? '—' : n.toFixed(2);

// "2026-08-17" -> "MON 17 AUG 2026", without pulling in a date library or
// touching the host timezone (a bare `new Date('2026-08-17')` is UTC midnight,
// which renders as the previous day west of Greenwich).
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const DAYS = ['SUN','MON','TUE','WED','THU','FRI','SAT'];

export const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dow = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dow} ${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`;
};
