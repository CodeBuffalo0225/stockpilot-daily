import { AbsoluteFill, Sequence } from 'remotion';
import type { DailyDeck } from '../spine/schema';
import { buildTimeline, type SceneId } from './timing';
import { Backdrop } from './components/Backdrop';
import { TickerTape } from './components/TickerTape';
import { Hud } from './components/Hud';
import { Open } from './scenes/Open';
import { Scan } from './scenes/Scan';
import { Verdicts } from './scenes/Verdicts';
import { Momentum } from './scenes/Momentum';
import { Allocation } from './scenes/Allocation';
import { Thesis } from './scenes/Thesis';
import { Scoreboard } from './scenes/Scoreboard';
import { EndCard } from './scenes/EndCard';

const SCENES: Record<
  SceneId,
  { label: string; Component: React.FC<{ deck: DailyDeck; duration: number }> }
> = {
  open: { label: 'Brief', Component: Open },
  scan: { label: 'Scan', Component: Scan },
  verdicts: { label: 'Board', Component: Verdicts },
  momentum: { label: 'Momentum', Component: Momentum },
  allocation: { label: 'Allocation', Component: Allocation },
  thesis: { label: 'Read', Component: Thesis },
  scoreboard: { label: 'Scoreboard', Component: Scoreboard },
  endcard: { label: 'End', Component: EndCard },
};

export const StockPilotDaily: React.FC<DailyDeck> = (deck) => {
  const timeline = buildTimeline(deck);

  return (
    <AbsoluteFill>
      <Backdrop />

      {/* Tapes bracket the frame and run the entire video. They scroll in
          opposite directions at different speeds so the two never appear to be
          one element sliding behind the content. */}
      <AbsoluteFill style={{ display: 'flex', flexDirection: 'column' }}>
        <TickerTape items={deck.tape} direction="left" speed={2.6} />

        <div style={{ flex: 1, position: 'relative' }}>
          {timeline.scenes.map(({ id, from, duration }) => {
            const { Component, label } = SCENES[id];
            return (
              <Sequence key={id} name={label} from={from} durationInFrames={duration}>
                <Hud date={deck.date} label={label} />
                <Component deck={deck} duration={duration} />
              </Sequence>
            );
          })}
        </div>

        <TickerTape items={deck.tape} direction="right" speed={1.7} dim={0.75} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
