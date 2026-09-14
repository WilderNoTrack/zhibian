// S5 辩论现场 · 原句核对：scanline-annotate-focus（demos/effects/scanline-annotate-focus/ScanlineAnnotateFocus.tsx）。
// 保留命门：扫描线 t 0.06→0.66 零缓动、0.04→0.09 淡入 / 0.66→0.71 淡出；触发时刻由目标 bbox 下缘反算
// ft = 0.06 + ((bottom+30u)/330u)·0.60 并按序钳制最小间隔 0.05；取景框 outBack scale 1.75→1（0.13）、
// opacity min(1,a·1.6)；对焦闪峰值 0.07；标注 ft+0.05 起 0.11 outCubic + translateY 4u→0；状态行实时数 fired。
// 适配：设计坐标 480×270 → 1920×1080（u = 4）；背景从占位暗页换成真实辩论页纹理（PageCam 静止正视，Q6 信息密集镜头正视）；
// 深色主题反转为亮底：角标/扫描线/标注用知乎蓝，标注加白底胶囊保证可读（≥32px，Q11）；目标 5 个。
import React from 'react';
import { AbsoluteFill, Easing, useCurrentFrame } from 'remotion';
import { PageCam } from '../lib/PageCam';
import layout from '../layout.json';
import { FONT, T } from '../tokens';

const U = 4;
const DUR_T = 138; // demo 归一化时长（4600ms@30fps）
const CAM = { cx: 960, cy: 470, zoom: 1.2 };
const sx = (x: number) => 960 + (x - CAM.cx) * CAM.zoom;
const sy = (y: number) => 540 + (y - CAM.cy) * CAM.zoom;

const seg = (t: number, a: number, b: number, ease?: (x: number) => number) => {
  const v = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return ease ? ease(v) : v;
};
const outCubic = Easing.out(Easing.cubic);
const outBack = Easing.out(Easing.back(1.70158));
const lerp = (p: number, a: number, b: number) => a + (b - a) * p;

type Target = { x: number; y: number; w: number; h: number; label: string; anchor: 'left' | 'right'; lx: number; ly: number; ft: number };
// 页面坐标（CSS px，来自 layout.json 实测 bbox，手动留边）
const RAW: Omit<Target, 'ft'>[] = [
  { x: 1296, y: 70, w: 171, h: 65, label: '3 回合 · 6 条真实观点', anchor: 'right', lx: 1284, ly: 88 },
  { x: 454, y: 233, w: 490, h: 117, label: '左方 · 3 位知乎答主', anchor: 'left', lx: 460, ly: 200 },
  { x: 976, y: 233, w: 490, h: 117, label: '右方 · 3 位知乎答主', anchor: 'left', lx: 982, ly: 200 },
  { x: 472, y: 531, w: 454, h: 130, label: '✓ 原句逐字核对', anchor: 'right', lx: 462, ly: 575 },
  { x: 994, y: 531, w: 454, h: 300, label: '✓ 原句逐字核对', anchor: 'left', lx: 1462, ly: 660 },
];
const TARGETS: Target[] = (() => {
  const ts = RAW.map((r) => ({ ...r, ft: 0 }));
  const bottom = (tg: Target) => sy(tg.y + tg.h); // 屏幕坐标下缘
  const rawT = (tg: Target) => 0.06 + ((bottom(tg) + 30 * U) / (330 * U)) * 0.6;
  let prev = -1;
  for (const tg of [...ts].sort((a, b) => bottom(a) - bottom(b))) {
    tg.ft = Math.max(rawT(tg), prev + 0.05);
    prev = tg.ft;
  }
  return ts;
})();

export const ScanScene: React.FC<{ dur: number }> = () => {
  const frame = useCurrentFrame();
  const t = frame / DUR_T;
  const ly = lerp(seg(t, 0.06, 0.66), -30 * U, 300 * U);
  const lineOpacity = seg(t, 0.04, 0.09) * (1 - seg(t, 0.66, 0.71));
  const fired = TARGETS.reduce((acc, tg) => acc + (seg(t, tg.ft, tg.ft + 0.11, outCubic) > 0 ? 1 : 0), 0);
  const done = seg(t, 0.74, 0.8);

  return (
    <AbsoluteFill style={{ background: T.bg }}>
      <PageCam src="textures/debate-full.png" pageH={layout.debate.pageH} keys={[{ frame: 0, ...CAM }]} />

      {TARGETS.map((tg, i) => {
        const a = seg(t, tg.ft, tg.ft + 0.11, outCubic);
        const s = lerp(outBack(seg(t, tg.ft, tg.ft + 0.13)), 1.75, 1);
        const fillO = 0.07 * seg(t, tg.ft + 0.04, tg.ft + 0.09) * (1 - seg(t, tg.ft + 0.09, tg.ft + 0.22));
        const la = seg(t, tg.ft + 0.05, tg.ft + 0.16, outCubic);
        const X = sx(tg.x), Y = sy(tg.y), W = tg.w * CAM.zoom, H = tg.h * CAM.zoom;
        const arm = Math.min(9 * U, Math.min(W, H) / 3);
        const bd = `5px solid ${T.brand}`;
        const corners: React.CSSProperties[] = [
          { left: 0, top: 0, borderTop: bd, borderLeft: bd },
          { right: 0, top: 0, borderTop: bd, borderRight: bd },
          { left: 0, bottom: 0, borderBottom: bd, borderLeft: bd },
          { right: 0, bottom: 0, borderBottom: bd, borderRight: bd },
        ];
        const LX = sx(tg.lx), LY = sy(tg.ly);
        return (
          <React.Fragment key={i}>
            <div style={{ position: 'absolute', left: X, top: Y, width: W, height: H, opacity: Math.min(1, a * 1.6), transform: `scale(${a > 0 ? s : 1.75})` }}>
              {corners.map((c, k) => (
                <div key={k} style={{ position: 'absolute', width: arm, height: arm, ...c }} />
              ))}
              <div style={{ position: 'absolute', inset: 2, background: T.brand, opacity: fillO }} />
            </div>
            <div
              style={{
                position: 'absolute', top: LY, ...(tg.anchor === 'left' ? { left: LX } : { right: 1920 - LX }),
                transform: `translateY(calc(-50% + ${lerp(la, 4 * U, 0)}px))`, opacity: la, whiteSpace: 'nowrap',
                fontFamily: FONT, fontSize: 34, fontWeight: 600, letterSpacing: 1.5, color: T.brand,
                background: '#fff', border: `1.5px solid ${T.brandSoft2}`, borderRadius: T.radius, padding: '4px 14px',
                boxShadow: '0 6px 18px rgba(18,18,18,.10)',
              }}
            >
              {tg.label}
            </div>
          </React.Fragment>
        );
      })}

      {/* 扫描线：渐变拖尾 + 亮芯 */}
      <div
        style={{
          position: 'absolute', left: 0, top: 0, width: '100%', height: 40 * U,
          background: 'linear-gradient(180deg,transparent,rgba(23,114,246,.08) 55%,rgba(23,114,246,.02) 96%,transparent)',
          transform: `translateY(${ly - 40 * U}px)`, opacity: lineOpacity,
        }}
      >
        <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', height: 5, background: 'rgba(23,114,246,.95)', boxShadow: '0 0 20px rgba(23,114,246,.8), 0 0 60px rgba(23,114,246,.35)' }} />
      </div>

      {/* 状态行：核对计数 → 核对完成 */}
      <div
        style={{
          position: 'absolute', right: 60, top: 34, opacity: seg(t, 0.03, 0.08),
          fontFamily: FONT, fontSize: 32, fontWeight: 700, letterSpacing: 2,
          color: done >= 1 ? '#fff' : T.brand, background: done >= 1 ? T.ok : '#fff',
          border: `1.5px solid ${done >= 1 ? T.ok : T.brandSoft2}`, borderRadius: T.radius, padding: '6px 18px',
          boxShadow: '0 6px 18px rgba(18,18,18,.10)', fontVariantNumeric: 'tabular-nums',
        }}
      >
        {done >= 1 ? '逐字核对 · 完成' : `核对中 · 0${fired}/0${TARGETS.length}`}
      </div>
    </AbsoluteFill>
  );
};
