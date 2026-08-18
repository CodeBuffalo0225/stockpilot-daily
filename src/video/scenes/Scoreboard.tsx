import { interpolate, useCurrentFrame } from 'remotion';
import type { DailyDeck } from '../../spine/schema';
import { COLORS, DISPLAY, MONO } from '../theme';
import { useLayout } from '../layout';
import { SceneShell } from '../components/SceneShell';
import { CountUp, EASE_OUT, Kicker } from '../components/Primitives';

// Accountability panel: how many past calls got scored against outcomes, and
// which watchlist slots the rotation agent flagged. This is the part of the
// system that grades itself, so it gets its own scene rather than a footnote.
export const Scoreboard: React.FC<{ deck: DailyDeck; duration: number }> = ({ deck, duration }) => {
  const frame = useCurrentFrame();
  const { u, type, isVertical } = useLayout();

  const o = deck.outcomes;
  const windows: Array<[string, number]> = o
    ? [
        ['5D', o.scored5d],
        ['15D', o.scored15d],
        ['30D', o.scored30d],
      ]
    : [];

  return (
    <SceneShell duration={duration} fill={1.14}>
      <Kicker delay={4} color={COLORS.accent}>
        Scoreboard
      </Kicker>
      <div style={{ height: 26 * u }} />

      {windows.length > 0 && (
        <>
          <div
            style={{
              fontFamily: MONO,
              fontSize: type.micro,
              color: COLORS.textFaint,
              letterSpacing: 3 * u,
              textTransform: 'uppercase',
            }}
          >
            Past calls scored against outcomes
          </div>
          <div style={{ height: 18 * u }} />
          <div style={{ display: 'flex', gap: 16 * u, width: '100%' }}>
            {windows.map(([label, n], i) => {
              const enter = interpolate(frame - (12 + i * 8), [0, 22], [0, 1], {
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
                    padding: `${20 * u}px ${18 * u}px`,
                    textAlign: 'center',
                    opacity: enter,
                    translate: `0px ${(1 - enter) * 24 * u}px`,
                  }}
                >
                  <CountUp
                    value={n}
                    delay={16 + i * 8}
                    duration={26}
                    style={{ fontSize: type.headline * 0.8, fontWeight: 800, color: COLORS.accent }}
                  />
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: type.micro,
                      color: COLORS.textFaint,
                      letterSpacing: 3 * u,
                      marginTop: 6 * u,
                    }}
                  >
                    {label} WINDOW
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ height: 34 * u }} />
        </>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14 * u,
          opacity: interpolate(frame - 46, [0, 18], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: type.title * 0.86,
            fontWeight: 800,
            color: COLORS.text,
          }}
        >
          Rotation watch
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: type.micro,
            fontWeight: 700,
            color: COLORS.watch,
            border: `1px solid ${COLORS.watch}55`,
            borderRadius: 6 * u,
            padding: `${4 * u}px ${10 * u}px`,
          }}
        >
          {deck.rotations.flagged} FLAGGED
        </span>
      </div>

      <div style={{ height: 16 * u }} />

      <div
        style={{
          display: 'flex',
          flexDirection: isVertical ? 'column' : 'row',
          gap: 12 * u,
          width: '100%',
        }}
      >
        {deck.rotations.suggestions.map((r, i) => {
          const enter = interpolate(frame - (54 + i * 10), [0, 22], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: EASE_OUT,
          });
          return (
            <div
              key={r.tickerOut}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 16 * u,
                background: COLORS.panel,
                border: `1px solid ${COLORS.panelEdge}`,
                borderRadius: 14 * u,
                padding: `${18 * u}px ${22 * u}px`,
                opacity: enter,
                translate: `${(1 - enter) * 30 * u}px 0px`,
              }}
            >
              <span
                style={{
                  fontFamily: DISPLAY,
                  fontSize: type.body,
                  fontWeight: 800,
                  color: COLORS.skip,
                  textDecoration: 'line-through',
                  textDecorationThickness: 2 * u,
                }}
              >
                {r.tickerOut}
              </span>
              <span style={{ fontFamily: MONO, fontSize: type.body, color: COLORS.textFaint }}>→</span>
              <span
                style={{
                  fontFamily: DISPLAY,
                  fontSize: type.body,
                  fontWeight: 800,
                  color: COLORS.buy,
                }}
              >
                {r.topCandidate ?? '—'}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: type.micro,
                  color: COLORS.textFaint,
                  marginLeft: 'auto',
                  letterSpacing: 1.5 * u,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {(r.reason ?? '').replace(/_/g, ' ').toUpperCase()}
              </span>
            </div>
          );
        })}
      </div>
    </SceneShell>
  );
};
