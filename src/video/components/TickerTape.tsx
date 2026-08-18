import { useCurrentFrame } from 'remotion';
import type { TapeItem } from '../../spine/schema';
import { COLORS, MONO, fmtPct, fmtPrice, signColor, verdictColor } from '../theme';
import { useLayout } from '../layout';

// A seamless scrolling tape.
//
// Cell widths are computed rather than measured: the tape is set in JetBrains
// Mono, whose advance width is a fixed 0.6em, so the exact pixel width of every
// cell is known before layout. That keeps the loop perfect (the strip is drawn
// twice and translated by exactly one strip width) and keeps the render
// deterministic — no DOM measurement, no layout race between frames.

const CHAR_ADVANCE = 0.6;

interface Props {
  items: TapeItem[];
  direction?: 'left' | 'right';
  /** Pixels per frame at 1x scale. */
  speed?: number;
  y?: number;
  dim?: number;
}

const cellText = (t: TapeItem) => {
  const price = t.price == null ? '' : `  ${fmtPrice(t.price)}`;
  const chg = t.changePct == null ? '' : `  ${fmtPct(t.changePct)}`;
  return `${t.ticker}${price}${chg}`;
};

export const TickerTape: React.FC<Props> = ({
  items,
  direction = 'left',
  speed = 2.6,
  dim = 1,
}) => {
  const frame = useCurrentFrame();
  const { u, width, type } = useLayout();

  const fontSize = type.tape;
  const gap = 56 * u;
  const pipW = 14 * u;

  const cells = items.map((item) => {
    const text = cellText(item);
    const w = text.length * CHAR_ADVANCE * fontSize + pipW + 12 * u + gap;
    return { item, text, w };
  });

  const stripW = cells.reduce((sum, c) => sum + c.w, 0);
  // Draw enough copies to cover the frame plus one full strip for the wrap.
  const copies = Math.max(2, Math.ceil(width / Math.max(stripW, 1)) + 1);

  const travel = (frame * speed * u) % stripW;
  const offset = direction === 'left' ? -travel : travel - stripW;

  return (
    <div
      style={{
        position: 'relative',
        width,
        height: 74 * u,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        borderTop: `1px solid ${COLORS.panelEdge}`,
        borderBottom: `1px solid ${COLORS.panelEdge}`,
        background: 'rgba(6,10,18,0.72)',
        opacity: dim,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexShrink: 0,
          translate: `${offset}px 0px`,
          willChange: 'translate',
        }}
      >
        {Array.from({ length: copies }).flatMap((_, copy) =>
          cells.map(({ item, w }, i) => (
            <div
              key={`${copy}-${i}-${item.ticker}`}
              style={{
                width: w,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 12 * u,
                fontFamily: MONO,
                fontSize,
                fontWeight: 700,
                letterSpacing: 0.5 * u,
                whiteSpace: 'pre',
              }}
            >
              <span
                style={{
                  width: pipW,
                  height: pipW,
                  borderRadius: pipW,
                  flexShrink: 0,
                  background: verdictColor(item.verdict),
                  boxShadow: item.verdict ? `0 0 ${10 * u}px ${verdictColor(item.verdict)}` : 'none',
                  opacity: item.verdict ? 1 : 0.35,
                }}
              />
              <span style={{ color: COLORS.text }}>{item.ticker}</span>
              {item.price != null && (
                <span style={{ color: COLORS.textDim }}>{fmtPrice(item.price)}</span>
              )}
              {item.changePct != null && (
                <span style={{ color: signColor(item.changePct) }}>{fmtPct(item.changePct)}</span>
              )}
            </div>
          )),
        )}
      </div>

      {/* Feather both ends so cells enter and leave instead of popping. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `linear-gradient(90deg, ${COLORS.bg} 0%, transparent 7%, transparent 93%, ${COLORS.bg} 100%)`,
        }}
      />
    </div>
  );
};
