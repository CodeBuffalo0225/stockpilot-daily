import { interpolate, useCurrentFrame } from 'remotion';
import type { DailyDeck } from '../../spine/schema';
import { COLORS, DISPLAY, MONO, TIER_LABEL } from '../theme';
import { useLayout } from '../layout';
import { SceneShell } from '../components/SceneShell';
import { CountUp, EASE_OUT, Kicker } from '../components/Primitives';

// Truncate on a word boundary so a card never ends mid-word or overflows its
// box. Notes from the scorer run long and variable; the card height does not.
const clip = (s: string | null, max: number): string | null => {
  if (!s) return null;
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${cut.slice(0, at > max * 0.6 ? at : max).trimEnd()}…`;
};

export const Allocation: React.FC<{ deck: DailyDeck; duration: number }> = ({ deck, duration }) => {
  const frame = useCurrentFrame();
  const { u, type, isVertical } = useLayout();

  const rows = deck.allocation;
  // Notes shrink as the card count grows so the column always fits the frame.
  const noteMax = rows.length <= 3 ? 150 : rows.length <= 4 ? 110 : 74;

  return (
    <SceneShell duration={duration}>
      <Kicker delay={4} color={COLORS.buy}>
        Today&apos;s Allocation
      </Kicker>
      <div style={{ height: 26 * u }} />

      <div
        style={{
          display: 'flex',
          flexDirection: isVertical ? 'column' : 'row',
          flexWrap: isVertical ? 'nowrap' : 'wrap',
          gap: 16 * u,
          width: '100%',
        }}
      >
        {rows.map((p, i) => {
          const delay = 10 + i * 22;
          const enter = interpolate(frame - delay, [0, 26], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: EASE_OUT,
          });
          const note = clip(p.entryNote, noteMax);

          return (
            <div
              key={p.ticker}
              style={{
                position: 'relative',
                flex: isVertical ? '0 0 auto' : '1 1 45%',
                background: COLORS.panel,
                border: `1px solid ${COLORS.buy}3A`,
                borderRadius: 20 * u,
                padding: `${22 * u}px ${26 * u}px`,
                overflow: 'hidden',
                opacity: enter,
                translate: `0px ${(1 - enter) * 40 * u}px`,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 5 * u,
                  background: COLORS.buy,
                  boxShadow: `0 0 ${14 * u}px ${COLORS.buyGlow}`,
                }}
              />

              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 * u }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 * u, minWidth: 0 }}>
                  <span
                    style={{
                      fontFamily: DISPLAY,
                      fontSize: type.title,
                      fontWeight: 900,
                      color: COLORS.text,
                      letterSpacing: 1 * u,
                    }}
                  >
                    {p.ticker}
                  </span>
                  {p.sector && (
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: type.micro,
                        color: COLORS.textFaint,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {p.sector}
                    </span>
                  )}
                </div>

                <CountUp
                  value={p.positionPct}
                  digits={p.positionPct % 1 === 0 ? 0 : 1}
                  suffix="%"
                  delay={delay + 8}
                  duration={26}
                  style={{
                    fontSize: type.headline * 0.72,
                    fontWeight: 800,
                    color: COLORS.buy,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                />
              </div>

              <div style={{ height: 12 * u }} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 * u, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: type.micro,
                    fontWeight: 700,
                    color: COLORS.buy,
                    border: `1px solid ${COLORS.buy}55`,
                    borderRadius: 6 * u,
                    padding: `${4 * u}px ${10 * u}px`,
                    letterSpacing: 2 * u,
                  }}
                >
                  TIER {p.tier} · {TIER_LABEL[p.tier] ?? ''}
                </span>
                {p.timeHorizon && (
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: type.micro,
                      color: COLORS.textDim,
                      border: `1px solid ${COLORS.panelEdge}`,
                      borderRadius: 6 * u,
                      padding: `${4 * u}px ${10 * u}px`,
                    }}
                  >
                    {p.timeHorizon}
                  </span>
                )}
                {p.alphaScore != null && (
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: type.micro,
                      color: COLORS.textDim,
                    }}
                  >
                    alpha {p.alphaScore.toFixed(1)}
                  </span>
                )}
              </div>

              {note && (
                <>
                  <div style={{ height: 14 * u }} />
                  <div
                    style={{
                      fontFamily: DISPLAY,
                      fontSize: type.label,
                      lineHeight: 1.34,
                      color: COLORS.textDim,
                      opacity: interpolate(frame - (delay + 14), [0, 18], [0, 1], {
                        extrapolateLeft: 'clamp',
                        extrapolateRight: 'clamp',
                      }),
                    }}
                  >
                    <span style={{ color: COLORS.buy, fontWeight: 700 }}>ENTRY </span>
                    {note}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </SceneShell>
  );
};
