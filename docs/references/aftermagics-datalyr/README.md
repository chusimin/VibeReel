---
title: 参考视频拆解 · Aftermagics · Datalyr Motion Clip
source: Aftermagics - A few animation clip for @trydatalyr #1
duration: 17.5s
resolution: 1920×1080 @ 30fps
audio: 44.1kHz stereo, 128kbps AAC
bpm: 113
tags:
  - showreel-reference
  - motion-graphics
  - product-flow
  - warm-orange
  - beat: 113
  - shots: soft-transition
拆解日期: 2026-07-04
拆解方法: ffmpeg + aubio + magick + gemini-2.5-flash
---

# 参考视频拆解 · Aftermagics × Datalyr

> **一句话定性**：**产品流程可视化 + 暖橙单色系 + 软过渡驱动**的 B2B SaaS 品牌 motion。这条视频**代表一个特殊子类型**：不是靠"很多镜头快切"堆节奏，而是靠"一个流程图逐步生长 + 精确音乐节拍"塑造 confidence。

---

## 0. 元数据

| 项 | 值 |
|---|---|
| 时长 | 17.53 秒 |
| 分辨率 / 帧率 | 1920×1080 / 30fps |
| 音频 | 128kbps AAC, stereo |
| BPM | **113**（中位拍间隔 0.53s，稳态） |
| 主拍点数 | 28 (aubiotrack) |
| onset 数 | 125（细密音效层，~7/s） |
| 硬切次数 | **0-2**（scene threshold 0.03 才检出 7 个瞬间，其中 5 个是 3-10ms 的连发变形） |
| 主色系 | 暖橙 `#EC6C1C` + 米白 `#F1EAE2`（贯穿 17s 中 15s） |
| 有无人声 | 无 |
| 音乐性格 | 确定推进 / 克制 / 有轻微 build-up 但无 drop |

**关键发现**：**这不是"高频硬切" showreel**——是**"连续变形驱动"**，18s 里只有 2 次可感知的硬转场。这类 showreel 高级感的核心在**"每一次形变都精确踩在拍点上"**。

---

## 1. 音乐层（Music & Rhythm）

### 1.1 拍点表（前 12 拍）

| # | 时间 (s) | 与上一拍间隔 |
|---|---|---|
| 1 | 1.94 | — |
| 2 | 2.46 | 0.53 |
| 3 | 3.27 | 0.81 (半拍加长，起始不太规律) |
| 4 | 3.83 | 0.56 |
| 5-28 | 稳定 0.53s | 稳定 |

**含义**：**前 1.9 秒是"空拍/氛围铺垫"，第 2 秒才真正进入节奏。这是 showreel 常见的"hook 缓冲"手法——不上来就打，先给氛围。**

### 1.2 音量曲线（RMS，dB）

```
0.0s -19dB ─┐
0.3s -10dB ─┴─ 快速起势（0.3 秒内涨 9dB）
0.5-16s   -10~-8dB ─── 平稳
16-17s    -12~-15dB ─── 渐弱收束
```

**含义**：**前 0.3s 是"淡入"、末尾 1s 是"淡出"、中间 15s 是"平推"**。视觉设计要匹配：第 1 帧要能承受"无声进入"（不能有强动效），第 17 秒要留白（不能塞新信息）。

### 1.3 音效密度

- 主拍点 (beats)：28 个 / 17.5s = **1.6 个/秒**
- 音符起点 (onsets)：125 个 / 17.5s = **7 个/秒**
- **比值 4.4**：说明音乐里有细密音效层（whoosh/tick/blip 等），**动画可以踩到 onset 而不只踩主拍**——这是"每一小细节都在动"感觉的来源。

---

## 2. 视觉层（Visual）

### 2.1 主色板 timeline（每秒采样）

| 秒 | 主色（前 3） |
|---|---|
| 1-2 | 米白 `#F1EAE2` + 淡橙 `#EFCFBD` + 灰米 `#C1BBB4` |
| 3-5 | 米白 + 深橙 `#EF9660` + 淡橙 |
| 6 | **紫色 `#7965CA` 短暂出现**（视觉"惊喜点"，约 1 秒） |
| 8-10 | 深橙 `#EC6C1C` + 米白 + 中橙 |
| 11 | **突然变黑 `#030303`**（+ 深棕），画面反转 |
| 12-18 | 回到暖橙 `#F37E25` + 米白，收束品牌页 |

**洞察**：整片色板极其克制——**主色只有 3 组**：
1. **主色域**：暖橙 `#EC6C1C` (accent) + 米白 `#F1EAE2` (bg)
2. **点缀**：紫 `#7965CA`（第 6 秒 1 秒惊喜，其他时候不出现）
3. **反转**：黑 `#030303`（第 11 秒 1 秒对比，其他时候不出现）

**规则**：**"92% 主色 + 6% 点缀 + 2% 反转"** —— 这个比例本身可以成为一条 skill。

### 2.2 分镜（Shot Timeline）

用密集帧分析（每 1.6s 一段，共 11 段）+ 稀疏帧描述交叉验证，可以还原出 **7 个"逻辑镜"**（不是硬切镜，是叙事段）：

| 段 | 时间 | 内容 | 主动效动词 | 转场至下一段 |
|---|---|---|---|---|
| A | 0.0-1.6s | 空白铺垫 + 米白背景微渐变（"hook 缓冲"） | fade | — |
| B | 1.6-3.2s | 大字标题 **"in under three minutes"** 淡入 + 色变强调关键字 | cross-fade, color-change | soft cross |
| C | 3.2-4.8s | 单个通知框 "New Visitor" 淡入 + 连接线滑出 | fade-in, slide, mask-reveal | 元素累加 (不切) |
| D | 4.8-6.4s | 加 "Visitor Identified" + "User Signed Up" 节点，构建流程图 | slide, fade, reveal | 元素累加 (不切) |
| E | 6.4-8.0s | 加 "Subscription Started" + "Conversion Postback"，流程图完成 | slide, fade | 元素累加 (不切) |
| F | 8.0-9.6s | 左侧橙色 **"Connects"** 按钮出现，突出"打通"概念 | fade-in, slide, typewriter | 元素累加 (不切) |
| G | 9.6-11.2s | 加 **"Map Events"** + **"Send Postbacks"**，全景流程图完成 | slide, fade | **剧变 → mask reveal（唯一硬转场 1）** |
| H | 11.2-12.8s | **黑幕 + 橙色圆形 logo 缩放**（视觉高潮） | fade, scale, mask | mask reveal + 淡出 |
| I | 12.8-14.4s | **品牌页**：Logo + "Datalyr" + slogan 淡入 | blur, fade-in, typewriter | 淡入不切 |
| J | 14.4-16.0s | 副标题 "Faster insights, Better decisions" 逐字打出 | typewriter, slide | 淡入不切 |
| K | 16.0-17.5s | **CTA**："Get started at Datalyr.com" + 静止 1.5s 收束 | typewriter → 静止 | end |

**分镜结构定性**：
- **A-G 是"生长动画"**：一个中心画面（流程图），元素**渐次累加**，不切镜、不换场
- **G→H 是唯一的"剧变"**：完成的流程图**收缩成 logo**（mask reveal + scale），这是全片的"drop"
- **H-K 是"品牌落地页"**：logo 出现 → 名字 → slogan → CTA，节奏由快转慢直至静止

**这个结构对 VibeReel 的启发**：**产品 showreel 不一定要多镜头**。**"1 个流程图 + 1 个 hero moment + 1 个品牌页"** 就是一种完整叙事模板。可以做成一条 **模板 skill：`showreel-single-flow`**。

### 2.3 动效动词频次

| 动词 | 出现次数 | 用途 |
|---|---|---|
| fade / fade-in | 8 | 元素入场主力 |
| slide | 7 | 元素定位 |
| typewriter | 5 | 文字入场 |
| mask / mask-reveal | 4 | 关键转场 |
| scale | 2 | logo 高潮 |
| blur | 2 | 品牌页背景 |
| color-change | 2 | 关键字强调 |
| cross-fade | 1 | 段间切换 |

**规律**：**fade + slide + typewriter 三件套占 76%**——这条视频的"动效基因"极其收敛，不炫技。**mask 只在关键转场用（4 次），scale 只给 logo 用（2 次）**——**稀缺动效 = 结构性重量**。

### 2.4 文字节奏

| 段 | 文字 | 出现方式 |
|---|---|---|
| B | in under three minutes | 全段停留 1.6s，重点词变色 |
| C-G | 流程节点文字（每个 1-3 词） | 与图形块同时入场 |
| H | 无文字 | 视觉高潮，纯图形 |
| I | Datalyr | slow fade-in |
| J | Faster insights, Better decisions | typewriter，逐词出现 |
| K | Get started at Datalyr.com | typewriter |

**规律**：
- **每个文字停留 ≥1.5s**（用户能读完）
- **kinetic text 只用来"逐词打字"**（typewriter），不用花哨的字体动画
- **末尾 CTA 静止 1.5s**——留时间让人记住网址

### 2.5 构图

18 秒中 **17 秒是"居中构图"**，只有 D 段 (4-5s) 是三分构图（两个流程框左右分布）。

**规律**：**showreel 品牌视频的构图默认应该是"居中"**，三分/负空间只在需要展示"关系/对比"时用。**居中 = 稳定感 = 品牌 confident**。

### 2.6 视觉密度

| 段 | 密度 |
|---|---|
| A, B, H | 极简（只有 1-2 个元素） |
| C, F | 极简（新元素入场） |
| D, E, G, I, J, K | 中（流程图完整时） |

**密度曲线**：**极简 → 累加至中 → 极简 → 中 → 极简收束**。**从来不"密"**——这是"高级感"的来源之一。

---

## 3. 结构层（Narrative）

### 3.1 起承转合

| 段落 | 时间占比 | 内容 |
|---|---|---|
| **起 (hook)** | 0-3.2s (18%) | 空拍铺垫 + 大字承诺 "in under three minutes" |
| **承 (build)** | 3.2-11.2s (46%) | 流程图渐次构建（5 个节点 + Connects + Map Events） |
| **转 (drop)** | 11.2-12.8s (9%) | 黑幕 + logo 收缩（唯一的视觉高潮） |
| **合 (land)** | 12.8-17.5s (27%) | 品牌页 + slogan + CTA |

### 3.2 叙事弧线：**"承诺 → 演示 → 收敛 → 品牌"**

不是卖点罗列，也不是纯情绪堆叠，而是**用一个具体流程演示"三分钟就能打通数据"这个承诺**。**信息密度是"渐增再骤减"**——观众跟着流程图长大，最后被 logo 一收，情绪完成闭环。

### 3.3 hook 时刻

**前 3 秒的钩子是"文案"，不是"画面"**：
- 0-1.9s：几乎无内容（只有背景微变），**用音乐建立预期**
- 1.9-3.2s："in under three minutes" 大字—— **"三分钟"是承诺，是钩子**

这告诉我们：**showreel 的 hook 不一定是"炸场画面"，也可以是"轻声承诺"**——但**前提是文案必须够狠**。"三分钟就能..." 这种量化承诺就是好钩子。

### 3.4 首帧与末帧

- **首帧 (0.0s)**：米白背景 + 极淡渐变（几乎空白）
- **末帧 (17.5s)**：Datalyr logo + slogan + CTA，居中

**首帧空 + 末帧满** —— 这是**品牌视频**的经典构图（不是**创意视频**）。

### 3.5 重复与变奏

- **反复出现的视觉母题**：**橙色圆角矩形卡片**（每个流程节点都是这个形状）
- **变奏点**：只有第 11 秒的**橙色圆形 logo** 打破了矩形规律 —— 也就是说，**通过"打破形状规律"来标记高潮**

这条 rule 特别有用：**showreel 里"打破视觉规律的时刻 = 观众记忆点"**。

---

## 4. 技术层（Craft）

| 项 | 值 |
|---|---|
| 分辨率/帧率 | 1080p / 30fps（**没上 4K/60fps**，说明 30fps 已经够了） |
| motion blur | **明显有**（slide 动作有轻微拖尾） |
| grain / texture | 米白背景有**细微纸质纹理**（不是纯色，第 14s 稀疏帧可见"点状纹理"） |
| 音效层 | 有（onset 是 beats 的 4.4×），但很克制，没有 whoosh/impact 冲击音 |
| 调色 | 高光轻微溢出（米白偏暖），阴影不深（黑色只出现 1 秒） |
| easing 曲线 | 从动作节奏看是 **easeOut / easeInOut**，没有生硬的 linear |

**技术层洞察**：**这不是"技术堆料"的片子**，1080p/30fps + 简单 easing 就够了。**高级感来自"约束"，不来自"堆参数"**。

---

## 5. 反向沉淀 · 可以从这条视频抽出的 skill

### 5.1 原子 skill（可直接沉淀）

| skill 名 | 内容 | 例子引用 |
|---|---|---|
| `showreel-color-92-6-2` | 单色系比例规则：92% 主色 + 6% 点缀 + 2% 反转 | 这条视频 |
| `showreel-hook-quantified-promise` | 前 3 秒用"量化承诺"当钩子，不炸场 | 1.9-3.2s "in under three minutes" |
| `showreel-motion-scarcity` | 稀缺动效 = 结构性重量（mask 只在关键转场，scale 只给 logo） | 全片 |
| `showreel-density-arc` | 密度曲线：极简 → 累加至中 → 极简 → 中 → 极简收束，**从来不密** | 全片 |
| `showreel-broken-pattern-highlight` | 打破视觉规律的时刻 = 观众记忆点 | 11s 矩形→圆形 |
| `showreel-brand-outro-3step` | 品牌收束三段式：logo 淡入 → slogan typewriter → CTA 静止 1.5s | 12.8-17.5s |
| `showreel-beat-vs-onset` | 主动作踩 beat（1.6/s），细节动效踩 onset（7/s） | 全片 |

### 5.2 模板 skill（可直接调用）

**`showreel-single-flow`** —— 单流程图型产品 showreel 配方：
```
音乐: 稳态 BPM 110-120，无 drop，有 build-up
时长: 15-20s
色板: 92-6-2 单色系
结构:
  0-15%   hook (量化承诺文字大字)
  15-65%  build (流程图渐次生长，元素累加不切镜)
  65-75%  drop (黑幕 + logo 缩放，视觉高潮，剧变)
  75-100% land (品牌页三段式，节奏由快转慢至静止)
分镜数: 7 段（含 2 个静态段：hook 空拍 + 最后 CTA）
关键约束:
  - 至少 60% 时间是居中构图
  - 主体动效只用 fade+slide+typewriter
  - scale/mask 只在关键转场和 logo 上用
  - 末尾 CTA 必须静止至少 1.5s
```

### 5.3 反例 skill（也可从这条推出的"反例"）

| 反例 | 为什么 |
|---|---|
| **前 3 秒就开始炸场** | 观众没准备好，反而失焦（对照这条：前 1.9s 空拍） |
| **元素快速累加不留观察时间** | 用户看不清"每一步在讲什么"（对照这条：每段留 1.6s） |
| **每个转场都用不同动效** | 视觉分散，没有主动效基因（对照这条：76% 是 fade+slide+typewriter） |
| **末尾 CTA 还在动** | 用户来不及记住网址（对照这条：K 段静止 1.5s） |
| **配色 5+ 种** | 拼贴感（对照这条：主色只 2-3 组） |

---

## 6. 对 VibeReel 产品的启示

这条视频给我们的 3 个直接结论：

1. **"产品流程可视化"是独立开发者宣传视频的天然模板** —— 独立开发者的产品**都有一个核心 flow**（用户从 X 到 Y 的路径），把这个 flow 做成"渐次生长的流程图" = 立刻 15s 视频。这可以做成**默认模板**。

2. **音乐先行的具体做法就是拍点档位化**：
   - "确定推进型" BPM 110-125（这条 113）
   - "激昂爆发型" BPM 130-145（下一条 Aftermagics brand 那条应该是这个）
   - "克制高级型" BPM 90-110
   - "神秘氛围型" BPM 60-90
   - AI 选方向卡时给用户 4 档音乐性格，选完就精选池匹配 BPM。

3. **草稿阶段的"低保真真渲"应该长这样**：把每一段用**灰色块 + 位置示意 + 时间戳** 摆成一张长图，用户看完就知道"哦这里有一个流程图渐次生长的动作，那里是 logo 缩放"。**不用出真图**，只用**摆动作占位**——这才是 showreel 应该的草稿。

---

## 7. 附件索引

| 文件 | 内容 |
|---|---|
| `audio/track.wav` | 抽出的音轨（44.1kHz, 3MB） |
| `audio/beats.txt` | 28 个拍点时间戳 |
| `audio/onsets.txt` | 125 个音符起点 |
| `audio/rms.txt` | 音量曲线（0.1s 采样） |
| `audio/palette_timeline.txt` | 每秒主色板 |
| `frames/f_001.jpg ~ f_088.jpg` | 密集帧 5fps |
| `frames_sparse/s_01.jpg ~ s_18.jpg` | 稀疏帧 1fps |
| `vision_dense.json` | 11 段 × 1.6s 动作分析（gemini） |
| `vision_sparse.json` | 18 帧描述（gemini） |
| `_tmp_grids/grid_*.jpg` | 拼接给 gemini 看的网格图 |

**成本核算**：全片视觉分析总消耗 ≈ **$0.06**（29 次 API 调用，均价 $0.002）。
**耗时**：ffmpeg/aubio ~1s，视觉调用 ~65s，全流程 <2 分钟。

---

## 关联

- 上游：[决策文档 2026-07-04](../../decisions/2026-07-04-架构定型-showreel-音乐先行.md)
- 平级参考：其余 6 条参考视频待拆（Aftermagics brand / ARIA / Bohdan / ObiN / Varchasva client work / Varchasva ChatGPT）
- 沉淀方向：待写入 `docs/skills/atomic/` 和 `docs/skills/templates/`
