// 全片时间线：镜头 Sequence + 叙事字幕 + 转场 + BGM（bgm inputProp 开关）+ SFX 钉帧表。
// SFX 一律写相对表达式（SHOTS.x.from + offset / beatF(n)），不写裸帧号（sound-design §4.5）。
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { SHOTS, TOTAL, MUSIC_TRIM_F, HANDOFF, beatF } from './timeline';
import { clamp } from './tokens';
import { BigCaption } from './BigCaption';
import { FlashCut } from './lib/FlashCut';
import { OpenScene } from './scenes/OpenScene';
import { VersusScene } from './scenes/VersusScene';
import { BrandScene } from './scenes/BrandScene';
import { HeroScene } from './scenes/HeroScene';
import { ScanScene } from './scenes/ScanScene';
import { TitleCard } from './scenes/TitleCard';
import { SearchScene } from './scenes/SearchScene';
import { CriticScene } from './scenes/CriticScene';
import { DawnScene } from './scenes/DawnScene';
import { OutroScene } from './scenes/OutroScene';

const S = SHOTS;

// 叙事字幕（C1：纯动画段落也配解说；品牌段/字卡/outro 除外）
const CAPTIONS: { from: number; dur: number; words: string[] }[] = [
  { from: 30, dur: S.open.to - 30 - 8, words: ['第一份工作，', '先收入，', '还是先成长？'] },
  { from: S.hero.from + 50, dur: S.hero.dur - 54, words: ['每天从知乎热榜里，', '挑出', '真正有分歧的问题'] },
  { from: S.scan.from + 20, dur: S.scan.dur - 24, words: ['左右两方，', '都是知乎上的', '真实回答'] },
  { from: S.search.from + 44, dur: S.search.dur - 50, words: ['心里有问题？', 'AI 帮你', '把分歧排成一场'] },
  { from: S.critic.from + 16, dur: S.critic.dur - HANDOFF - 16, words: ['不服？', '直接质疑，', 'AI 替这一方回应'] },
  { from: S.dawn.from + HANDOFF, dur: S.dawn.dur - HANDOFF - 4, words: ['听完两边，', '再做自己的选择'] },
];

// SFX 按"目标峰值帧"钉：from = 目标峰值帧 − 音源峰值滞后 − 输出音轨偏移（sound-design §4.6）。
// 峰值滞后 2026-09-15 用 librosa onset 包络逐文件实测（攻击峰，帧@30fps）；长 build 类（sparkle/riser）取振幅峰。
const PEAK_F: Record<string, number> = {
  'bass-hit-short.mp3': 2.4, 'click-camera.mp3': 4.9, 'data-scan.mp3': 3.8, 'hit-fast-exciting.mp3': 4.2,
  'impact-deep-whoosh.mp3': 8.7, 'keyboard.mp3': 0, 'pop.mp3': 1.4, 'riser-cine.mp3': 31.3, 'sparkle.mp3': 44.3,
  'swoosh-quick.mp3': 5.6, 'transition-snap.mp3': 2.8, 'transition-soft.mp3': 3.8, 'whoosh-big.mp3': 15.3, 'whoosh-fast.mp3': 20.5,
};
const OUTPUT_AUDIO_OFFSET_F = 1.27; // 本管线实测输出音轨滞后（与 timeline.ts OUTPUT_AUDIO_OFFSET_SEC 同源）
type Sfx = { at: number; file: string; volume: number; dur?: number };
const SFX: Sfx[] = [
  // S2 对撞：两半屏加速对冲（风声峰值 = 撞击帧）→ 撞击双层（大 slam ①，钉 beatF(12)）
  { at: beatF(12), file: 'whoosh-fast.mp3', volume: 0.45 },
  { at: beatF(12), file: 'hit-fast-exciting.mp3', volume: 1.0 },
  { at: beatF(12), file: 'bass-hit-short.mp3', volume: 0.45 },
  // S3 品牌：字标漂入 → 锁定加深
  { at: S.brand.from + 6, file: 'transition-soft.mp3', volume: 0.35 },
  { at: S.brand.from + 48, file: 'sparkle.mp3', volume: 0.3, dur: 80 },
  // S4 热辩卡：弹起 / 轮廓光束 / 贴回
  { at: S.hero.from + 50, file: 'whoosh-big.mp3', volume: 0.45 },
  { at: S.hero.from + 62, file: 'sparkle.mp3', volume: 0.3, dur: 70 },
  { at: S.hero.from + 130, file: 'transition-snap.mp3', volume: 0.45 },
  // S5 扫描核对
  { at: S.scan.from + 10, file: 'data-scan.mp3', volume: 0.35, dur: 70 },
  // S6 字卡出场
  { at: S.title.from + 5, file: 'swoosh-quick.mp3', volume: 0.4 },
  // S7 搜索：打字（截断与动作等长）/ 结果汇入 / 点击 / 推进
  { at: S.search.from + 10, file: 'keyboard.mp3', volume: 0.55, dur: 26 },
  { at: S.search.from + 54, file: 'whoosh-fast.mp3', volume: 0.3 },
  { at: S.search.from + 108, file: 'click-camera.mp3', volume: 0.6 },
  { at: S.search.from + 124, file: 'swoosh-quick.mp3', volume: 0.35 },
  // S8 质询：摘要落定 / 前三行 pop 递减 / 完成
  { at: S.critic.from + 22, file: 'transition-soft.mp3', volume: 0.3 },
  { at: S.critic.from + 44, file: 'pop.mp3', volume: 0.32 },
  { at: S.critic.from + 55, file: 'pop.mp3', volume: 0.26 },
  { at: S.critic.from + 65, file: 'pop.mp3', volume: 0.2 },
  { at: S.critic.from + 100, file: 'click-camera.mp3', volume: 0.3 },
  // S10 收场句式：riser（峰值顶到字标）→ impact（大 slam ②，钉 beatF(79)，全片 SFX 峰值）→ sparkle 点 rule
  { at: beatF(79), file: 'riser-cine.mp3', volume: 0.4, dur: 36 },
  { at: beatF(79), file: 'impact-deep-whoosh.mp3', volume: 0.6 },
  { at: S.outro.from + 60, file: 'sparkle.mp3', volume: 0.35, dur: 90 },
];
const sfxFrom = (s: Sfx) => Math.max(0, Math.round(s.at - (PEAK_F[s.file] ?? 0) - OUTPUT_AUDIO_OFFSET_F));

// critic → dawn 焦点接力：前景 blur 0→8
const CriticWithHandoff: React.FC = () => {
  const frame = useCurrentFrame();
  const b = interpolate(frame, [S.critic.dur - HANDOFF, S.critic.dur], [0, 8], clamp);
  return (
    <AbsoluteFill style={{ filter: b > 0.01 ? `blur(${b}px)` : undefined }}>
      <CriticScene dur={S.critic.dur} />
    </AbsoluteFill>
  );
};

export const Main: React.FC<{ bgm: boolean }> = ({ bgm }) => {
  return (
    <AbsoluteFill style={{ background: '#ffffff' }}>
      <Sequence from={S.open.from} durationInFrames={S.open.dur}><OpenScene /></Sequence>
      <Sequence from={S.versus.from} durationInFrames={S.versus.dur}><VersusScene dur={S.versus.dur} /></Sequence>
      <Sequence from={S.brand.from} durationInFrames={S.brand.dur}><BrandScene /></Sequence>
      <Sequence from={S.hero.from} durationInFrames={S.hero.dur}><HeroScene /></Sequence>
      <Sequence from={S.scan.from} durationInFrames={S.scan.dur}><ScanScene dur={S.scan.dur} /></Sequence>
      <Sequence from={S.title.from} durationInFrames={S.title.dur}><TitleCard dur={S.title.dur} /></Sequence>
      <Sequence from={S.search.from} durationInFrames={S.search.dur}><SearchScene dur={S.search.dur} /></Sequence>
      <Sequence from={S.critic.from} durationInFrames={S.critic.dur}><CriticWithHandoff /></Sequence>
      <Sequence from={S.dawn.from} durationInFrames={S.dawn.dur}><DawnScene /></Sequence>
      <Sequence from={S.outro.from} durationInFrames={S.outro.dur}><OutroScene dur={S.outro.dur} /></Sequence>

      {/* 推进流白 flash-cut：搜索点击推进 → 质询（from = 切点 − 5） */}
      <Sequence from={S.critic.from - 5} durationInFrames={10}><FlashCut duration={10} /></Sequence>

      {CAPTIONS.map((c, i) => (
        <Sequence key={i} from={c.from} durationInFrames={c.dur}>
          <BigCaption words={c.words} duration={c.dur} />
        </Sequence>
      ))}

      {bgm ? (
        <Audio
          src={staticFile('audio/bgm.mp3')}
          trimBefore={MUSIC_TRIM_F}
          volume={(f) => interpolate(f, [0, 10, TOTAL - 50, TOTAL], [0, 0.34, 0.34, 0], clamp)}
        />
      ) : null}
      {SFX.map((s, i) => (
        <Sequence key={`sfx-${i}`} from={sfxFrom(s)} durationInFrames={s.dur ?? 90}>
          <Audio src={staticFile(`audio/sfx/${s.file}`)} volume={s.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
