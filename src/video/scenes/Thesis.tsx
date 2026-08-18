import { interpolate, useCurrentFrame } from 'remotion';
import type { DailyDeck } from '../../spine/schema';
import { COLORS, DISPLAY, MONO } from '../theme';
import { useLayout } from '../layout';
import { SceneShell } from '../components/SceneShell';
import { Kicker } from '../components/Primitives';

// The day's thesis, revealed word by word. The pipeline's thesis runs long, so
// the visible text is bounded at a sentence boundary rather than mid-clause.
const boundedThesis = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '), cut.lastIndexOf(' — '));
  return stop > maxChars * 0.5 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`;
};

export const Thesis: React.FC<{ deck: DailyDeck; duration: number }> = ({ deck, duration }) => {
  const frame = useCurrentFrame();
  const { u, type, isVertical } = useLayout();

  const text = boundedThesis(deck.thesis, isVertical ? 420 : 380);
  const words = text.split(/\s+/);

  // Reveal spans the middle of the scene, leaving the tail to read and the
  // head for the kicker to land first.
  const revealStart = 18;
  const revealEnd = Math.max(duration - 46, revealStart + 24);

  return (
    <SceneShell duration={duration} fill={1.16}>
      <Kicker delay={2} color={COLORS.watch}>
        The Read
      </Kicker>
      <div style={{ height: 34 * u }} />

      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: isVertical ? type.body * 1.12 : type.body * 1.05,
          fontWeight: 500,
          lineHeight: 1.42,
          color: COLORS.text,
          maxWidth: isVertical ? '100%' : '78%',
        }}
      >
        {words.map((w, i) => {
          const at = interpolate(i, [0, Math.max(words.length - 1, 1)], [revealStart, revealEnd]);
          return (
            <span
              key={i}
              style={{
                opacity: interpolate(frame - at, [0, 10], [0.13, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
              }}
            >
              {w}{' '}
            </span>
          );
        })}
      </div>

      <div style={{ height: 34 * u }} />
      <div
        style={{
          fontFamily: MONO,
          fontSize: type.micro,
          color: COLORS.textFaint,
          letterSpacing: 3 * u,
          opacity: interpolate(frame - (revealEnd - 10), [0, 20], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        — STOCKPILOT AGENT 4 · ALLOCATOR
      </div>
    </SceneShell>
  );
};
