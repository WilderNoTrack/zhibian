// S8 AI 质询：ai-stream-response（demos/interaction/ai-stream-response/StreamResponse.tsx）。
// 保留命门：真实响应面板截图做 backplate，动态区先用面板底色盖掉，再按原坐标把内容逐块叠回真实槽位（Q1/Q9）；
// 摘要 cue 18、12f reveal（wipe + y10），落定后 ≥12f 才起首行；行节拍 cue = 42+[0,11,21,30,38]，每行 12f，
// y 18→0 + blur 6→0 + opacity，bezier(0.2,0.75,0.25,1)；末行后面板级一次完成脉冲（0.25→0.55→0.25 / 10f），随后 ≥15f 真静止；
// 相机正视 zoom 微退（1.66→1.60，比例同 demo 1.04→1.0）。
// 适配：真实 DeepSeek 回应是一段 6 行正文——"摘要"= 标签 + 首行，"证据行"= 后续 5 行（按语义块而非逐字符，卡片已知坑）；
// 产品界面没有逐行状态图标，不虚构 UI（Q1），完成态改用产品自带的"基于…知乎回答全文"出处行。
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { PageCam } from '../lib/PageCam';
import { T, clamp } from '../tokens';

const ease = Easing.bezier(0.2, 0.75, 0.25, 1);
const TEX = 'textures/critic-result.png';
const RESULT = { x: 639, y: 630, w: 642, h: 252 };
const BG = '#f8f9fb';
const LINE_H = 27;
const PARA_Y = 673;
const ROW_CUES = [42, 53, 63, 72, 80];
const REF = { x: 653, y: 845, w: 614, h: 20 };
const DONE = 96;

const Crop: React.FC<{ x: number; y: number; w: number; h: number; style?: React.CSSProperties }> = ({ x, y, w, h, style }) => (
  <div
    style={{
      position: 'absolute', left: x, top: y, width: w, height: h,
      backgroundImage: `url(${staticFile(TEX)})`, backgroundSize: '1920px 1080px', backgroundPosition: `${-x}px ${-y}px`, backgroundRepeat: 'no-repeat',
      ...style,
    }}
  />
);

export const CriticScene: React.FC<{ dur: number }> = () => {
  const frame = useCurrentFrame();
  const summary = interpolate(frame, [18, 30], [0, 1], { ...clamp, easing: ease });
  const done = interpolate(frame, [DONE, DONE + 10], [0, 1], { ...clamp, easing: ease });
  const pulse = interpolate(frame, [DONE + 6, DONE + 11, DONE + 16], [0, 0.55, 0.25], clamp);

  return (
    <AbsoluteFill style={{ background: T.bg }}>
      <PageCam src={TEX} pageH={1080} keys={[{ frame: 0, cx: 960, cy: 660, zoom: 1.66 }, { frame: 100, cx: 960, cy: 660, zoom: 1.6 }]} ease={ease}>
        <div style={{ position: 'absolute', left: RESULT.x + 1, top: RESULT.y + 1, width: RESULT.w - 2, height: RESULT.h - 2, background: BG }} />

        {/* 摘要：DeepSeek 质询 标签 + 首行 */}
        <Crop
          x={650} y={640} w={620} h={PARA_Y - 640 + LINE_H}
          style={{ opacity: summary, transform: `translateY(${10 * (1 - summary)}px)`, clipPath: `inset(0 ${100 * (1 - summary)}% 0 0)` }}
        />

        {ROW_CUES.map((cue, i) => {
          const p = interpolate(frame, [cue, cue + 12], [0, 1], { ...clamp, easing: ease });
          if (p <= 0) return null;
          return (
            <Crop
              key={i} x={650} y={PARA_Y + LINE_H * (i + 1)} w={620} h={LINE_H}
              style={{ opacity: p, transform: `translateY(${18 * (1 - p)}px)`, filter: p < 0.99 ? `blur(${6 * (1 - p)}px)` : undefined }}
            />
          );
        })}

        <Crop x={REF.x - 3} y={REF.y} w={REF.w} h={REF.h} style={{ opacity: done, transform: `translateY(${5 * (1 - done)}px)` }} />

        <div style={{ position: 'absolute', left: RESULT.x - 1, top: RESULT.y - 1, width: RESULT.w + 2, height: RESULT.h + 2, borderRadius: T.radius, border: `2px solid rgba(23,114,246,${pulse})` }} />
      </PageCam>
    </AbsoluteFill>
  );
};
