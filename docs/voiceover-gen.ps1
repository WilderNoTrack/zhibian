# 生成「知辨」演示视频配音：每个镜头一个 wav 文件（01.wav ~ 09.wav）
# 用法：在 PowerShell 里进入项目目录后执行  .\docs\voiceover-gen.ps1
# 语速可用参数调： .\docs\voiceover-gen.ps1 -Rate 2   （默认 3，约正常讲解语速）
# 输出到 docs\voiceover\ 。生成完把这个目录交给 AI，由它量时长、排切换点。

param([int]$Rate = 3)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'docs\voiceover'
New-Item -ItemType Directory -Force $outDir | Out-Null

$shots = @(
  @{ id = '01'; text = '知乎上吵八百楼的问题，在这儿刷十分钟，两边的道理就都听完了。这是知辨，把真实存在分歧的回答，摆到同一张桌子上。' },
  @{ id = '02'; text = '今日热辩，AI 自动从热榜收题，还顺手把标题改得更像辩题。五秒换一道，底下圆点随便点。悬停它就停，比真人好使。AI 改过标题的，下面都留着知乎原题，出处不藏。' },
  @{ id = '03'; text = '点进来，直接开吵。一个回合，两位真实答主，一人一句核对过的原句。左边一句，右边一句，一个字没改，标点都没动。不信？点原文与来源，回知乎自己查。查得到，才算数。' },
  @{ id = '04'; text = '太长不看？AI 摘要，一句一行。只提炼条件和依据，排版我们改，意思一个字不改。' },
  @{ id = '05'; text = '重头戏来了。你挑个刺，AI 替这位答主回怼，用他的原话、他的语气、他的逻辑。郑重声明：这是 AI 模拟，答主本人不知道，也不会来打你。但它反驳你的每一条，都出自这条回答的原文，一句都不编。' },
  @{ id = '06'; text = '你也可以直接出题。知乎一次只给十条？那就多问几个说法。AI 先给几组关键词，后悔的人一组，觉得值的另一组，每组都搜一遍，合并去重。加载时你能看到它在干嘛，是真在搜，不是装忙。结果页还会告诉你它用了哪几组词。' },
  @{ id = '07'; text = '再让 AI 把它们排成一场。但它说了不算。另一位 AI 裁判会去查，这两位作者本人，是不是真的站在两边？同向的，直接删。所以你看到的对立，是查过的，不是 AI 嘴上说的。它删了几个，加载的时候都写给你看。' },
  @{ id = '08'; text = '编排成功的全进辩题库，能搜能筛。AI 编排和人工核对分得明明白白，AI 的题绝不冒充人工查过的。' },
  @{ id = '09'; text = '知辨不告诉你谁对谁错，它只保证一件事。你听到的每一句，都是知乎的原话，都能点回去看。' }
)

$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice.Rate = $Rate
$format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(44100, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)

foreach ($shot in $shots) {
  $file = Join-Path $outDir ($shot.id + '.wav')
  $voice.SetOutputToWaveFile($file, $format)
  $voice.Speak($shot.text)
  $voice.SetOutputToDefaultAudioDevice()
  Write-Host ("已生成 " + $file)
}

Write-Host ""
Write-Host "全部完成。把这个目录交给 AI 量时长、排切换点。"
$voice.GetInstalledVoices() | ForEach-Object { Write-Host ("使用的语音： " + $_.VoiceInfo.Name + " (" + $_.VoiceInfo.Culture + ")") }
