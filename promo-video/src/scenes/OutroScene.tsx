// S10 收场：outro-group-photo-launch（demos/outro/outro-group-photo-launch/OutroGroupPhotoLaunch.tsx）。
// 保留命门：元素 cue 从 4 起每 3f、飞 12f、FLY_EASE bezier(0.34,1.4,0.44,1)（y1>1 真过冲）；
// 飞行 rot×2→settled、scale×1.12→1、ghost 残影 8% blur 8px、落地强调色 glow 6f；
// 字标 delay=42+i·1.8、8f 登场，42–50f 全员退后排（opacity −12% / saturate −8%）；
// crane rotateX 4°→0 + scale 1.06→1（40f）后缓推 +0.035；光带 2–14f、舞台光 42→50→58f、20 颗确定性尘点；
// 背景页 24f blur 0→14；rule 58→70f + 190px 延长线；落定后 hold。
// 适配：9→8 个代表元素，全部来自本片已展示页面的真实纹理裁切（热辩卡/左右原句/AI 摘要/质询回应/搜索编排/辩题库/顶栏）；
// 琥珀→知乎蓝、暖白→冷白、金尘→蓝色尘点；字标"知辨"；下方文案不重复"让分歧被看见"（P4 去重）。
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, Easing } from 'remotion';
import { PageCam } from '../lib/PageCam';
import layout from '../layout.json';
import { FONT, T, clamp } from '../tokens';

const FLY_EASE = Easing.bezier(0.34, 1.4, 0.44, 1);
const CRANE_EASE = Easing.bezier(0.3, 0, 0.2, 1);
const LETTERS = '知辨'.split('');

type Crop = { tex: string; pageH: number; x: number; y: number; w: number; h: number };
type FlyEl = { key: string; crop?: Crop; img?: string; w: number; h: number; cx: number; cy: number; scale: number; rot: number; dx: number; dy: number; radius: number; cue: number };

const TX = (name: string) => `textures/${name}`;
const DB = layout.debate.pageH, SR = layout.search.pageH, LB = layout.library.pageH, TP = layout.topics.pageH;
const els: FlyEl[] = [
  { key: 'nav', crop: { tex: 'topics-full.png', pageH: TP, x: 444, y: 0, w: 1032, h: 52 }, w: 1032, h: 52, cx: 960, cy: 78, scale: 0.9, rot: 0, dx: 0, dy: -140, radius: 6, cue: 4 },
  { key: 'critic', crop: { tex: 'critic-result.png', pageH: 1080, x: 639, y: 630, w: 642, h: 252 }, w: 642, h: 252, cx: 360, cy: 240, scale: 0.72, rot: -3, dx: -480, dy: -120, radius: 4, cue: 7 },
  { key: 'hot', img: 'hot-card-4x.png', w: 694, h: 313, cx: 1540, cy: 300, scale: 0.72, rot: 4, dx: 500, dy: 0, radius: 4, cue: 10 },
  { key: 'leftQuote', crop: { tex: 'debate-full.png', pageH: DB, x: 470, y: 420, w: 458, h: 245 }, w: 458, h: 245, cx: 330, cy: 610, scale: 0.85, rot: -4, dx: -460, dy: 60, radius: 4, cue: 13 },
  { key: 'rightQuote', crop: { tex: 'debate-full.png', pageH: DB, x: 992, y: 420, w: 458, h: 420 }, w: 458, h: 420, cx: 1580, cy: 690, scale: 0.62, rot: 3, dx: 460, dy: 160, radius: 4, cue: 16 },
  { key: 'summary', crop: { tex: 'debate-full.png', pageH: DB, x: 480, y: 669, w: 438, h: 193 }, w: 438, h: 193, cx: 430, cy: 900, scale: 0.82, rot: 2, dx: -300, dy: 300, radius: 4, cue: 19 },
  { key: 'arrange', crop: { tex: 'search-full.png', pageH: SR, x: 460, y: 194, w: 694, h: 111 }, w: 694, h: 111, cx: 960, cy: 980, scale: 0.8, rot: -1.5, dx: 0, dy: 300, radius: 4, cue: 22 },
  { key: 'library', crop: { tex: 'library-full.png', pageH: LB, x: 460, y: 1178, w: 694, h: 194 }, w: 694, h: 194, cx: 1500, cy: 930, scale: 0.66, rot: -2, dx: 380, dy: 200, radius: 4, cue: 25 },
];

const DUST = Array.from({ length: 20 }, (_, i) => ({
  x: (i * 439 + 137) % 1920,
  y0: (i * 613 + 271) % 1080,
  rise: 0.3 + (i % 5) * 0.11,
  swayAmp: 9 + (i % 4) * 5,
  swayFreq: 0.022 + (i % 3) * 0.008,
  phase: (i * 0.83) % (Math.PI * 2),
  size: 2 + (i % 3) * 0.5,
  opacity: 0.15 + ((i * 7) % 5) * 0.05,
}));

const Face: React.FC<{ el: FlyEl }> = ({ el }) =>
  el.crop ? (
    <div
      style={{
        position: 'absolute', inset: 0, background: '#fff',
        backgroundImage: `url(${staticFile(TX(el.crop.tex))})`,
        backgroundSize: `1920px ${el.crop.pageH}px`, backgroundPosition: `${-el.crop.x}px ${-el.crop.y}px`, backgroundRepeat: 'no-repeat',
      }}
    />
  ) : (
    <Img src={staticFile(TX(el.img!))} style={{ position: 'absolute', inset: 0, width: el.w, height: el.h, display: 'block' }} />
  );

export const OutroScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const blur = interpolate(frame, [0, 24], [0, 14], { ...clamp, easing: Easing.bezier(0.4, 0, 0.4, 1) });
  const rule = interpolate(frame, [58, 70], [0, 1], { ...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const tag = interpolate(frame, [68, 80], [0, 1], clamp);
  const fadeOut = interpolate(frame, [dur - 12, dur], [1, 0], clamp);
  const recede = interpolate(frame, [42, 50], [0, 1], clamp);
  const craneT = interpolate(frame, [0, 40], [0, 1], { ...clamp, easing: CRANE_EASE });
  const pushT = interpolate(frame, [40, dur], [0, 1], clamp);
  const camScale = 1.06 - 0.06 * craneT + 0.035 * pushT;
  const camTilt = 4 * (1 - craneT);
  const sweepX = interpolate(frame, [2, 14], [-700, 2020], { ...clamp, easing: Easing.bezier(0.4, 0, 0.6, 1) });
  const sweepOpacity = interpolate(frame, [2, 5, 11, 14], [0, 0.12, 0.12, 0], clamp);
  const stageLight = interpolate(frame, [42, 50, 58], [0, 0.5, 0.25], clamp);
  const vignette = interpolate(frame, [42, 54], [0, 0.1], clamp);
  const ruleExt = interpolate(frame, [58, 66], [0, 1], { ...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const ruleExtFade = interpolate(frame, [66, 72], [1, 0], clamp);
  const wordSpacing = interpolate(frame, [62, 66], [0.04, 0.06], { ...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1) });

  return (
    <AbsoluteFill style={{ opacity: fadeOut, background: '#fff' }}>
      <AbsoluteFill style={{ transform: `perspective(1400px) rotateX(${camTilt}deg) scale(${camScale})`, transformOrigin: '50% 45%' }}>
        <PageCam src="textures/topics-full.png" pageH={layout.topics.pageH} keys={[{ frame: 0, cx: 960, cy: 700, zoom: 0.75 }]} blur={blur} />
        <AbsoluteFill style={{ background: 'radial-gradient(1200px 800px at 50% 48%, rgba(248,250,253,0.84), rgba(246,246,246,0.58) 60%, rgba(246,246,246,0.38))' }} />

        <AbsoluteFill>
          {els.map((el) => {
            if (frame < el.cue) return null;
            const t = interpolate(frame, [el.cue, el.cue + 12], [0, 1], { ...clamp, easing: FLY_EASE });
            const opacity = interpolate(frame, [el.cue, el.cue + 3], [0, 1], clamp);
            const x = el.dx * (1 - t);
            const y = el.dy * (1 - t);
            const rot = el.rot * (2 - t);
            const scale = el.scale * (1.12 - 0.12 * t);
            const air = Math.max(0, 1 - t);
            const shadow = air > 0.01
              ? `0 ${10 + 26 * air}px ${24 + 46 * air}px rgba(18,24,40,${0.16 + 0.1 * air}), 0 2px 6px rgba(18,24,40,.08)`
              : '0 10px 24px rgba(18,24,40,.16), 0 2px 6px rgba(18,24,40,.08)';
            const linT = interpolate(frame, [el.cue, el.cue + 12], [0, 1], clamp);
            const showGhost = linT > 0.05 && linT < 0.95;
            const glow = interpolate(frame, [el.cue + 12, el.cue + 18], [0.35, 0], clamp);
            const showGlow = frame >= el.cue + 12 && frame < el.cue + 18;
            const glowR = el.w * el.scale * 0.5;
            const box: React.CSSProperties = {
              position: 'absolute', left: el.cx - el.w / 2, top: el.cy - el.h / 2, width: el.w, height: el.h,
              transformOrigin: 'center center', borderRadius: el.radius, overflow: 'hidden',
            };
            return (
              <div key={el.key}>
                {showGhost ? (
                  <div style={{ ...box, transform: `translate(${x + el.dx * 0.08}px, ${y + el.dy * 0.08}px) rotate(${rot}deg) scale(${scale})`, opacity: 0.2 * Math.max(0, 1 - linT), filter: 'blur(8px)' }}>
                    <Face el={el} />
                  </div>
                ) : null}
                <div
                  style={{
                    ...box, transform: `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`, boxShadow: shadow,
                    opacity: opacity * (1 - 0.12 * recede), filter: `saturate(${1 - 0.08 * recede})`, border: `1px solid ${T.line}`,
                  }}
                >
                  <Face el={el} />
                </div>
                {showGlow ? (
                  <div
                    style={{
                      position: 'absolute', left: el.cx - glowR, top: el.cy - glowR, width: glowR * 2, height: glowR * 2, borderRadius: '50%',
                      background: 'radial-gradient(circle, rgba(23,114,246,0.55), rgba(23,114,246,0) 70%)', opacity: glow, mixBlendMode: 'multiply',
                    }}
                  />
                ) : null}
              </div>
            );
          })}
        </AbsoluteFill>
      </AbsoluteFill>

      <AbsoluteFill>
        {DUST.map((d, i) => {
          const y = (((d.y0 - frame * d.rise) % 1080) + 1080) % 1080;
          const x = d.x + Math.sin(frame * d.swayFreq + d.phase) * d.swayAmp;
          return <div key={i} style={{ position: 'absolute', left: x, top: y, width: d.size, height: d.size, borderRadius: '50%', background: T.brand, opacity: d.opacity }} />;
        })}
      </AbsoluteFill>

      {sweepOpacity > 0 ? (
        <AbsoluteFill style={{ mixBlendMode: 'overlay' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: sweepX - 300, width: 600, background: 'linear-gradient(90deg, rgba(235,244,255,0), rgba(235,244,255,1) 50%, rgba(235,244,255,0))', opacity: sweepOpacity }} />
        </AbsoluteFill>
      ) : null}
      {stageLight > 0 ? (
        <AbsoluteFill style={{ background: 'radial-gradient(760px 380px at 960px 500px, rgba(250,252,255,0.97), rgba(240,246,255,0.4) 55%, rgba(240,246,255,0) 75%)', opacity: stageLight }} />
      ) : null}
      {vignette > 0 ? (
        <AbsoluteFill style={{ background: 'radial-gradient(1400px 900px at 50% 50%, rgba(18,30,60,0) 55%, rgba(18,30,60,0.7) 100%)', opacity: vignette }} />
      ) : null}

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ textAlign: 'center', marginTop: -40 }}>
          <div style={{ fontFamily: FONT, fontSize: 200, fontWeight: 800, color: T.brand, letterSpacing: `${wordSpacing}em`, display: 'flex', justifyContent: 'center', lineHeight: 1.1 }}>
            {LETTERS.map((ch, i) => {
              const delay = Math.round(42 + i * 1.8);
              const t = interpolate(frame, [delay, delay + 8], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.75, 0.3, 1) });
              return (
                <span key={i} style={{ opacity: t, transform: `translateY(${(1 - t) * 28}px) scale(${1.35 - 0.35 * t})`, filter: `blur(${(1 - t) * 8}px)`, display: 'inline-block' }}>
                  {ch}
                </span>
              );
            })}
          </div>
          <div style={{ position: 'relative', height: 6, width: 260, margin: '30px auto 0' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 3, background: T.brand, transform: `scaleX(${rule})` }} />
            {ruleExt > 0 && ruleExtFade > 0 ? (
              <>
                <div style={{ position: 'absolute', top: 2.5, height: 1, right: '100%', width: 190 * ruleExt, background: T.brand, opacity: ruleExtFade }} />
                <div style={{ position: 'absolute', top: 2.5, height: 1, left: '100%', width: 190 * ruleExt, background: T.brand, opacity: ruleExtFade }} />
              </>
            ) : null}
          </div>
          <div style={{ fontFamily: FONT, fontSize: 44, fontWeight: 500, letterSpacing: '0.14em', color: T.text2, marginTop: 30, opacity: tag }}>
            知乎黑客松 2026 · 知识炼金场
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
