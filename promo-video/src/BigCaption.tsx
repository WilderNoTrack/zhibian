// 叙事字幕：blur-slide 配方（y 40→0 + blur 10→0 + opacity 同一 outCubic 进度，词间 3.5f、单词窗 20f）。
// 中文按语义手动切块（卡片已知坑：split(' ') 对中文无效）。字号 58px ≥ Q11 字幕线 56px。
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { FONT, T, clamp } from './tokens';

const outCubic = Easing.out(Easing.cubic);

export const BigCaption: React.FC<{ words: string[]; duration: number; bottom?: number }> = ({
  words,
  duration,
  bottom = 70,
}) => {
  const frame = useCurrentFrame();
  const boxIn = interpolate(frame, [0, 10], [0, 1], { ...clamp, easing: outCubic });
  const out = interpolate(frame, [duration - 8, duration], [1, 0], clamp);
  return (
    <div
      style={{
        position: 'absolute', left: 0, right: 0, bottom,
        display: 'flex', justifyContent: 'center', pointerEvents: 'none', opacity: out,
      }}
    >
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 22,
          background: `rgba(255,255,255,${0.95 * boxIn})`,
          boxShadow: `0 10px 34px rgba(18,18,18,${0.14 * boxIn})`,
          borderRadius: 8, padding: '18px 44px 18px 30px',
        }}
      >
        <div style={{ width: 6, height: 58, borderRadius: 3, background: T.brand, transform: `scaleY(${boxIn})` }} />
        <div style={{ display: 'flex', fontFamily: FONT, fontSize: 58, fontWeight: 600, color: T.text, letterSpacing: '0.02em' }}>
          {words.map((w, i) => {
            const s = 4 + i * 3.5;
            const p = interpolate(frame, [s, s + 20], [0, 1], { ...clamp, easing: outCubic });
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block', whiteSpace: 'pre', opacity: p,
                  transform: `translateY(${40 * (1 - p)}px)`, filter: `blur(${(1 - p) * 10}px)`,
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
