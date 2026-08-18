// One layout model serving both orientations.
//
// Type never rescales between formats: the scale unit is derived from the
// SHORTER edge, which is 1080 in both 1080x1920 and 1920x1080, so a headline is
// physically the same size in each. What changes is arrangement — `stack` in
// vertical, `split` in landscape — and scenes branch on that, not on raw px.

import { useVideoConfig } from 'remotion';

export interface Layout {
  width: number;
  height: number;
  isVertical: boolean;
  /** Scale unit: 1.0 at 1080p on the short edge. Multiply every px by this. */
  u: number;
  padX: number;
  padY: number;
  contentW: number;
  contentH: number;
  /** Type ramp, already scaled. */
  type: {
    hero: number;
    headline: number;
    title: number;
    body: number;
    label: number;
    micro: number;
    tape: number;
  };
}

export const useLayout = (): Layout => {
  const { width, height } = useVideoConfig();
  const isVertical = height >= width;
  const u = Math.min(width, height) / 1080;

  const padX = (isVertical ? 80 : 110) * u;
  const padY = (isVertical ? 100 : 74) * u;

  return {
    width,
    height,
    isVertical,
    u,
    padX,
    padY,
    contentW: width - padX * 2,
    contentH: height - padY * 2,
    type: {
      hero: 168 * u,
      headline: 92 * u,
      title: 60 * u,
      body: 44 * u,
      label: 30 * u,
      micro: 24 * u,
      tape: 30 * u,
    },
  };
};
