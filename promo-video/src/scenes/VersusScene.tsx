// S2 对撞开屏：transition-hidden-cut · versus-slam（demos/transition/transition-hidden-cut/VersusSlam.tsx）。
// 保留命门：78° 斜缝 polygon、±1200px ease-in(cubic) 10f 对冲、撞击帧三件套同帧起跑
// （白闪 0.9→0 3f + 整机 shake 12px·e^(−t/1.6) + VS scale 1.6→1 back(2.6) 6f）。
// 适配：两半屏换成 AIGC 片段 B（左方·大城市）/ C（右方·小城工作室），在开场片段上方对冲进场；
// 蒙皮换知乎 tokens（左橙右靛色罩、产品 side-label 样式、真实阵营名）。
import { AbsoluteFill, Easing, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { FONT, T, clamp } from '../tokens';

const IMPACT = 10;
const SEAM_TOP_X = 1075;
const SEAM_BOT_X = 845;
const SEAM_DEG = (Math.atan2(SEAM_TOP_X - SEAM_BOT_X, 1080) * 180) / Math.PI;
const outCubic = Easing.out(Easing.cubic);

const SideTitle: React.FC<{ side: 'left' | 'right'; label: string; text: string; cue: number }> = ({ side, label, text, cue }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [cue, cue + 14], [0, 1], { ...clamp, easing: outCubic });
  const color = side === 'left' ? T.left : T.right;
  return (
    <div
      style={{
        position: 'absolute', bottom: 150, [side]: 110,
        display: 'flex', flexDirection: 'column', alignItems: side === 'left' ? 'flex-start' : 'flex-end', gap: 18,
        opacity: p, transform: `translateY(${30 * (1 - p)}px)`, filter: `blur(${(1 - p) * 8}px)`,
      }}
    >
      <span style={{ fontFamily: FONT, fontSize: 36, fontWeight: 600, color: '#fff', background: color, borderRadius: T.radius, padding: '4px 16px' }}>
        {label}
      </span>
      <span style={{ fontFamily: FONT, fontSize: 68, fontWeight: 700, color: '#fff', textShadow: '0 2px 22px rgba(0,0,0,.5)', letterSpacing: '0.02em' }}>
        {text}
      </span>
    </div>
  );
};

export const VersusScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const leftX = interpolate(frame, [0, IMPACT], [-1200, 0], { ...clamp, easing: Easing.in(Easing.cubic) });
  const rightX = -leftX;
  const since = frame - IMPACT;
  const env = since >= 0 ? 12 * Math.exp(-since / 1.6) : 0;
  const shakeX = env * Math.sin(since * 3.4);
  const shakeY = env * 0.6 * Math.sin(since * 4.1 + 0.7);
  const flash = interpolate(frame, [IMPACT, IMPACT + 3], [0.9, 0], clamp);
  const vsScale = interpolate(frame, [IMPACT, IMPACT + 6], [1.6, 1], { ...clamp, easing: Easing.out(Easing.back(2.6)) });
  const vsOpacity = interpolate(frame, [IMPACT, IMPACT + 2], [0, 1], clamp);
  const impacted = frame >= IMPACT;
  const toWhite = interpolate(frame, [dur - 9, dur], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, transform: `translate(${shakeX}px, ${shakeY}px)` }}>
        {/* 左半屏：B 片段（大城市），镜像让人物留在左半画内；0.6x 慢放拉长为 4s */}
        <div style={{ position: 'absolute', inset: 0, transform: `translateX(${leftX}px)`, clipPath: `polygon(0px 0px, ${SEAM_TOP_X}px 0px, ${SEAM_BOT_X}px 1080px, 0px 1080px)` }}>
          <OffthreadVideo src={staticFile('aigc/B_left.mp4')} muted playbackRate={0.6} trimBefore={20}
            style={{ position: 'absolute', width: 1920, height: 1080, objectFit: 'cover', transform: 'translateX(-330px)' }} />
          <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(224,85,47,.30), rgba(224,85,47,.08) 70%)' }} />
        </div>
        {/* 右半屏：C 片段（小城工作室） */}
        <div style={{ position: 'absolute', inset: 0, transform: `translateX(${rightX}px)`, clipPath: `polygon(${SEAM_TOP_X}px 0px, 1920px 0px, 1920px 1080px, ${SEAM_BOT_X}px 1080px)` }}>
          <OffthreadVideo src={staticFile('aigc/C_right.mp4')} muted playbackRate={0.7} trimBefore={6}
            style={{ position: 'absolute', width: 1920, height: 1080, objectFit: 'cover' }} />
          <AbsoluteFill style={{ background: 'linear-gradient(270deg, rgba(74,91,214,.32), rgba(74,91,214,.08) 70%)' }} />
        </div>
        {impacted && (
          <div style={{ position: 'absolute', left: 960 - 6, top: 540 - 700, width: 12, height: 1400, background: '#fff', transform: `rotate(${SEAM_DEG}deg)`, boxShadow: '0 0 24px rgba(0,0,0,.25)' }} />
        )}
        {impacted && (
          <div
            style={{
              position: 'absolute', left: 960, top: 540,
              transform: `translate(-50%, -50%) rotate(${SEAM_DEG}deg) scale(${vsScale})`, opacity: vsOpacity,
              background: T.card, border: `6px solid ${T.text}`, borderRadius: 20, padding: '10px 44px',
              boxShadow: '0 18px 60px rgba(0,0,0,0.35)',
              fontFamily: FONT, fontSize: 132, fontWeight: 900, color: T.text, lineHeight: 1.05, letterSpacing: '0.02em',
            }}
          >
            VS
          </div>
        )}
        <SideTitle side="left" label="左方" text="先满足生存与独立" cue={IMPACT + 8} />
        <SideTitle side="right" label="右方" text="成长空间放在首位" cue={IMPACT + 14} />
      </div>
      <AbsoluteFill style={{ background: '#ffffff', opacity: flash, pointerEvents: 'none' }} />
      <AbsoluteFill style={{ background: '#ffffff', opacity: toWhite, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
