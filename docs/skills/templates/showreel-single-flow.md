---
title: 单流程图型产品 showreel
type: 模板 skill
样本量: 1
参考视频:
  - aftermagics-datalyr
成熟度: draft
适用场景: B2B SaaS / 独立开发者产品，有明确 "用户从 X 到 Y" 的核心流程
---

# 模板：单流程图型产品 showreel

## 一句话

**"一个流程图 + 一个 hero moment + 一个品牌页" = 完整 15-20s 产品宣传短片。**

## 何时用这个模板

用户输入符合以下**任意 2 条**时推荐此模板：
- 产品有清晰的用户流程（signup → onboard → aha）
- 产品是 B2B SaaS / 开发者工具 / 数据平台类
- 用户没有大量视觉素材，只有产品截图和 logo
- 用户想突出"简单/快速/顺畅"感（而不是"炫技/丰富"）

## 完整配方

### 音乐

| 项 | 值 |
|---|---|
| BPM | 110-125（稳态推进） |
| 时长 | 15-20s |
| 结构 | intro (0-2s 铺垫) → build (2-11s 稳定推进) → drop (11-13s 短促) → outro (13-末 收束) |
| 情绪标签 | 确定 / 推进 / 克制 |
| 有无 drop | 有（弱 drop，音量提升 3-5dB） |
| 有无人声 | 无 |

### 色板

按 [color-92-6-2](../atomic/color-92-6-2.md) 规则：
- 主色 A：品牌 accent（用户上传的品牌色）
- 底色 B：米白 / 淡灰 / 淡色（比主色明度高 40%+）
- 点缀 C：与主色对比的第三色（互补色或邻近色）
- 反转 D：黑或白（drop 时刻用）

### 分镜结构（7 段，可根据音乐时长 ±1 段）

| # | 段 | 时长占比 | 时长(15s片) | 内容 | 动效 | 密度 |
|---|---|---|---|---|---|---|
| 1 | **Hook 空拍** | 10-15% | 2.0s | 米白背景微渐变，无文字 | fade (背景) | 极简 |
| 2 | **Promise 承诺** | 8-10% | 1.5s | 量化承诺大字，居中 | cross-fade + color-change 强调关键字 | 极简 |
| 3-6 | **Flow Build 流程生长** | 45-55% | 8.0s | 一个流程图，元素**渐次累加**（每 1.6-2s 加一个节点），**不切镜** | fade-in + slide + mask-reveal | 极简 → 中 |
| 7 | **Drop 视觉高潮** | 8-10% | 1.5s | **黑幕 + 完成的图形收缩成 logo**（唯一"密度骤降 + 色反转 + 尺度变化"） | scale + mask + fade | 极简 |
| 8 | **Brand Logo** | 8-10% | 1.5s | Logo + 品牌名 fade-in | fade | 极简 |
| 9 | **Slogan** | 8-10% | 1.5s | Slogan typewriter 逐词 | typewriter | 极简 |
| 10 | **CTA 静止** | 8-10% | 1.5s（末 1s 静止） | URL / 按钮，**最后 1s 无动画** | typewriter → 静止 | 极简 |

（**注**：段 3-6 是"一个逻辑长镜里的 4 个阶段"，不是 4 个硬切镜，视频里表现为**同一个流程图渐次生长**。）

### 动效基因

按 [motion-scarcity](../atomic/motion-scarcity.md) 规则：
```json
{
  "primary": ["fade", "slide", "typewriter"],
  "secondary": ["cross-fade", "color-change", "blur"],
  "scarce": ["mask-reveal", "scale"]
}
```

### 视觉母题

按 [broken-pattern-highlight](../atomic/broken-pattern-highlight.md) 规则：
- **母题**：圆角矩形卡片（所有流程节点都是这个形状）
- **打破**：drop 镜里矩形 → 圆形 logo（形状换 + 尺度变化）

### 收束

按 [brand-outro-3step](../atomic/brand-outro-3step.md) 规则：段 8-9-10 严格三段式。

### 节奏

按 [beat-vs-onset](../atomic/beat-vs-onset.md) 规则：
- 段之间的转场必须踩 beat
- 流程图内每个节点入场踩 onset（不需要踩 beat，允许更密）
- Drop 镜 startBeat 必须踩全片音量峰值时刻

## Agent 使用（v1 prompt include）

当 Agent 判断用户输入符合此模板时，`generateStoryboard` 应该：
1. 直接产出 7-10 段结构（按上面段表）
2. 不再自由发挥"要几个镜"
3. 每段的 `visualMotif` 字段填 "rounded-card"
4. `dropShot` 字段标记在段 7

## 反例（用了这个模板但做错的情况）

- ❌ 流程节点用不同形状 → 母题被破坏，drop 无效
- ❌ 段 3-6 用硬切分成 4 个镜 → 失去"生长感"，变成 4 个割裂镜
- ❌ Drop 镜时长 > 2s → drop 感被稀释
- ❌ 段 10 末尾没有静止 → 用户记不住 URL
- ❌ 主动效超出 3 件套 → 视觉分散

## 待验证 / 待补

- [ ] 时长 15-20s 是否是最佳？（等更多样本）
- [ ] 段数 7 是否稳定？还是可以压缩到 5？
- [ ] 是否有"竖版 9:16"的适配版本？（TikTok / 抖音）
- [ ] 用户产品没有明确流程时怎么办？（需要另一个模板，见待写的 showreel-feature-grid）

## 关联

- 原子 skill：color-92-6-2, motion-scarcity, hook-quantified-promise, density-arc, broken-pattern-highlight, brand-outro-3step, beat-vs-onset
- 源视频拆解：[aftermagics-datalyr](../../references/aftermagics-datalyr/README.md)
