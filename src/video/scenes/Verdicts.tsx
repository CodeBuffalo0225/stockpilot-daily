import { interpolate, useCurrentFrame } from 'remotion';
import type { DailyDeck } from '../../spine/schema';
import { COLORS, DISPLAY, MONO } from '../theme';
import { useLayout } from '../layout';
import { SceneShell } from '../components/SceneShell';
import { CountUp, EASE_OUT, Kicker } from '../components/Primitives';

// The verdict split. A stacked bar carries the proportion; the tiles carry the
// counts. SKIP dominating is the honest normal case and is shown at full size
// rather than hidden — the discipline is the story.
export const Verdicts: React.FC<{ deck: DailyDeck; duration: number }> = ({ deck, duration }) => {
  const frame = useCurrentFrame();
  const { u, type, isVertical } = useLayout();

  const { buy, watch, skip } = deck.counts;
  const total = Math.max(buy + watch + skip, 1);

  const segments = [
    { key: 'BUY', n: buy, color: COLORS.buy },
    { key: 'WATCH', n: watch, color: COLORS.watch },
    { key: 'SKIP', n: skip, color: COLORS.skip },
  ];

  const grow = interpolate(frame - 16, [0, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE_OUT,
  });

  return (
    <SceneShell duration={duration} fill={1.14}>
      <Kicker delay={4} color={COLORS.buy}>
        The Board
      </Kicker>
      <div style={{ height: 36 * u }} />

      {/* Stacked proportion bar. */}
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: 30 * u,
          borderRadius: 30 * u,
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.05)',
        }}
      >
        {segments.map((s) => (
          <div
            key={s.key}
            style={{
              width: `${(s.n / total) * 100 * grow}%`,
              background: s.color,
              boxShadow: `0 0 ${18 * u}px ${s.color}66`,
            }}
          />
        ))}
      </div>

      <div style={{ height: 40 * u }} />

      <div
        style={{
          display: 'flex',
          flexDirection: isVertical ? 'column' : 'row',
          gap: 18 * u,
          width: '100%',
        }}
      >
        {segments.map((s, i) => {
          const delay = 30 + i * 12;
          const enter = interpolate(frame - delay, [0, 26], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: EASE_OUT,
          });
          return (
            <div
              key={s.key}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 20 * u,
                background: COLORS.panel,
                border: `1px solid ${s.color}44`,
                borderRadius: 18 * u,
                padding: `${isVertical ? 26 * u : 30 * u}px ${28 * u}px`,
                opacity: enter,
                translate: `${(1 - enter) * (isVertical ? 40 : 0) * u}px ${(1 - enter) * (isVertical ? 0 : 30) * u}px`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 * u }}>
                <div
                  style={{
                    width: 16 * u,
                    height: 16 * u,
                    borderRadius: 16 * u,
                    background: s.color,
                    boxShadow: `0 0 ${16 * u}px ${s.color}`,
                  }}
                />
                <span
                  style={{
                    fontFamily: DISPLAY,
                    fontSize: type.title,
                    fontWeight: 800,
                    color: COLORS.text,
                    letterSpacing: 1 * u,
                  }}
                >
                  {s.key}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 * u }}>
                <CountUp
                  value={s.n}
                  delay={delay + 4}
                  duration={28}
                  style={{ fontSize: type.headline, fontWeight: 800, color: s.color, lineHeight: 1 }}
                />
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: type.micro,
                    color: COLORS.textFaint,
                  }}
                >
                  {Math.round((s.n / total) * 100)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: 30 * u }} />
      <div
        style={{
          fontFamily: MONO,
          fontSize: type.micro,
          color: COLORS.textFaint,
          letterSpacing: 1.5 * u,
          whiteSpace: 'nowrap',
          opacity: interpolate(frame - 76, [0, 20], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        {deck.unansweredCount} QUESTIONS LOGGED · HARD CAP 3 BUYS/DAY
      </div>
    </SceneShell>
  );
};
