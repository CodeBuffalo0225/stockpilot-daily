import { interpolate, useCurrentFrame } from 'remotion';
import { COLORS, MONO } from '../theme';
import { useLayout } from '../layout';

// Persistent corner readout. Sits inside the safe-area margin, above every
// scene, so the frame always says what it is and which day it belongs to.
export const Hud: React.FC<{ date: string; label: string }> = ({ date, label }) => {
  const frame = useCurrentFrame();
  const { u, padX, type } = useLayout();

  return (
    <div
      style={{
        position: 'absolute',
        top: 30 * u,
        left: padX,
        right: padX,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontFamily: MONO,
        fontSize: type.micro,
        letterSpacing: 3 * u,
        color: COLORS.textFaint,
        textTransform: 'uppercase',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 * u }}>
        <span
          style={{
            width: 10 * u,
            height: 10 * u,
            borderRadius: 10 * u,
            background: COLORS.buy,
            // Slow pulse: a live-terminal cue, not a blink.
            opacity: interpolate(frame % 60, [0, 30, 60], [0.35, 1, 0.35]),
          }}
        />
        <span>STOCKPILOT DAILY</span>
      </div>
      <span>
        {label} · {date}
      </span>
    </div>
  );
};
