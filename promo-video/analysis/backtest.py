"""渲后回测：①输出音轨偏移（SFX 探针交叉相关，无 BGM 版）②BGM 对齐（带 BGM 版片头无 SFX 窗口）③成片响度峰值。"""
import json, subprocess, sys, os
import numpy as np, librosa

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
FF = r"D:\Program\09_AIGC\MuseIN AIGC\tools\ffmpeg.exe"
SR = 48000
FPS = 30

def extract(mp4, wav):
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", "-i", mp4, "-vn", "-ac", "1", "-ar", str(SR), wav], check=True)
    y, _ = librosa.load(wav, sr=SR, mono=True)
    return y

def probe(render, src, design_from_f, win_f=12):
    s, _ = librosa.load(src, sr=SR, mono=True)
    s = s[: int(0.5 * SR)]
    a = int((design_from_f - win_f) / FPS * SR)
    b = int((design_from_f + win_f) / FPS * SR) + len(s)
    seg = render[max(0, a):b]
    c = np.correlate(seg, s, mode="valid")
    norm = np.sqrt(np.convolve(seg ** 2, np.ones(len(s)), mode="valid")) * np.sqrt(np.sum(s ** 2)) + 1e-9
    k = int(np.argmax(c / norm))
    actual_f = (max(0, a) + k) / SR * FPS
    return actual_f - design_from_f, float((c / norm)[k])

# 与 src/timeline.ts / Main.tsx 同一套公式计算设计帧
T0, T = 0.0669046672577211, 0.4917954637470821
OFF_SEC = float(os.environ.get("OFF_SEC", 1.27 / 30))
OFF_F = float(os.environ.get("OFF_F", 1.27))
MS = T0 + 116 * T
TRIM = round(MS * FPS)
B0 = MS - TRIM / FPS
def beatF(n): return round((B0 + OFF_SEC + n * T) * FPS)
def sfx_from(at, peak): return max(0, round(at - peak - OFF_F))

def main():
    nobgm = extract(os.path.join(ROOT, "out", os.environ.get("NOBGM", "zhibian-promo-nobgm.mp4")), os.path.join(HERE, "render-nobgm.wav"))
    withbgm = extract(os.path.join(ROOT, "out", os.environ.get("WITHBGM", "zhibian-promo.mp4")), os.path.join(HERE, "render-bgm.wav"))
    sfx = os.path.join(ROOT, "public", "audio", "sfx")
    # 设计 from 帧（与 Main.tsx sfxFrom 一致）
    probes = [("transition-snap.mp3", sfx_from(beatF(28) + 130, 2.8)), ("click-camera.mp3", sfx_from(beatF(52) + 108, 4.9)), ("click-camera.mp3", sfx_from(beatF(62) + 100, 4.9))]
    print("== SFX 探针（无 BGM 版）：实测 − 设计（帧）")
    offs = []
    for f, d in probes:
        off, score = probe(nobgm, os.path.join(sfx, f), d + OFF_F)
        offs.append(off); print(f"  {f:22s} design {d:5d}f  offset {off:+.2f}f  corr {score:.2f}")
    print(f"  => 输出音轨偏移 均值 {np.mean(offs):+.2f}f  离散 {np.ptp(offs):.2f}f")
    # BGM：源音乐 trimBefore 1713f 起的前 4.5s 与渲染带 BGM 版对齐（片头 0–4.5s 无 SFX）
    src, _ = librosa.load(os.path.join(ROOT, "public", "audio", "bgm.mp3"), sr=SR, mono=True)
    trim = int(TRIM / FPS * SR)
    ref = src[trim + int(1.0 * SR): trim + int(4.0 * SR)]
    seg = withbgm[int(0.5 * SR): int(4.5 * SR)]
    c = np.correlate(seg, ref, mode="valid")
    k = int(np.argmax(c))
    bgm_off_f = ((int(0.5 * SR) + k) / SR - 1.0) * FPS - OFF_SEC * FPS
    print(f"== BGM 对齐：渲染相对设计偏移 {bgm_off_f:+.2f}f")
    for name, y in [("with BGM", withbgm), ("no BGM", nobgm)]:
        pk = 20 * np.log10(np.max(np.abs(y)) + 1e-9)
        print(f"== 峰值 {name}: {pk:.1f} dBFS")
    # 大 slam 时刻附近的 BGM 瞬态回测（带 BGM 版 − 无 BGM 版 ≈ BGM 轨）
    n = min(len(withbgm), len(nobgm))
    bgm_only = withbgm[:n] - nobgm[:n]
    env = librosa.onset.onset_strength(y=bgm_only, sr=SR)
    t = librosa.times_like(env, sr=SR)
    for label, f in [("slam① beatF(12)", beatF(12)), ("flash-cut beatF(62)", beatF(62)), ("slam② beatF(79)", beatF(79))]:
        w = (t > f / FPS - 0.12) & (t < f / FPS + 0.12)
        tt = t[w][np.argmax(env[w])]
        print(f"== {label}: 设计 {f}f  BGM 实测瞬态 {tt * FPS:.1f}f  误差 {tt * FPS - f:+.1f}f")

main()
