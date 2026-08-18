import { interpolate, useCurrentFrame } from 'remotion';
import type { DailyDeck } from '../../spine/schema';
import { COLORS, DISPLAY, MONO, fmtDate } from '../theme';
import { useLayout } from '../layout';
import { SceneShell } from '../components/SceneShell';
import { EASE_OUT, RiseIn } from '../components/Primitives';

const SOURCE_LABEL: Record<DailyDeck['source'], string> = {
  'local+notion': 'PIPELINE + NOTION',
  local: 'PIPELINE REPORT',
  notion: 'NOTION LOG',
  fixture: 'SAMPLE DATA',
};

export const EndCard: React.FC<{ deck: DailyDeck; duration: number }> = ({ deck, duration }) => {
  const frame = useCurrentFrame();
  const { u, type } = useLayout();

  return (
    <SceneShell duration={duration} justify="center">
      <RiseIn
        delay={6}
        style={{
          fontSize: type.headline,
          fontWeight: 900,
          letterSpacing: -2 * u,
          lineHeight: 1,
        }}
      >
        STOCK<span style={{ color: COLORS.accent }}>PILOT</span>
      </RiseIn>

      <div style={{ height: 20 * u }} />

      <div
        style={{
          height: 3 * u,
          width: '100%',
          background: `linear-gradient(90deg, ${COLORS.accent}, ${COLORS.buy}, transparent)`,
          scale: `${interpolate(frame - 16, [0, 28], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: EASE_OUT,
          })} 1`,
          transformOrigin: 'left',
        }}
      />

      <div style={{ height: 26 * u }} />

      <div
        style={{
          fontFamily: MONO,
          fontSize: type.label,
          color: COLORS.textDim,
          letterSpacing: 2 * u,
          lineHeight: 1.7,
          opacity: interpolate(frame - 28, [0, 20], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        {fmtDate(deck.date)}
        <br />
        SOURCE: {SOURCE_LABEL[deck.source]}
      </div>

      <div style={{ height: 40 * u }} />

      {/* Not decoration. This is a personal research pipeline's output, and the
          video is shareable — the disclaimer ships with the frame. */}
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: type.micro * 1.05,
          color: COLORS.textFaint,
          lineHeight: 1.5,
          maxWidth: '92%',
          opacity: interpolate(frame - 42, [0, 22], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        Automated research output. Not investment advice, not a recommendation, and
        not a solicitation to buy or sell any security. Do your own diligence.
      </div>
    </SceneShell>
  );
};
