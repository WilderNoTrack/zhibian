// 帧级时间轴：一切镜头边界用拍号 beatF(n) 表达（music-beat-sync §4）。
// BGM = house-vibez.mp3，analysis/beat_data.json：122.00 BPM，match 98.1%，mean 6.8ms，残差 ≤15.6ms。
// 源音乐从第 116 拍起用：breakdown 段垫 AIGC 开场，b128（片内 b12，kick 1.9）钉对撞，
// b128–191 满能量段承载功能段，b195（片内 b79，snare 6.3 全段最强）钉收尾字标。
export const FPS = 30;
export const SOURCE_BEAT0 = 0.0669046672577211; // 源分析 t0（审计真值，勿改）
export const BEAT_INT = 0.4917954637470821; // T
export const MUSIC_START_BEAT = 116;
// 渲后回测实测（Remotion 4.0.484 + h264/AAC 48kHz mp4，2026-09-15）：BGM 交叉相关与 SFX 探针一致滞后 1.27f（AAC priming）
export const OUTPUT_AUDIO_OFFSET_SEC = 1.27 / 30;

const MUSIC_START_SEC = SOURCE_BEAT0 + MUSIC_START_BEAT * BEAT_INT;
export const MUSIC_TRIM_F = Math.round(MUSIC_START_SEC * FPS); // <Audio trimBefore>
const BEAT0_IN_VIDEO = MUSIC_START_SEC - MUSIC_TRIM_F / FPS; // 取整残差，计入拍网格

/** 片内第 n 拍（相对 BGM 使用起点）→ 秒 */
export const beatT = (n: number) => BEAT0_IN_VIDEO + OUTPUT_AUDIO_OFFSET_SEC + n * BEAT_INT;
/** 片内第 n 拍 → 帧 */
export const beatF = (n: number) => Math.round(beatT(n) * FPS);

const span = (from: number, to: number) => ({ from, to, dur: to - from });

// 焦点接力（critic → dawn）交叉窗口
export const HANDOFF = 14;

export const SHOTS = {
  open: span(0, beatF(12)),
  versus: span(beatF(12) - 10, beatF(20)), // 两半屏 10f 对冲，撞击帧 = beatF(12)
  brand: span(beatF(20), beatF(28)),
  hero: span(beatF(28), beatF(38)),
  scan: span(beatF(38), beatF(48)),
  title: span(beatF(48), beatF(52)),
  search: span(beatF(52), beatF(62)),
  critic: span(beatF(62), beatF(71) + 2),
  dawn: span(beatF(71) - HANDOFF + 2, beatF(79) - 44),
  outro: span(beatF(79) - 44, beatF(79) - 44 + 160), // 字标首字压印 = 局部 44f = beatF(79)
};

export const TOTAL = SHOTS.outro.to;
