// S7 提问 → AI 自动编排：type-and-filter（demos/interaction/type-and-filter/TypeAndFilter.tsx）。
// 保留命门：真人速度打字（中文按 5f/字，比 demo 3f/字母更慢，R3）；光标打字中常亮、打完 8f 周期闪烁、点击后消失；
// 打完留呼吸（≥11f）再让页面响应；搜索框用底色补丁盖住纹理 placeholder（保留放大镜）后叠字；
// 双圈强调色 ripple（起点差 3f、各 10f、半径 14→54/78）+ 3px 描边 + 40px 辉光；随后相机 16f 推进 zoom 2.2 交棒 flash-cut。
// 适配：产品的"网格收敛"动作换成搜索结果"错峰汇入"（知辨的搜索结果本来就是从无到有），
// 终点都是真实页面槽位（search-full 纹理原位裁切，Q9）；点击目标 = "自动编排这 35 条"按钮。
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { PageCam, CamKey } from '../lib/PageCam';
import layout from '../layout.json';
import { FONT, T, clamp } from '../tokens';

const PAGE_H = layout.search.pageH;
const QUERY = '要不要考研';
const TYPE_START = 10;
const CHAR_F = 5;
const TYPE_END = TYPE_START + CHAR_F * QUERY.length; // 35
const REVEAL_START = 48;
const CLICK = 108;
const BTN = { x: 970, y: 233, w: 163, h: 34 };
const BTN_C = { x: BTN.x + BTN.w / 2, y: BTN.y + BTN.h / 2 };
const INPUT = { x: 786, y: 13, w: 334, h: 26, textX: 794 };

const CAM_KEYS: CamKey[] = [
  { frame: 0, cx: 964, cy: 300, zoom: 1.8 },
  { frame: 44, cx: 964, cy: 300, zoom: 1.8 },
  { frame: 62, cx: 960, cy: 440, zoom: 1.15 },
  { frame: CLICK + 10, cx: 960, cy: 440, zoom: 1.15 },
  { frame: CLICK + 26, cx: BTN_C.x, cy: BTN_C.y, zoom: 2.2 },
];

// 按阅读序汇入的真实结果块（search-full 原位裁切）
const BLOCKS = [
  { x: 460, y: 62, w: 694, h: 122 }, // 知乎站内搜索 头卡
  { x: 460, y: 194, w: 694, h: 111 }, // 自动编排 CTA
  { x: 460, y: 316, w: 694, h: 102 }, // DeepSeek 筛选摘要
  { x: 460, y: 418, w: 694, h: 184 },
  { x: 460, y: 602, w: 694, h: 185 },
  { x: 460, y: 787, w: 694, h: 184 },
  { x: 460, y: 971, w: 694, h: 211 },
];

export const SearchScene: React.FC<{ dur: number }> = () => {
  const frame = useCurrentFrame();
  const typedCount = frame < TYPE_START ? 0 : Math.min(QUERY.length, Math.floor((frame - TYPE_START) / CHAR_F) + 1);
  const caretOn = frame >= TYPE_START - 2 && frame <= CLICK - 1 && (frame <= TYPE_END || Math.floor((frame - TYPE_END) / 8) % 2 === 0);

  return (
    <AbsoluteFill style={{ backgroundColor: T.bg }}>
      <PageCam src="textures/search-empty.png" pageH={PAGE_H} keys={CAM_KEYS}>
        {BLOCKS.map((b, i) => {
          const cue = REVEAL_START + i * 4;
          const p = interpolate(frame, [cue, cue + 12], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.75, 0.25, 1) });
          if (p <= 0) return null;
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: b.x, top: b.y, width: b.w, height: b.h,
                backgroundImage: `url(${staticFile('textures/search-full.png')})`, backgroundSize: `1920px ${PAGE_H}px`,
                backgroundPosition: `${-b.x}px ${-b.y}px`, backgroundRepeat: 'no-repeat',
                opacity: p, transform: `translateY(${24 * (1 - p)}px)`, filter: p < 0.99 ? `blur(${6 * (1 - p)}px)` : undefined,
              }}
            />
          );
        })}

        {/* 搜索框：底色补丁盖 placeholder，叠打字文本 + 光标 */}
        <div style={{ position: 'absolute', left: INPUT.x, top: INPUT.y, width: INPUT.w, height: INPUT.h, background: '#f6f6f6' }} />
        <div style={{ position: 'absolute', left: INPUT.textX, top: INPUT.y, height: INPUT.h, display: 'flex', alignItems: 'center', fontFamily: FONT, fontSize: 14, color: T.text }}>
          <span>{QUERY.slice(0, typedCount)}</span>
          {caretOn ? <span style={{ display: 'inline-block', width: 1.5, height: 16, marginLeft: 1.5, background: T.brand }} /> : null}
        </div>

        {[0, 1].map((r) => {
          const start = CLICK + r * 3;
          if (frame < start || frame > start + 10) return null;
          const t = interpolate(frame, [start, start + 10], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
          const rad = interpolate(t, [0, 1], [14, r === 0 ? 54 : 78]);
          return (
            <div key={r} style={{ position: 'absolute', left: BTN_C.x - rad, top: BTN_C.y - rad, width: rad * 2, height: rad * 2, borderRadius: '50%', border: `2px solid ${T.brand}`, opacity: 1 - t }} />
          );
        })}
        {frame >= CLICK + 2 ? (
          <div
            style={{
              position: 'absolute', left: BTN.x - 6, top: BTN.y - 6, width: BTN.w + 12, height: BTN.h + 12, borderRadius: T.radius + 4,
              border: `3px solid ${T.brand}`, boxShadow: '0 0 40px rgba(23,114,246,0.5)',
              opacity: interpolate(frame, [CLICK + 2, CLICK + 5], [0.5, 1], clamp),
            }}
          />
        ) : null}
      </PageCam>
    </AbsoluteFill>
  );
};
