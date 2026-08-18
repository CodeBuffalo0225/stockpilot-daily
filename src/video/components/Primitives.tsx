import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { COLORS, DISPLAY, MONO } from '../theme';
import { useLayout } from '../layout';

// Shared easing. Bezier(0.16, 1, 0.3, 1) is a hard decelerate — motion arrives
// fast and settles, which reads as instrumentation rather than animation.
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

/** Counts a number up. Rounds to `digits`, monospaced so it cannot reflow. */
export const CountUp: React.FC<{
  value: number;
  from?: number;
  delay?: number;
  duration?: number;
  digits?: number;
  suffix?: string;
  prefix?: string;
  style?: React.CSSProperties;
}> = ({ value, from = 0, delay = 0, duration = 36, digits = 0, suffix = '', prefix = '', style }) => {
  const frame = useCurrentFrame();
  const n = interpolate(frame - delay, [0, duration], [from, value], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE_OUT,
  });
  return (
    <span style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums', ...style }}>
      {prefix}
      {n.toFixed(digits)}
      {suffix}
    </span>
  );
};

/** Small uppercase kicker with a leading rule — the scene's label. */
export const Kicker: React.FC<{ children: React.ReactNode; color?: string; delay?: number }> = ({
  children,
  color = COLORS.accent,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { u, type } = useLayout();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16 * u,
        opacity: interpolate(frame - delay, [0, 14], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: EASE_OUT,
        }),
        translate: interpolate(frame - delay, [0, 20], [-18 * u, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: EASE_OUT,
        }) + 'px 0px',
      }}
    >
      <div style={{ width: 46 * u, height: 4 * u, background: color, borderRadius: 4 }} />
      <div
        style={{
          fontFamily: MONO,
          fontSize: type.label,
          fontWeight: 700,
          letterSpacing: 4 * u,
          color,
          textTransform: 'uppercase',
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** Headline that wipes up from a clipped baseline. */
export const RiseIn: React.FC<{
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  style?: React.CSSProperties;
}> = ({ children, delay = 0, distance = 46, style }) => {
  const frame = useCurrentFrame();
  const { u } = useLayout();
  return (
    <div style={{ overflow: 'hidden', paddingBottom: 4 * u }}>
      <div
        style={{
          fontFamily: DISPLAY,
          color: COLORS.text,
          opacity: interpolate(frame - delay, [0, 16], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: EASE_OUT,
          }),
          translate:
            '0px ' +
            interpolate(frame - delay, [0, 26], [distance * u, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: EASE_OUT,
            }) +
            'px',
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
};

/** Panel card with an animated left accent bar. */
export const Panel: React.FC<{
  children: React.ReactNode;
  accent?: string;
  delay?: number;
  style?: React.CSSProperties;
}> = ({ children, accent = COLORS.accent, delay = 0, style }) => {
  const frame = useCurrentFrame();
  const { u } = useLayout();
  const enter = interpolate(frame - delay, [0, 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE_OUT,
  });

  return (
    <div
      style={{
        position: 'relative',
        background: COLORS.panel,
        border: `1px solid ${COLORS.panelEdge}`,
        borderRadius: 18 * u,
        overflow: 'hidden',
        opacity: enter,
        translate: `0px ${(1 - enter) * 34 * u}px`,
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 6 * u,
          background: accent,
          scale: `1 ${interpolate(frame - delay, [4, 30], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: EASE_OUT,
          })}`,
          transformOrigin: 'top',
        }}
      />
      {children}
    </div>
  );
};
