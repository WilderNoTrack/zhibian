// S9 情感收束：AIGC 片段 D（晨光里放下手机、抬头微笑）。
// 入场走 shot-transitions · shot-transitions-5 虚焦接力（C 式）：前景 blur 0→8 与后景 8→0 交叉 14f，
// 两景错开 3f 起跑（前景 blur 在 Main 里包 critic 镜头实现）。
import { AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { HANDOFF } from '../timeline';
import { clamp } from '../tokens';

export const DawnScene: React.FC = () => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, HANDOFF], [0, 1], clamp);
  const b = interpolate(frame, [3, HANDOFF + 3], [8, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: o, filter: b > 0.01 ? `blur(${b}px)` : undefined, background: '#fff' }}>
      <OffthreadVideo src={staticFile('aigc/D_close.mp4')} muted trimBefore={36} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </AbsoluteFill>
  );
};
