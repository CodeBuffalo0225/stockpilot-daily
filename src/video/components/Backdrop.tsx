import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { COLORS } from '../theme';
import { useLayout } from '../layout';

// Instrument grid + a slow drifting glow. Deterministic: every value is a pure
// function of the frame, so any frame renders identically in isolation.
export const Backdrop: React.FC<{ tint?: string }> = ({ tint = COLORS.accent }) => {
  const frame = useCurrentFrame();
  const { u, width, height } = useLayout();
  const cell = 90 * u;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      {/* Grid, drifting one cell over ~8s then repeating seamlessly. */}
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${COLORS.grid} 1px, transparent 1px), linear-gradient(90deg, ${COLORS.grid} 1px, transparent 1px)`,
          backgroundSize: `${cell}px ${cell}px`,
          translate: `0px ${(frame % 240) * (cell / 240)}px`,
          maskImage: `radial-gradient(ellipse at 50% 42%, #000 25%, transparent 78%)`,
          WebkitMaskImage: `radial-gradient(ellipse at 50% 42%, #000 25%, transparent 78%)`,
        }}
      />

      {/* Two counter-drifting glows keep long scenes from feeling static. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(${60 * u}% ${34 * u}% at 50% 30%, ${tint}22, transparent 70%)`,
          opacity: interpolate(frame % 300, [0, 150, 300], [0.55, 0.95, 0.55]),
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(${52 * u}% ${30 * u}% at 50% 78%, ${COLORS.buy}14, transparent 72%)`,
          opacity: interpolate(frame % 360, [0, 180, 360], [0.9, 0.45, 0.9]),
        }}
      />

      {/* Vignette + a faint scanline texture for the terminal read. */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 50%, transparent 45%, ${COLORS.bg} 96%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, rgba(255,255,255,0.028) 0px, rgba(255,255,255,0.028) 1px, transparent 1px, transparent ${3 * u}px)`,
          width,
          height,
        }}
      />
    </AbsoluteFill>
  );
};
