# VibeReel · 生成后端（草稿 + 多后端渲染）
> 子文档 · 隶属 [主文档](00-主文档-PRD.md)｜讲：gpt-image 草稿后端 + 4 个正片渲染后端适配器 + 统一 config 硬约束｜上位结构见主文档「架构总览」与 [01-架构-architecture](01-架构-architecture.md)。
> 维护提示：改本文不影响其他子文档；跨文档引用集中在文末「关联」。

---

## 草稿后端（gpt-image）

草稿模块见 [lib/draft.ts](../../lib/draft.ts)。

- 每镜调 **OpenAI gpt-image**，提示 = beat 画面描述 + 风格包的 genai 基因词 + 画幅。
- 输出存 [drafts/scene-N.png](../../data/projects)（即项目根下的 `drafts/scene-N.png`）。
- 草稿**仅供方向确认，非正片精确长相**（UI 须明示，角标「草稿·方向参考」）。
- 草稿失败 → 该镜降级为纯文字 beat，闸门仍可继续，不整链崩。

平台 key（OpenAI）只在服务端 env（`OPENAI_API_KEY`），绝不下发前端。

---

## 正片后端总览（render 统一接口）

渲染分发模块见 [lib/renderers/](../../lib/renderers)。

- 统一接口：`render(scene, ctx) → mp4段`。
- 由 agent 在分镜阶段给每个 scene 选 `renderer`（落在 storyboard 的每镜 `renderer` 字段，详见 [03-数据模型-data-model](03-数据模型-data-model.md) 的 `SceneMeta.renderer`）；render 阶段按 `renderer` 分发到对应适配器。
- v1 接 4 个适配器：[remotion.ts](../../lib/renderers/remotion.ts) / [generative.ts](../../lib/renderers/generative.ts) / [lottie.ts](../../lib/renderers/lottie.ts) / [still-kenburns.ts](../../lib/renderers/still-kenburns.ts)。
- 4 个后端各自出 mp4 段，统一合成（合成归属见 [06-引擎边界-engine-integration](06-引擎边界-engine-integration.md)）。
- **创意步用 agent，机械步 spawn CLI / 后端，二者不混。**

各适配器实现说明见下。

### remotion

适配器见 [remotion.ts](../../lib/renderers/remotion.ts)。

- 默认后端，用于**信息镜**：文字 / 图表 / 数据 / UI。
- 实现：子进程调用

  ```
  node $VIBEMOTION_BIN render --chunk N
  ```

- ⚠️ **必须显式传引擎平台**：`--platform` 由 `aspect` 映射。引擎默认已是 generic / 16:9，**9:16 必须显式 `douyin`，不能漏**（漏了会因引擎默认而出成 16:9）。映射细则见下文「aspect→platform 映射注意」。

### generative

适配器见 [generative.ts](../../lib/renderers/generative.ts)。

- 用于**氛围镜 / 写实 b-roll**。
- 实现：用平台 key 调可灵 / Runway 类文生 / 图生视频（草稿图可作参考图）。
- **不可复现**：固定 seed 留痕。
- 平台 key（`GENERATIVE_API_KEY`）只在服务端 env，绝不下发前端。
- 失败 → 该镜可重试或回退（回退 remotion 占位或提示换后端），不整链崩。

### lottie

适配器见 [lottie.ts](../../lib/renderers/lottie.ts)。

- 用于**动态图标 / 矢量插画**。
- 实现：取 lottiefiles / lordicon 的 JSON，用 `@remotion/lottie` 包成段（**仍走 remotion 渲染壳**）。

### still-kenburns

适配器见 [still-kenburns.ts](../../lib/renderers/still-kenburns.ts)。

- 用于**上传素材图 + 缓慢推拉**。
- 实现：上传素材图 + ffmpeg `zoompan` 推拉。
- 取用项目素材库里的上传图（验收要求：素材上传后，至少一个 `still-kenburns` 镜用到上传图）。

---

## 统一 config 硬约束

**统一性约束（硬）**：所有后端必须吃**同一份 config**——

- 分辨率
- fps
- safeArea
- 色板
- 字体

所有后端据此输出**同规格段**，否则 assemble 会拼出**拼贴感**。

> 这是 v1 的硬约束（见主文档 G 模块）：跨后端 / 跨类型**视觉统一是硬约束**，拼贴感 = 验收不通过。任一后端无视统一 `config` 即违规。

---

## aspect→platform 映射注意

`aspect` 字段（默认 `16:9`）映射引擎 `--platform`：

| aspect | --platform | 说明 |
|---|---|---|
| `16:9` | `generic` | 引擎默认即此 |
| `9:16` | `douyin` | **必须显式传**，漏则出成 16:9 |
| `1:1` | `generic`（1080² 变体） | — |

- ⚠️ **9:16 必须显式 `douyin`，不能漏**：引擎默认已是 generic / 16:9，依赖默认会把竖版渲成横版。
- 验收口径：画幅选 9:16 时成片实际须为 1080×1920（验证引擎显式收到 `--platform douyin`，没有因引擎默认而出成 16:9）。
- remotion 适配器是直接吃 `--platform` 的后端，映射在它这里最关键；其余后端按同一份统一 config 的分辨率出同规格段。

---

## 关联

- 上位：[主文档](00-主文档-PRD.md)
- [01-架构-architecture](01-架构-architecture.md)：渲染分发在分层中的位置（架构总览）。
- [03-数据模型-data-model](03-数据模型-data-model.md)：`SceneMeta.renderer`（agent 在分镜阶段写入的后端选择）、`aspect` 字段与 `--platform` 映射。
- [06-引擎边界-engine-integration](06-引擎边界-engine-integration.md)：remotion 走引擎、各后端 mp4 段的统一合成归属。
