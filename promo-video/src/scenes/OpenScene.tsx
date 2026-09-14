// S1 开场：AIGC 片段 A（深夜刷手机、犹豫），片段自带缓推；只做黑场淡入，字幕在 Main 叠加。
import { AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { clamp } from '../tokens';

export const OpenScene: React.FC = () => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 12], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ opacity: fadeIn }}>
        <OffthreadVideo src={staticFile('aigc/A_open.mp4')} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      {/* 底部轻压暗，给字幕卡留对比 */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, transparent 60%, rgba(0,0,0,.28))' }} />
    </AbsoluteFill>
  );
};
