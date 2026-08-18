// The single timing model. Every frame constant in the video resolves from
// here, so scene lengths follow the data: a nine-position day runs longer than
// a two-position day, and a day with no thesis drops that scene entirely
// rather than holding on an empty frame.

import type { DailyDeck } from '../spine/schema';

export type SceneId =
  | 'open'
  | 'scan'
  | 'verdicts'
  | 'momentum'
  | 'allocation'
  | 'thesis'
  | 'scoreboard'
  | 'endcard';

export interface Scene {
  id: SceneId;
  from: number;
  duration: number;
}

export interface Timeline {
  scenes: Scene[];
  total: number;
  at: (id: SceneId) => Scene | undefined;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Scene fade in/out, in frames. Scenes overlap the background rather than cut
// to black, so this only needs to cover the content.
export const FADE = 12;

export function buildTimeline(deck: DailyDeck, fps = 30): Timeline {
  const s = (n: number) => Math.round((n * fps) / 30); // authored at 30fps

  const lengths: Array<[SceneId, number]> = [
    ['open', s(84)],
    ['scan', s(84)],
    ['verdicts', s(150)],
    // Rows stagger in, so the scene has to outlast the last row's entrance.
    ['momentum', deck.momentum.length ? s(72 + 21 * deck.momentum.length) : 0],
    ['allocation', deck.allocation.length ? s(54 + 56 * deck.allocation.length) : 0],
    // Roughly reading speed: ~2.6 frames per word at 30fps, floored and capped
    // so a terse thesis still lands and a rambling one does not stall the cut.
    [
      'thesis',
      deck.thesis ? clamp(s(72 + deck.thesis.split(/\s+/).length * 2.6), s(150), s(330)) : 0,
    ],
    ['scoreboard', s(144)],
    ['endcard', s(114)],
  ];

  let cursor = 0;
  const scenes: Scene[] = [];
  for (const [id, duration] of lengths) {
    if (duration <= 0) continue; // data-driven skip
    scenes.push({ id, from: cursor, duration });
    cursor += duration;
  }

  return {
    scenes,
    total: cursor,
    at: (id) => scenes.find((sc) => sc.id === id),
  };
}
