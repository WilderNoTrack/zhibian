import json, numpy as np, librosa
from scipy.signal import butter, sosfilt
y, sr = librosa.load("../public/audio/bgm.mp3", sr=None, mono=True)
dur = len(y)/sr
yp = librosa.effects.percussive(y)
def fit(beats):
    i=np.arange(len(beats)); A=np.vstack([i,np.ones_like(i)]).T
    (T,t0),*_=np.linalg.lstsq(A,beats,rcond=None); return T,t0
tempo, beats = librosa.beat.beat_track(y=yp, sr=sr, tightness=400, units="time")
T,t0 = fit(beats)
res = beats-(t0+np.arange(len(beats))*T)
def band_env(lo,hi):
    sos=butter(4,[lo,hi],btype="band",fs=sr,output="sos")
    env=librosa.onset.onset_strength(y=sosfilt(sos,yp),sr=sr); return env, librosa.times_like(env,sr=sr)
kick,times = band_env(40,160); snare,_=band_env(150,500); hat,_=band_env(6000,min(14000,sr/2-100))
onsets = librosa.onset.onset_detect(y=yp, sr=sr, units="time", backtrack=False)
cands={}
for mult in (0.5,1,2):
    TT=T/mult; n=int((dur-t0)/TT); grid=t0+np.arange(n)*TT
    d=np.array([np.min(np.abs(onsets-g)) for g in grid])
    match=float(np.mean(d<0.035)); mae=float(np.mean(d[d<0.035])*1000) if match>0 else 999
    cands[str(mult)]={"bpm":60/TT,"match":match,"mean_abs_ms":mae}
while t0-T>0: t0-=T
nb=int((dur-t0)/T)
def at(env,t): return float(env[np.argmin(np.abs(times-t))])
hits=[{"n":n,"t":t0+n*T,"kick":at(kick,t0+n*T),"snare":at(snare,t0+n*T),"hat":at(hat,t0+n*T)} for n in range(nb)]
rms=librosa.feature.rms(y=y)[0]; rt=librosa.times_like(rms,sr=sr)
rms_beats=[float(np.mean(rms[(rt>=t0+n*T)&(rt<t0+(n+1)*T)])) for n in range(nb)]
out={"bpm":60/T,"t0":t0,"T":T,"duration":dur,"residual_ms_max":float(np.abs(res).max()*1000),"candidates":cands,"beats":[t0+n*T for n in range(nb)],"hits":hits,"rms_per_beat":rms_beats}
json.dump(out,open("beat_data.json","w"),indent=1)
print(f"dur={dur:.2f}s BPM={60/T:.3f} t0={t0:.4f} T={T:.5f} resid_max={np.abs(res).max()*1000:.1f}ms beats={nb}")
print("candidates",json.dumps(cands))
mx=max(rms_beats)
line="".join(" .:-=+*#%@"[min(9,int(9*r/mx))] for r in rms_beats); print("rms/beat:"); [print(f"b{i:3d} {line[i:i+32]}") for i in range(0,len(line),32)]
top=sorted(hits,key=lambda h:-h["kick"])[:12]; print("top kicks:",[(h["n"],round(h["t"],2)) for h in sorted(top,key=lambda h:h["n"])])
