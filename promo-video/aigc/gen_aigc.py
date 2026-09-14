"""知辨宣传片 AIGC 片段生成（MuseIN cn · Seedance 2.0 text-to-video）。
并行提交；每条记录模型/参数/提示词/任务结果到 manifest.json。exit 9 不重试。"""
import json, os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = r"D:\Program\09_AIGC\MuseIN AIGC\tools\musein_run.py"
MODEL = "doubao-seedance-2-0-260128"
STYLE = "写实电影感，明亮干净的冷白色调，浅景深，柔和自然光，胶片质感细腻，画面中不出现任何可读文字、字幕、标志或水印，人物形态稳定不变形。"
CLIPS = {
  "A_open": (6, "深夜的大学宿舍，一位二十岁出头的中国大学生侧身靠在书桌前，脸被手机屏幕的冷白光照亮，拇指缓慢向上滑动，眉头微皱、神情犹豫。手机屏幕背对镜头不可见。背景是虚焦的书架和台灯微光，镜头极缓慢地向人物面部推近。"),
  "B_left": (5, "傍晚的一线城市高楼办公室，一位二十多岁的年轻中国女性站在落地窗前，身后城市灯火渐亮，她转身看向窗外，神情坚定自信。整体带暖橙色夕阳光。镜头缓慢横移。"),
  "C_right": (5, "清晨安静的小城工作室，一位二十多岁的年轻中国男性坐在木桌前专注地做手工项目，窗外是低矮的屋顶和树，神情从容满足。整体带清冷的靛蓝色晨光。镜头缓慢横移。"),
  "D_close": (5, "清晨的大学图书馆窗边，一位穿白色T恤的短发中国男大学生把手机轻轻放在木桌上，抬起头望向窗外洒进来的明亮阳光，神情逐渐放松，露出淡淡的微笑。桌上摊着笔记本，窗外是绿树和晴朗天空。镜头缓慢向后拉远。"),
}
def run(name):
    dur, scene = CLIPS[name]
    prompt = scene + STYLE
    args = [sys.executable, RUNNER, "gen", "--type", "video", "--model", MODEL, "--prompt", prompt,
            "--param", f"duration={dur}", "--param", "ratio=16:9", "--param", "resolution=1080p",
            "--param", "generate_audio=false", "--strict-model", "--wait=1500s",
            "--output", os.path.join(HERE, "out", name), "--json", "--quiet"]
    t0 = time.time()
    p = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=1800)
    try: data = json.loads(p.stdout.strip())
    except Exception: data = {"raw_stdout": p.stdout[-1500:], "raw_stderr": p.stderr[-1500:]}
    print(f"[{name}] exit={p.returncode} status={data.get('status')} pts={data.get('usage',{}).get('points_consumed')} {int(time.time()-t0)}s", flush=True)
    if p.returncode == 9: print(f"[{name}] EXIT 9: outcome unknown — do NOT resubmit; use task resolve", flush=True)
    return name, {"model": MODEL, "endpoint": "cn", "prompt": prompt,
                  "params": {"duration": dur, "ratio": "16:9", "resolution": "1080p", "generate_audio": False},
                  "exit_code": p.returncode, "result": data, "submitted": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t0))}
names = sys.argv[1:] or list(CLIPS)
mf = os.path.join(HERE, "manifest.json")
manifest = json.load(open(mf, encoding="utf-8")) if os.path.exists(mf) else {}
with ThreadPoolExecutor(4) as ex:
    for name, entry in ex.map(run, names):
        manifest[name] = entry
        json.dump(manifest, open(mf, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("done")
