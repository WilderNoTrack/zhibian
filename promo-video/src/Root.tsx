import { Composition } from 'remotion';
import { Main } from './Main';
import { TOTAL, FPS } from './timeline';

export const Root: React.FC = () => (
  <Composition
    id="ZhibianPromo"
    component={Main}
    durationInFrames={TOTAL}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={{ bgm: true }}
  />
);
