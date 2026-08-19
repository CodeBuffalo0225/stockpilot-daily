'use client';

import type { TapeItem } from '../src/spine/schema';

// The ticker rail.
//
// Unlike the Remotion tape (which computes exact cell widths so a deterministic
// render can loop seamlessly), the DOM version duplicates the cell list once
// and animates to -50%. At the halfway point the second copy sits exactly where
// the first began, so the loop is seamless for any content width without
// measuring anything.
//
// Hovering pauses it, and the whole thing is disabled under
// prefers-reduced-motion — a permanently scrolling marquee is a genuine
// accessibility problem, not just a preference.

const verdictColor = (v: TapeItem['verdict']) =>
  v === 'BUY' ? 'var(--buy)' : v === 'WATCH' ? 'var(--watch)' : v === 'SKIP' ? 'var(--skip)' : 'var(--text-faint)';

const trend = (n: number | null) => (n == null ? 'flat' : n >= 0 ? 'up' : 'down');
const fmtPct = (n: number | null) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`);

export function TickerRail({
  items,
  reverse = false,
  secondsPerItem = 2.4,
  sub = false,
  selected,
  onSelect,
}: {
  items: TapeItem[];
  reverse?: boolean;
  secondsPerItem?: number;
  sub?: boolean;
  selected?: string | null;
  onSelect?: (ticker: string) => void;
}) {
  if (items.length === 0) return null;

  // Duration scales with content so the pixel speed stays constant regardless
  // of how many names the day produced.
  const duration = `${Math.max(items.length * secondsPerItem, 18)}s`;
  const doubled = [...items, ...items];

  return (
    <div className={`rail${sub ? ' rail--sub' : ''}`} aria-hidden={sub || undefined}>
      <div
        className={`rail__track${reverse ? ' rail__track--rev' : ''}`}
        style={{ ['--rail-duration' as string]: duration }}
      >
        {doubled.map((item, i) => (
          <button
            key={`${item.ticker}-${i}`}
            className="cell"
            type="button"
            data-active={selected === item.ticker}
            onClick={() => onSelect?.(item.ticker)}
            // The second copy is decorative; only the first is reachable.
            tabIndex={i >= items.length ? -1 : 0}
            aria-hidden={i >= items.length}
          >
            <span className="cell__pip" style={{ background: verdictColor(item.verdict) }} />
            <span className="cell__t">{item.ticker}</span>
            {item.price != null && <span className="cell__p">{item.price.toFixed(2)}</span>}
            {item.changePct != null && (
              <span className={trend(item.changePct)}>{fmtPct(item.changePct)}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
