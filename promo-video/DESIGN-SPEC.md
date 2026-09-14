# 知辨宣传片 · 设计 spec（制作放行基准）

创作模式：**共同创作**（video-shotcraft guided-free-creation）。因黑客松提交截止（2026-09-15 10:00），
经用户同意将确认节点合并为两轮：①产品简报+需求决策+视觉方向 ②镜头映射+完整分镜。用户已放行。

## 1. 产品简报（已确认）

| 项目 | 结论 | 依据 |
|---|---|---|
| 项目定位 | 把知乎上真实存在分歧的回答编排成左右对照的辩论阅读 | README、首页"知辨是什么" |
| 视频用途 | 知乎黑客松 2026「项目演示视频」选交加分项 + 项目广场人气传播 | 开发者手册作品交付清单 |
| 核心卖点 | ①同一问题左右两方都是真实回答 ②原句逐字核对不补写 ③AI 只做摘要/质询，不裁决 | README、辩论页阅读提示 |
| 必须展示功能 | 今日热辩、辩论现场（左右席位/核对原句/AI 摘要）、提问→搜索→AI 自动编排、AI 质询、辩题库 | 页面五个入口 |
| 时长/画幅/语言 | 约 43s（用户："你来决定，可以不要很长"），1920×1080@30fps，中文字幕 | 用户回复 |
| 音乐 | 素材库 house-vibez.mp3（Mixkit，免费商用）+ 电影系 SFX；交付带 BGM / 无 BGM 两版 | skill 规范 |
| 数据合规 | **用户确认保留真实知乎作者昵称/头像/原句**（公开内容，产品卖点即"真实来源"）；不采集密钥 | 用户回复"保留" |
| AIGC | MuseIN cn · Seedance 2.0 text-to-video 4 条（开场/左/右/结尾），仅用于非页面复刻镜头，画面无文字 | 用户："花多少都可以"；aigc/manifest.json |

## 2. 视觉方向与 tokens（方向 A「知乎原生 · 干净克制」）

跳过 styleframe 对比：用户明确要求"根据我现在这个风格来做"（等同严格品牌规范），且截止时间紧。

- 色板（web/zhihu.css :root）：brand #1772f6、bg #f6f6f6、card #fff、text #121212 / #444 / #8491a5、line #ebebeb、
  左方 #e0552f / #fff3ee、右方 #4a5bd6 / #eff1ff、ok #0e9f6e；扩展 brandDeep #0a4fb8（锁定加深脉冲）。
- 字体：-apple-system, "PingFang SC", "Microsoft YaHei"… 无衬线；圆角 4px；阴影 0 1px 3px。
- 光感：冷白光、知乎蓝光效；AIGC 调冷白明亮（B/C 片段叠左橙/右靛色罩）。
- 动效性格：专业信赖×亲和友好之间——入场 outCubic/bezier(0.2,0.75,0.25,1)，落地类沿用卡片过冲值；全片高光只给主角一次。

## 3. 功能 → 镜头映射（已确认）

| 功能 | 镜头卡 · 变体 | 卡片文档 | 准确 demo 源码 | 参考样片 |
|---|---|---|---|---|
| 痛点字幕 / 全片叙事字幕 | blur-slide | references/shots/typography/blur-slide.md | demos/typography/blur-slide/BlurSlide.tsx | gallery media/blur-slide.mp4 |
| 同一问题两种人生 | transition-hidden-cut · versus-slam | references/shots/transition/transition-hidden-cut.md | demos/transition/transition-hidden-cut/VersusSlam.tsx | media/versus-slam.mp4 |
| 品牌字标 | type-assembly-moves · drift-assembly | references/shots/typography/type-assembly-moves.md | demos/typography/type-assembly-moves/LetterformDriftAssembly.tsx | media/drift-assembly.mp4 |
| 今日热辩 | spotlight-hero-card | references/shots/opening/spotlight-hero-card.md | demos/opening/spotlight-hero-card/SpotlightHeroCard.tsx | media/spotlight-hero-card.mp4 |
| 辩论现场 + 原句核对 | scanline-annotate-focus | references/shots/effects/scanline-annotate-focus.md | demos/effects/scanline-annotate-focus/ScanlineAnnotateFocus.tsx | media/scanline-annotate-focus.mp4 |
| 呼吸字卡 | paper-title-card | references/shots/typography/paper-title-card.md | demos/typography/paper-title-card/PaperTitleCard.tsx | media/paper-title-card.mp4 |
| 提问 → AI 自动编排 | type-and-filter | references/shots/interaction/type-and-filter.md | demos/interaction/type-and-filter/TypeAndFilter.tsx | media/type-and-filter.mp4 |
| AI 质询 | ai-stream-response | references/shots/interaction/ai-stream-response.md | demos/interaction/ai-stream-response/StreamResponse.tsx | media/ai-stream-response.mp4 |
| 情感收束转场 | shot-transitions · shot-transitions-5（虚焦接力） | references/shots/transition/shot-transitions.md | demos/transition/shot-transitions/FocusHandoffTransition.tsx | media/shot-transitions-5.mp4 |
| 收场（含辩题库代表元素） | outro-group-photo-launch | references/shots/outro/outro-group-photo-launch.md | demos/outro/outro-group-photo-launch/OutroGroupPhotoLaunch.tsx | media/outro-group-photo-launch.mp4 |
| 搜索→质询接缝 | shot-transitions · flash-cut | 同上 | assets/lib/FlashCut.tsx | media/flash-cut.mp4 |

（路径均相对 ~/.claude/skills/video-shotcraft/）

## 4. 最终分镜（帧级，src/timeline.ts 为唯一事实源）

BGM 节拍网格：122.00 BPM，t0 0.0669s，T 0.49180s；源音乐自第 116 拍起用（trimBefore 1713f）。片内 beatF(n)。

| # | 帧 | 拍 | 功能信息 | 镜头卡 | 主动作 | 素材 | 字幕 / SFX |
|---|---|---|---|---|---|---|---|
| 1 | 0–177 | b0–12 | 痛点 | blur-slide | AIGC 深夜刷手机，黑场淡入 | aigc/A_open.mp4 | "第一份工作，先收入，还是先成长？" |
| 2 | 167–295 | 撞击 b12 | 同一问题两种人生 | versus-slam | 左 B（城市·暖橙罩）右 C（小城·靛蓝罩）斜缝对冲撞合，白闪+震屏+VS；阵营名"先满足生存与独立 / 成长空间放在首位"（取自真实辩论页） | aigc/B_left、C_right | whoosh-fast → hit-fast-exciting（**大 slam ①**） |
| 3 | 295–413 | b20–28 | 品牌 | drift-assembly | "知辨"漂移合拢 + 副标"让分歧被看见"，76f 起静止 ≥30f | 排版 | transition-soft、sparkle |
| 4 | 413–561 | b28–38 | 今日热辩 | spotlight-hero-card | 首页全景→聚光锁定热辩卡→左侧斜推→浮起+光束两圈→贴回，锁死 18f | textures/topics-full + hot-card-4x | "每天从知乎热榜里，挑出真正有分歧的问题" / whoosh-big、sparkle、transition-snap |
| 5 | 561–708 | b38–48 | 辩论现场+原句核对 | scanline-annotate-focus | 辩论页（第一份工作）扫描线下扫，依次框住 回合数/左方/右方/左原句/右原句，标注 "✓ 原句逐字核对"，状态行 → "逐字核对 · 完成" | textures/debate-full | "左右两方，都是知乎上的真实回答" / data-scan |
| 6 | 708–767 | b48–52 | 呼吸字卡 | paper-title-card | "不补写，不裁决。" + 下划线 + 副行 | 排版 | swoosh-quick |
| 7 | 767–915 | b52–62 | 提问→AI 自动编排 | type-and-filter | 顶部搜索框逐字打"要不要考研"→结果错峰汇入真实槽位→双圈 ripple 点击"自动编排这 35 条"→推进 | textures/search-empty + search-full | "心里有问题？AI 帮你把分歧排成一场" / keyboard(28f)、whoosh-fast、click-camera、swoosh-quick |
| 8 | 915–1050 | b62–71 | AI 质询 | ai-stream-response | flash-cut 进；真实 DeepSeek 回应：标签+首行先落→5 行逐行汇入→出处行完成态+面板脉冲→静止 | textures/critic-result | "不服？直接质疑，AI 替这一方回应" / transition-soft、pop×3 递减、click-camera 0.3 |
| 9 | 1036–1122 | b71–76 | 情感收束 | shot-transitions-5 | 质询页虚焦 blur 0→8 ↔ AIGC 晨光片段 8→0（14f，错 3f） | aigc/D_close.mp4 | "听完两边，再做自己的选择" |
| 10 | 1122–1282 | 字标 b79 | 收场 | outro-group-photo-launch | 顶栏/质询回应/热辩卡/左右原句/AI 摘要/自动编排/辩题库卡 8 元素四方飞入围住"知辨"，crane+冷白舞台光+蓝色尘点，"知乎黑客松 2026 · 知识炼金场"，hold 后淡出 | 以上纹理原位裁切 | riser-cine → impact-deep-whoosh（**大 slam ②**，钉 beatF(79)）→ sparkle |

全画面级冲击计数（R4）：①b12 versus-slam（kick 1.9）②b62 flash-cut（交互穿透转场）③b79 outro 字标（snare 6.3，全段最强）；相邻间隔 50 / 17 拍 ≥16 ✓。

## 5. 有意识的适配 / 偏离（需审查知悉）

1. versus-slam：两半屏换 AIGC 视频（B 0.6x 慢放+镜像位移、C 0.7x），无建立段虚线预示（直接压在开场片段上对冲）。
2. drift-assembly：整词呼吸从 80–104f 提前到 52–76f，让 2 字字标在 118f 镜头内满足 R1 hold ≥30f。
3. paper-title-card：中文强调词不做斜体（中文仿斜体损字形），仅用品牌蓝；无 DigitRoll 副行。
4. spotlight-hero-card：推进 zoom 按卡宽反算（2.6→1.34），焦点偏移屏幕等效换算；光池半径随卡放大；**不用可选 3D 注记**（与字幕信息重复）。
5. scanline-annotate-focus：亮底反转配色；标注加白底胶囊、34px（Q11）；目标 6→5。
6. type-and-filter：知辨搜索是"结果从无到有"，故"网格收敛退场"改为"结果错峰汇入真实槽位"；中文打字 5f/字。
7. ai-stream-response：真实回应为一段 6 行正文，按"标签+首行=摘要、后 5 行=证据行"揭示；**不加逐行状态图标**（产品无此 UI，Q1）；完成态用产品自带出处行。
8. outro：9→8 元素；金尘改蓝色尘点；字标下方文案不重复"让分歧被看见"（P4）。
9. 叙事字幕 58px 白底卡（Q11 ≥56px），全片 6 条；品牌段/字卡/outro 不加字幕（C1 例外）。

## 6. 渲后音画回测（analysis/backtest.py）

- 管线：Remotion 4.0.484 + h264 / AAC 48kHz mp4。v1 实测输出音轨整体滞后 **1.27f**（BGM 交叉相关与 SFX 探针一致，AAC priming 指纹）。
- 补偿：timeline.ts `OUTPUT_AUDIO_OFFSET_SEC = 1.27/30`（画面拍点随之后移），Main.tsx `OUTPUT_AUDIO_OFFSET_F = 1.27`（SFX from 前移）；源分析 t0 未改。
- v2 结果：SFX 探针残差 +0.00 / +0.00 / +0.02f；BGM 偏移 +0.00f。
- 大冲击点（按 kick 频段真实攻击定位）：slam① 设计 179f / kick 攻击 178.8–179.3f（≈+0.3f）；flash-cut 916f / 916.5f（+0.5f）；slam② 1167f / 1167.3f（+0.3f）。
  注：宽带 onset 在 slam① 附近会取到 182.3f 的 snare 次瞬态（+3.3f），按 kick 频段复核后确认主重音对齐。
- SFX 峰值滞后逐文件实测（onset 攻击峰），写入 Main.tsx PEAK_F；峰值 带 BGM −1.4 dBFS / 无 BGM −2.7 dBFS，无削波。

## 7. 数据与素材来源

- 页面纹理：本地 `npm run dev` 真实服务（127.0.0.1:5173），2026-09-15 02:20 采集，capture/capture.py 可重跑；src/layout.json 为坐标表。
- 真实知乎内容（用户确认保留）：辩题"第一份工作，先收入还是先成长？"、答主"哲思说管理""筱惠惠"等、搜索"要不要考研"结果、DeepSeek 质询回应。
- AIGC：aigc/manifest.json 记录 4 条成功 + 1 条版权拦截失败（D_close 首版，已改提示词重生成）。
- 音频：~/.claude/skills/video-shotcraft/assets/audio（Mixkit 免费商用，见 ATTRIBUTION.md）。
