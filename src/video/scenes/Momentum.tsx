import { interpolate, useCurrentFrame } from 'remotion';
import type { DailyDeck } from '../../spine/schema';
import { COLORS, DISPLAY, MONO, fmtPct, signColor } from '../theme';
import { useLayout } from '../layout';
import { SceneShell } from '../components/SceneShell';
import { EASE_OUT, Kicker } from '../components/Primitives';

// Ranked momentum bars. Bar length encodes momentum_score (0-100); the trailing
// figure is the 63-day return, which is the number that actually moved the rank.
export const Momentum: React.FC<{ deck: DailyDeck; duration: number }> = ({ deck, duration }) => {
  const frame = useCurrentFrame();
  const { u, type } = useLayout();

  const rows = deck.momentum;
  const max = Math.max(...rows.map((r) => r.momentumScore), 1);

  return (
    <SceneShell duration={duration}>
      <Kicker delay={4}>Momentum Leaders</Kicker>
      <div style={{ height: 12 * u }} />
      <div
        style={{
          fontFamily: MONO,
          fontSize: type.micro,
          color: COLORS.textFaint,
          letterSpacing: 3 * u,
          textTransform: 'uppercase',
        }}
      >
        Score · 63-day return
      </div>
      <div style={{ height: 28 * u }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 * u, width: '100%' }}>
        {rows.map((r, i) => {
          const delay = 14 + i * 9;
          const enter = interpolate(frame - delay, [0, 22], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: EASE_OUT,
          });
          const grow = interpolate(frame - (delay + 6), [0, 34], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: EASE_OUT,
          });
          const pct = (r.momentumScore / max) * grow;

          return (
            <div
              key={r.ticker}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 18 * u,
                opacity: enter,
                translate: `${(1 - enter) * 36 * u}px 0px`,
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: type.micro,
                  color: COLORS.textFaint,
                  width: 34 * u,
                  flexShrink: 0,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>

              <span
                style={{
                  fontFamily: DISPLAY,
                  fontSize: type.body,
                  fontWeight: 800,
                  color: COLORS.text,
                  width: 140 * u,
                  flexShrink: 0,
                  letterSpacing: 1 * u,
                }}
              >
                {r.ticker}
              </span>

              <div
                style={{
                  flex: 1,
                  height: 34 * u,
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: 8 * u,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: `${pct * 100}%`,
                    background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.buy})`,
                    borderRadius: 8 * u,
                    boxShadow: `0 0 ${16 * u}px ${COLORS.accentGlow}`,
                  }}
                />
              </div>

              {/* Score sits in its own column. Inside the bar it collided with
                  the fill edge on high scores, which is exactly where the top
                  ranks live. */}
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: type.micro,
                  fontWeight: 700,
                  color: COLORS.text,
                  width: 74 * u,
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              >
                {r.momentumScore.toFixed(1)}
              </span>

              <span
                style={{
                  fontFamily: MONO,
                  fontSize: type.label,
                  fontWeight: 700,
                  color: signColor(r.ret63d),
                  width: 112 * u,
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              >
                {fmtPct(r.ret63d, 0)}
              </span>
            </div>
          );
        })}
      </div>
    </SceneShell>
  );
};
