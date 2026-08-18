import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { FADE } from '../timing';
import { useLayout } from '../layout';

// Wraps a scene's content in the safe area and handles its fade in/out.
// Scenes fade against the persistent backdrop, never to black, so the tape and
// grid carry continuity across every cut.
//
// `fill` scales sparse scenes up in the vertical cut, where a centred block of
// content otherwise floats in a tall empty frame. The inner box is narrowed by
// the same factor before scaling, so type and spacing grow together while the
// content still lands exactly inside the horizontal safe area. Dense scenes
// (momentum, allocation) leave it at 1 — they already fill the frame.
export const SceneShell: React.FC<{
  duration: number;
  children: React.ReactNode;
  justify?: React.CSSProperties['justifyContent'];
  fill?: number;
}> = ({ duration, children, justify = 'center', fill = 1 }) => {
  const frame = useCurrentFrame();
  const { padX, padY, isVertical } = useLayout();

  const opacity = interpolate(
    frame,
    [0, FADE, Math.max(duration - FADE, FADE + 1), duration],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const k = isVertical ? fill : 1;

  return (
    <AbsoluteFill
      style={{
        padding: `${padY}px ${padX}px`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: justify,
        alignItems: 'center',
        opacity,
      }}
    >
      <div
        style={{
          width: `${100 / k}%`,
          scale: String(k),
          transformOrigin: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};
