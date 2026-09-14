// S4 今日热辩主角卡：spotlight-hero-card（demos/opening/spotlight-hero-card/SpotlightHeroCard.tsx）。
// 保留命门：聚光灯 4 中间站后锁定（光池收拢 + 锁定 +6% 脉冲，vignette 0.16→0.42）；
// 32→48f 推进到左侧机位 rotY 34° + rotX 8°、persp 1200、焦点左移；rise 10f bezier(0.2,1.25,0.3,1) 过冲 →
// 悬停 54f sin bob（4px/40f，z 110）→ reseat 18f 落地 press 0.997；轮廓光束两圈（lap1 快亮 5+2.5 / lap2 慢弱 3.5+1.75、0.62）；
// 双层影随高度生长；4x 高清切图 32→38f 交叉淡入（Q2）；reseat 后相机锁死 ≥15f。
// 适配：主角卡 = 首页「今日热辩」轮播卡（694×313，比 demo 卡宽），推进 zoom 按屏上卡宽≈930px 反算（2.6→1.34），
// 焦点偏移按屏幕等效换算；琥珀→知乎蓝，暖光→冷白光；可选 3D 注记不用（与字幕信息重复，P4）。
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, Easing } from 'remotion';
import { PageCam, CamKey } from '../lib/PageCam';
import layout from '../layout.json';
import { T, clamp } from '../tokens';

const PAGE_H = layout.topics.pageH;
const CARD = layout.cuts['hot-card'];
const MCX = CARD.x + CARD.w / 2;
const MCY = CARD.y + CARD.h / 2;
const RADIUS = 4;
const Z = 930 / CARD.w;
const FOCAL_DX = 78 / Z; // demo: 30 CSS px @ zoom 2.6 ≈ 78 屏幕 px

const Z0 = 0.9, CX0 = 960, CY0 = 600;
const CAM_KEYS: CamKey[] = [
  { frame: 0, cx: CX0, cy: CY0, zoom: Z0, rotX: 0, rotY: 0, rotZ: 0, persp: 1200 },
  { frame: 32, cx: CX0, cy: CY0, zoom: Z0, rotX: 0, rotY: 0, rotZ: 0, persp: 1200 },
  { frame: 48, cx: MCX - FOCAL_DX, cy: MCY, zoom: Z, rotX: 8, rotY: 34, rotZ: 2, persp: 1200 },
  { frame: 148, cx: MCX - FOCAL_DX, cy: MCY, zoom: Z, rotX: 8, rotY: 34, rotZ: 2, persp: 1200 },
];
const PUSH_EASE = Easing.bezier(0.35, 0, 0.2, 1);
const POP_EASE = Easing.bezier(0.2, 1.25, 0.3, 1);
const RESEAT_EASE = Easing.bezier(0.4, 0, 0.3, 1.05);

// 正视全页下卡心屏幕百分比（聚光锁定点），推进后卡心屏幕位置
const LOCK_X = ((960 + (MCX - CX0) * Z0) / 1920) * 100;
const LOCK_Y = ((540 + (MCY - CY0) * Z0) / 1080) * 100;
const PUSHED_X = ((960 + FOCAL_DX * Z) / 1920) * 100;

const BRAND_RGB = '23,114,246';

export const HeroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const macroIn = interpolate(frame, [0, 8], [0, 1], { ...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1) });

  const spotEase = Easing.bezier(0.4, 0, 0.3, 1);
  const spotX = interpolate(frame, [4, 8, 16, 22, 28, 48], [22, 22, 70, 36, LOCK_X, PUSHED_X], { ...clamp, easing: spotEase });
  const spotY = interpolate(frame, [4, 8, 16, 22, 28, 48], [62, 62, 44, 34, LOCK_Y, 50], { ...clamp, easing: spotEase });
  const spotOn = interpolate(frame, [2, 10], [0, 1], clamp);
  const poolBase = interpolate(frame, [22, 32, 48], [760, 560, 540], { ...clamp, easing: Easing.bezier(0.4, 0, 0.3, 1) });
  const poolPulse = interpolate(frame, [32, 36, 41], [0, 0.06, 0], clamp);
  const poolRx = poolBase * (1 + poolPulse);
  const poolRy = poolBase * 0.8 * (1 + poolPulse);
  const vignette = interpolate(frame, [22, 32, 48], [0.16, 0.34, 0.42], clamp);

  const rise = interpolate(frame, [48, 58], [0, 1], { ...clamp, easing: POP_EASE });
  const reseat = interpolate(frame, [112, 130], [0, 1], { ...clamp, easing: RESEAT_EASE });
  const lift = rise * (1 - reseat);
  const bob = Math.sin(((frame - 58) / 40) * Math.PI * 2) * 4 * lift;
  const z = 110 * lift + bob;
  const landed = frame >= 130;
  const press = interpolate(frame, [126, 129, 130], [1, 0.997, 1], clamp);
  const shadow = `0 ${8 * lift}px ${10 + 12 * lift}px rgba(18,24,40,${0.18 * lift}), 0 ${46 * lift}px ${90 * lift}px rgba(18,24,40,${0.22 * lift})`;

  const slotVis = Math.min(1, rise * 2) * (1 - reseat);
  const landPulse = interpolate(frame, [126, 130, 134], [0, 1, 0], clamp);
  const slotEdge = Math.min(1, 0.4 * (1 - reseat)) + landPulse * 0.6;

  const beam1Prog = interpolate(frame, [60, 74], [0, 1], { ...clamp, easing: Easing.linear });
  const beam1On = frame >= 59 && frame <= 75;
  const beam2Prog = interpolate(frame, [80, 100], [0, 1], { ...clamp, easing: Easing.bezier(0.4, 0, 0.4, 1) });
  const beam2On = frame >= 79 && frame <= 101;
  const beamTrail = interpolate(frame, [100, 112], [0.35, 0], clamp);
  const bw = CARD.w + 6;
  const bh = CARD.h + 6;
  const hiresIn = interpolate(frame, [32, 38], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ backgroundColor: T.bg }}>
      <AbsoluteFill style={{ opacity: macroIn }}>
        <PageCam src="textures/topics-full.png" pageH={PAGE_H} keys={CAM_KEYS} ease={PUSH_EASE}>
          <div style={{ transformStyle: 'preserve-3d' }}>
            {slotVis > 0.02 ? (
              <div
                style={{
                  position: 'absolute', left: CARD.x - 2, top: CARD.y - 2, width: CARD.w + 4, height: CARD.h + 4,
                  background: T.card, borderRadius: RADIUS, boxShadow: `inset 0 0 26px rgba(${BRAND_RGB},${0.12 * slotEdge})`, opacity: slotVis,
                }}
              >
                <div style={{ position: 'absolute', inset: 0, borderRadius: RADIUS, border: `1.5px solid ${T.brand}`, opacity: slotEdge }} />
              </div>
            ) : null}

            <div
              style={{
                position: 'absolute', left: CARD.x, top: CARD.y, width: CARD.w, height: CARD.h,
                transform: `translateZ(${z}px) scale(${press})`, transformOrigin: 'center center', transformStyle: 'preserve-3d',
              }}
            >
              <div style={{ position: 'absolute', inset: 0, borderRadius: RADIUS, overflow: 'hidden', boxShadow: landed ? 'none' : shadow, background: T.card }}>
                <Img src={staticFile('textures/hot-card.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
                <Img src={staticFile('textures/hot-card-4x.png')} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', opacity: hiresIn }} />
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, rgba(255,255,255,0.45), transparent 40%)', opacity: lift }} />
              </div>
              <div style={{ position: 'absolute', inset: 0, borderRadius: RADIUS, boxShadow: `inset 0 0 0 1px rgba(255,255,255,${0.7 * lift})` }} />

              {(beam1On || beam2On) && lift > 0.4 ? (
                <svg
                  width={bw} height={bh} viewBox={`0 0 ${bw} ${bh}`}
                  style={{
                    position: 'absolute', left: -3, top: -3, overflow: 'visible', opacity: beam1On ? 1 : 0.62,
                    filter: `drop-shadow(0 0 6px ${T.brand}) drop-shadow(0 0 18px rgba(200,222,255,0.6))`,
                  }}
                >
                  <rect x={2} y={2} width={bw - 4} height={bh - 4} rx={RADIUS} fill="none" stroke={T.brand} strokeWidth={beam1On ? 5 : 3.5}
                    strokeLinecap="round" pathLength={1} strokeDasharray="0.14 1" strokeDashoffset={-(beam1On ? beam1Prog : beam2Prog)} />
                  <rect x={2} y={2} width={bw - 4} height={bh - 4} rx={RADIUS} fill="none" stroke="rgba(245,250,255,0.98)" strokeWidth={beam1On ? 2.5 : 1.75}
                    strokeLinecap="round" pathLength={1} strokeDasharray="0.14 1" strokeDashoffset={-(beam1On ? beam1Prog : beam2Prog)} />
                </svg>
              ) : null}
              {beamTrail > 0.01 ? (
                <div style={{ position: 'absolute', inset: -3, borderRadius: RADIUS + 3, border: `1.5px solid ${T.brand}`, opacity: beamTrail }} />
              ) : null}
            </div>
          </div>
        </PageCam>

        <AbsoluteFill
          style={{
            background: `radial-gradient(${poolRx}px ${poolRy}px at ${spotX}% ${spotY}%, rgba(246,250,255,0.40), rgba(246,250,255,0.10) 45%, rgba(18,30,60,${vignette * spotOn}) 100%)`,
            opacity: spotOn,
          }}
        />
        <AbsoluteFill
          style={{ background: `radial-gradient(360px 260px at ${spotX - 6}% ${spotY + 10}%, rgba(250,252,255,0.18), transparent 70%)`, opacity: spotOn * 0.7 }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
