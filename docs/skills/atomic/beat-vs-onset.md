---
title: Beat vs Onset —— 主动作踩拍，细节踩音
维度: 音乐 + 节奏 (元素维度 #1 & #2)
样本量: 1
参考视频:
  - aftermagics-datalyr
成熟度: draft
适用类型: showreel
---

# Beat vs Onset —— 主动作踩拍，细节动效踩音

## 概念区分

- **Beat（主拍）**：音乐的主节拍，通常 60-140 BPM，间隔 0.4-1.0s
- **Onset（音符起点）**：所有可识别的音效起点（鼓点、hi-hat、whoosh、tick...），密度是 beats 的 3-5×

**参考数据**（Aftermagics × Datalyr）：
- BPM 113 → beats 1.6 个/秒
- onsets 7 个/秒
- 比值 **4.4**

## 规则

一条 showreel 的动画节奏应该**两级**：

**级别 1 · 主动作 踩 beats**（大动作）
- 每一镜的入场时刻（第一个元素出现）踩在 beat 上
- 段与段之间的转场踩在 beat 上（**特别是"drop"必须踩强拍**）
- 每一镜的 durationSec 是"beat 间隔的整数倍"（保证下一镜也能踩上拍）

**级别 2 · 细节动效 踩 onsets**（小动作）
- 单镜内的次要元素入场（"次要"= 不是主标题/主图形）
- 微动画（图标闪烁、下划线出现、点缀元素）
- 文字 typewriter 每个字符可以踩 onset

## 为什么

- **只踩 beat 会显得"啪"，太刻板**（像老年迪斯科）
- **完全不踩点会显得"业余"**（这是 VibeReel 现在最大的问题）
- **两级踩点** = 主结构稳，细节生动，**像"呼吸有节律的活体"**

## Agent 使用指令

> 音乐选定后（闸门 ②），系统必须提取：
> - `beats[]`：主拍时间戳数组
> - `onsets[]`：细拍时间戳数组
> - `bpm`：中位 BPM
> - `energyEnvelope[]`：RMS 音量曲线
>
> 生成分镜时（闸门 ③），每一镜必须声明：
> ```json
> {
>   "startBeat": 4,        // 起于第 4 拍
>   "durationBeats": 3,    // 持续 3 拍（durationSec = 3 * beatInterval）
>   "onsetHits": [5, 7]    // 内部 2 个细节动作分别在 onset[5] 和 onset[7]
> }
> ```
>
> 硬约束：
> - **末镜 endBeat 必须 = 最后一个 beat**（不能超出音乐结尾）
> - **drop 镜的 startBeat 必须是"强拍"**（beats 数组中间隔较大者或音量陡升处）

## 反例

- ❌ 分镜时长凭空定（durationSec = 4，与音乐无关） → 拼不上拍
- ❌ 所有动效都踩 beat → 太机械，无细节
- ❌ 完全踩 onset 不踩 beat → 满屏乱动，无主结构

## 待验证

- [ ] 不同 BPM 视频的 beat/onset 比值是否稳定在 3-5？
- [ ] 是否需要引入"downbeat"（每 4 拍中的第 1 拍）作为更强的锚点？
