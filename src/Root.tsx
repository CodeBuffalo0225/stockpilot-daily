import { Composition } from 'remotion';
import './index.css';
import { StockPilotDaily } from './video/StockPilotDaily';
import { DailyDeck } from './spine/schema';
import { buildTimeline } from './video/timing';
import sampleDeck from './fixtures/sample-deck.json';

const FPS = 30;

// The fixture is a real deck produced by the spine, committed so the Studio
// always opens on something truthful. A render overrides it with the day's
// deck via --props=data/deck.json.
const defaultProps = DailyDeck.parse(sampleDeck);

// Duration follows the data, so a nine-position day is not squeezed into the
// same runtime as a two-position day.
const calculateMetadata = ({ props }: { props: DailyDeck }) => ({
  durationInFrames: buildTimeline(props, FPS).total,
});

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="StockPilotDaily"
        component={StockPilotDaily}
        schema={DailyDeck}
        defaultProps={defaultProps}
        calculateMetadata={calculateMetadata}
        durationInFrames={1200}
        fps={FPS}
        width={1080}
        height={1920}
      />
      <Composition
        id="StockPilotDailyLandscape"
        component={StockPilotDaily}
        schema={DailyDeck}
        defaultProps={defaultProps}
        calculateMetadata={calculateMetadata}
        durationInFrames={1200}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
