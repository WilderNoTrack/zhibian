// S6 呼吸字卡：paper-title-card（demos/typography/paper-title-card/PaperTitleCard.tsx）。
// 保留：逐词压印 delay 4+i·4、9f、bezier(0.2,0.75,0.3,1)，scale 1.28→1 + blur 7→0；
// 恰一个强调词；强调色下划线 16→34f scaleX；尾部 8f 淡出。
// 蒙皮：纸底→知乎白底+品牌蓝微光，衬线→产品无衬线；中文强调词不做斜体（仿斜体损字形），只用品牌蓝。
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { FONT, T, clamp } from '../tokens';

const WORDS: { text: string; accent?: boolean }[] = [{ text: '不补写，' }, { text: '不裁决。', accent: true }];
const SUB = '每条原句都与知乎原文逐字核对';

export const TitleCard: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [dur - 8, dur], [1, 0], clamp);
  const underline = interpolate(frame, [16, 34], [0, 1], { ...clamp, easing: Easing.bezier(0.3, 0, 0.2, 1) });
  const subT = interpolate(frame, [10, 22], [0, 1], clamp);
  return (
    <AbsoluteFill
      style={{
        background: T.card, justifyContent: 'center', alignItems: 'center', opacity: fadeOut,
        backgroundImage: 'radial-gradient(1100px 750px at 50% 42%, rgba(23,114,246,.06), transparent 65%)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: FONT, fontSize: 128, fontWeight: 700, lineHeight: 1.14, color: T.text, display: 'flex', justifyContent: 'center', columnGap: '0.18em', letterSpacing: '0.02em' }}>
          {WORDS.map((w, i) => {
            const delay = 4 + i * 4;
            const t = interpolate(frame, [delay, delay + 9], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 0.75, 0.3, 1) });
            return (
              <span key={i} style={{ opacity: t, transform: `scale(${1.28 - 0.28 * t})`, filter: `blur(${(1 - t) * 7}px)`, display: 'inline-block', color: w.accent ? T.brand : undefined }}>
                {w.text}
              </span>
            );
          })}
        </div>
        <div style={{ height: 6, width: 220, margin: '40px auto 0', borderRadius: 3, background: T.brand, transform: `scaleX(${underline})` }} />
        <div style={{ fontFamily: FONT, fontSize: 40, letterSpacing: '0.12em', color: T.text3, marginTop: 34, opacity: subT }}>{SUB}</div>
      </div>
    </AbsoluteFill>
  );
};
