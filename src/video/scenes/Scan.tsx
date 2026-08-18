import { interpolate, useCurrentFrame } from 'remotion';
import type { DailyDeck } from '../../spine/schema';
import { COLORS, DISPLAY, MONO } from '../theme';
import { useLayout } from '../layout';
import { SceneShell } from '../components/SceneShell';
import { CountUp, EASE_OUT, Kicker } from '../components/Primitives';

// The funnel: how much was looked at to produce today's handful of names.
export const Scan: React.FC<{ deck: DailyDeck; duration: number }> = ({ deck, duration }) => {
  const frame = useCurrentFrame();
  const { u, type, isVertical } = useLayout();

  const stats: Array<[string, number]> = [
    ['Screened', deck.counts.screened],
    ['Universe', deck.counts.universe],
    ['Scored', deck.counts.buy + deck.counts.watch + deck.counts.skip],
  ];

  return (
    <SceneShell duration={duration} fill={1.16}>
      <Kicker delay={4}>Market Scan</Kicker>
      <div style={{ height: 40 * u }} />

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 * u }}>
        <CountUp
          value={deck.counts.screened}
          delay={10}
          duration={44}
          style={{
            fontSize: type.hero,
            fontWeight: 800,
            color: COLORS.accent,
            lineHeight: 1,
            textShadow: `0 0 ${40 * u}px ${COLORS.accentGlow}`,
          }}
        />
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: type.title,
            fontWeight: 800,
            color: COLORS.textDim,
            textTransform: 'uppercase',
            letterSpacing: 2 * u,
          }}
        >
          tickers
        </span>
      </div>

      <div style={{ height: 16 * u }} />
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: type.body,
          color: COLORS.textDim,
          maxWidth: isVertical ? '100%' : '62%',
          lineHeight: 1.35,
          opacity: interpolate(frame - 34, [0, 18], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        screened for momentum, relative strength and volume surge before a single
        name reached the scorer.
      </div>

      <div style={{ height: 46 * u }} />

      <div style={{ display: 'flex', gap: 18 * u, width: '100%' }}>
        {stats.map(([label, value], i) => {
          const enter = interpolate(frame - (46 + i * 8), [0, 22], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: EASE_OUT,
          });
          return (
            <div
              key={label}
              style={{
                flex: 1,
                background: COLORS.panel,
                border: `1px solid ${COLORS.panelEdge}`,
                borderRadius: 16 * u,
                padding: `${22 * u}px ${20 * u}px`,
                opacity: enter,
                translate: `0px ${(1 - enter) * 26 * u}px`,
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: type.micro,
                  color: COLORS.textFaint,
                  letterSpacing: 3 * u,
                  textTransform: 'uppercase',
                  marginBottom: 10 * u,
                }}
              >
                {label}
              </div>
              <CountUp
                value={value}
                delay={50 + i * 8}
                duration={30}
                style={{ fontSize: type.title, fontWeight: 800, color: COLORS.text }}
              />
            </div>
          );
        })}
      </div>
    </SceneShell>
  );
};
