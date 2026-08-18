import { interpolate, useCurrentFrame } from 'remotion';
import type { DailyDeck } from '../../spine/schema';
import { COLORS, DISPLAY, MONO, fmtDate } from '../theme';
import { useLayout } from '../layout';
import { SceneShell } from '../components/SceneShell';
import { EASE_OUT, Kicker, RiseIn } from '../components/Primitives';

export const Open: React.FC<{ deck: DailyDeck; duration: number }> = ({ deck, duration }) => {
  const frame = useCurrentFrame();
  const { u, type, isVertical } = useLayout();

  return (
    <SceneShell duration={duration} fill={1.18} justify="center">
      <Kicker delay={6}>Daily Brief</Kicker>

      <div style={{ height: 30 * u }} />

      <RiseIn delay={14} style={{ fontSize: isVertical ? type.hero : type.hero * 0.92, fontWeight: 900, letterSpacing: -4 * u, lineHeight: 0.92 }}>
        STOCK
      </RiseIn>
      <RiseIn delay={22} style={{ fontSize: isVertical ? type.hero : type.hero * 0.92, fontWeight: 900, letterSpacing: -4 * u, lineHeight: 0.92, color: COLORS.accent }}>
        PILOT
      </RiseIn>

      <div style={{ height: 34 * u }} />

      {/* Rule that draws itself across the frame. */}
      <div
        style={{
          height: 3 * u,
          width: '100%',
          background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.buy})`,
          scale: `${interpolate(frame - 30, [0, 30], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: EASE_OUT,
          })} 1`,
          transformOrigin: 'left',
        }}
      />

      <div style={{ height: 28 * u }} />

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 24 * u,
          flexWrap: 'wrap',
          opacity: interpolate(frame - 44, [0, 18], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: type.title,
            fontWeight: 700,
            color: COLORS.text,
            letterSpacing: 2 * u,
          }}
        >
          {fmtDate(deck.date)}
        </span>
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: type.label,
            fontWeight: 700,
            color: COLORS.textDim,
            letterSpacing: 3 * u,
            textTransform: 'uppercase',
          }}
        >
          5-Agent Pipeline
        </span>
      </div>
    </SceneShell>
  );
};
