// S3 品牌：type-assembly-moves · drift-assembly（demos/typography/type-assembly-moves/LetterformDriftAssembly.tsx）。
// 保留命门：位移/blur/opacity 三绑定同一 p；STAG 3f、TRAVEL 45f、seed 幅度 260–360px；
// 锁定加深脉冲（白底加深+描边，不发光）8f；整词呼吸 1.04。
// 适配：字符 "知辨"（2 字），知乎蓝；呼吸提前到 52–76f，使 76f 起至镜头末满 ≥30f 真静止（R1）；
// 副标 blur-slide（与字幕同配方）。
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { FONT, T, clamp } from '../tokens';

const h = (n: number) => {
  const s = Math.sin(n * 127.3) * 43758.5453;
  return s - Math.floor(s);
};
const WORD = '知辨';
const TRAVEL = 45;
const STAG = 3;
const outCubic = Easing.out(Easing.cubic);
const SUB = ['让分歧', '被看见'];

export const BrandScene: React.FC = () => {
  const frame = useCurrentFrame();
  const breath =
    frame < 64
      ? interpolate(frame, [52, 64], [1, 1.04], { ...clamp, easing: Easing.inOut(Easing.cubic) })
      : interpolate(frame, [64, 76], [1.04, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });

  return (
    <AbsoluteFill style={{ background: T.card, backgroundImage: 'radial-gradient(1200px 760px at 50% 46%, rgba(23,114,246,.07), transparent 70%)' }}>
      <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 34, transform: `scale(${breath})` }}>
        <div style={{ display: 'flex' }}>
          {WORD.split('').map((c, i) => {
            const start = i * STAG;
            const lock = start + TRAVEL;
            const p = interpolate(frame, [start, lock], [0, 1], { ...clamp, easing: outCubic });
            const ang = h(i + 1) * Math.PI * 2;
            const mag = 260 + h(i + 101) * 100;
            const pulse = frame <= lock || frame >= lock + 8 ? 0 : frame < lock + 4 ? (frame - lock) / 4 : (lock + 8 - frame) / 4;
            return (
              <span
                key={i}
                style={{
                  fontFamily: FONT, fontWeight: 800, fontSize: 250, letterSpacing: 24, lineHeight: 1,
                  color: pulse > 0 ? T.brandDeep : T.brand, display: 'inline-block',
                  transform: `translate(${Math.cos(ang) * mag * (1 - p)}px, ${Math.sin(ang) * mag * (1 - p)}px)`,
                  opacity: interpolate(p, [0, 1], [0.35, 1]),
                  filter: 8 * (1 - p) > 0.01 ? `blur(${8 * (1 - p)}px)` : undefined,
                  WebkitTextStroke: 3 * pulse > 0.01 ? `${3 * pulse}px ${T.brandDeep}` : undefined,
                }}
              >
                {c}
              </span>
            );
          })}
        </div>
        <div style={{ display: 'flex', fontFamily: FONT, fontSize: 64, fontWeight: 500, color: T.text2, letterSpacing: '0.16em' }}>
          {SUB.map((w, i) => {
            const s = 30 + i * 3.5;
            const p = interpolate(frame, [s, s + 20], [0, 1], { ...clamp, easing: outCubic });
            return (
              <span key={i} style={{ display: 'inline-block', opacity: p, transform: `translateY(${26 * (1 - p)}px)`, filter: `blur(${(1 - p) * 10}px)` }}>
                {w}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
