# VibeReel · 架构

> 子文档 · 隶属 [主文档](00-主文档-PRD.md)｜讲：整个系统怎么搭——四层结构、数据流水线、成片合成、状态机、三套词汇对照、四件套注入点｜这是其余子文档的"地图"。
> 维护提示：改本文不影响其他子文档；但本文是大家的上位结构，改动前先确认不与各子文档的细节冲突。跨文档引用集中在文末「关联」。

本文回答一个问题：**这些零件怎么拼成一个产品。** 业务"为什么/做什么"看 [主文档](00-主文档-PRD.md)；每个零件"具体怎么写"看对应子文档。

---

## 1. 四层总览（先看懂这张图，其余都是它的展开）

整个系统分 **4 层**，上层只依赖下层：

```
┌─ 用户层（表面功能）── 用户看得见、点得到的 ───────────────────────┐
│  登录 · 设置(填 Anthropic key / 选模型) · 新建(选类型/输入/画幅/    │
│  选风格/传素材) · 4 道闸门(①选方向 ②确认分镜 ③审分段 ④终检) ·      │
│  实时进度 · 项目列表 · 下载成片                                      │
└───────────────────────────┬────────────────────────────────────────┘
            用户每个决策 ↓        ↑ 进度 / 草稿 / 成片
┌─ 技术层（我们写的代码）── 把用户决策变成视频的中枢 ─────────────────┐
│  · API：只鉴权 + 触发，绝不干重活                                    │
│  · 编排 orchestrator + queue：大脑，跑状态机、调度每一步、发进度     │
│  · 能力（各干一件事）：                                              │
│      agent(创意·写JSON) · fourpack(装四件套) · draft(gpt-image草稿) │
│      renderers(4 个正片后端) · tts(配音) · 合成(ffmpeg 拼接+混音+字幕)│
└───────────────────────────┬────────────────────────────────────────┘
              机械步下调 ↓        ↑ 段 / 产物
┌─ 引擎层（vibemotion，复用·禁止重写）── 真正出像素的老底子 ──────────┐
│  remotion 段渲染 · qa 体检 · export 导出                            │
│  （合成不在引擎，归技术层 ffmpeg，详见 §4）                  │
└───────────────────────────┬────────────────────────────────────────┘
                  全部读写 ↓        ↑ 状态
┌─ 数据层（文件系统，无数据库）── 单一真相源 ─────────────────────────┐
│  data/projects/<id>/ ： project.json(真相源) + 引擎产物             │
│                         + assets/(上传素材) + drafts/(草稿图)       │
└─────────────────────────────────────────────────────────────────────┘

```

| 层 | 是什么 | 一句话职责 | 细节去 |
|---|---|---|---|
| **用户层** | 表面功能（网页） | 展示 + 收集用户决策（选/批/重做/看草稿/下载）。Anthropic key 只存浏览器，不落盘。 | [04-视觉规范-design-system](04-视觉规范-design-system.md)、[02-流程与闸门-flows-and-gates](02-流程与闸门-flows-and-gates.md) |
| **技术层** | 我们写的全部代码 | 跑状态机、调度创意步/机械步、出草稿、分发渲染、配音、合成、发进度。 | 本文 §2–§6、[05-生成后端-renderers](05-生成后端-renderers.md)、[07-智能体-agent](07-智能体-agent.md) |
| **引擎层** | 外部 vibemotion CLI | 复用既有引擎出 remotion 段、体检、导出。**禁止重写/改逻辑。** | [06-引擎边界-engine-integration](06-引擎边界-engine-integration.md) |
| **数据层** | 文件系统 | 无数据库。`project.json` 是单一真相源，引擎产物各自落盘。 | [03-数据模型-data-model](03-数据模型-data-model.md) |

> 为什么这么分：**用户层**只管"好不好用"，**技术层**是唯一会变复杂的地方（也是本项目的工作量主体），**引擎层**是不许碰的上游资产，**数据层**是文件、可直接打开检查。四层各自能独立理解、独立修改。

---

## 2. 技术层内部（最关键的一层，拆开看）

技术层不是一坨，它内部有清晰分工：

- **API 层**（`app/api/**`）：只做鉴权 + 触发 + 读状态。**禁止**在 route 里直接跑渲染（会拖垮请求）。route 把活 `enqueue` 给编排层就立刻返回。
- **编排层**（`lib/orchestrator.ts` + `lib/queue.ts`）：**大脑**。拥有项目状态机，逐步推进；每步决定派给谁、写 `project.json`、发 SSE 进度。queue 是进程内队列，最大并发 2 个项目，每项目一个串行 worker。
- **能力层**（`lib/` 下各模块）：被编排层调用，各干一件事——见下表。

| 能力 | 模块 | 干什么 | 创意/机械 |
|---|---|---|---|
| 创意 agent | `agent.ts` | 写 brief / concept / script / storyboard，每镜选 renderer（**POC：spawn 本机 `claude` CLI**，见 [07](07-智能体-agent.md)） | 🟦 创意 |
| 装四件套 | `fourpack.ts` | `videoType` → 解析 structure/playbook/风格/闸门/QA | — 配置 |
| 出草稿 | `draft.ts` | 每镜调 gpt-image 出方向草稿 | ⬜ 机械 |
| 正片渲染 | `renderers/*` | 4 个后端，每镜出一段 mp4 | ⬜ 机械 |
| 配音 | `tts.ts` | edge-tts 合成 + 字幕时间戳 | ⬜ 机械 |
| 合成 | （ffmpeg，见 §4） | 拼接 + 混音 + 烧字幕 + 导出 | ⬜ 机械 |

**一条硬边界——创意步 vs 机械步，两者不混：**
- 🟦 **创意步 → agent**：要判断/创作的（brief/concept/script/storyboard、选 renderer）。结果不可复现、可能打回重做（**POC** 走本机 `claude` CLI、零 key；**v1** 走 SDK + BYO key）。
- ⬜ **机械步 → spawn**：确定性执行的（草稿/渲染/配音/合成/体检/导出）。要可复现、可重试、可降级。
- 混在一起会让重试与降级逻辑失控。详见 [07-智能体-agent](07-智能体-agent.md)、[05-生成后端-renderers](05-生成后端-renderers.md)。

---

## 3. 数据流水线（一条片子从无到有）

🟦 = 创意步（agent 写 JSON）｜⬜ = 机械步（CLI/后端/ffmpeg）｜🔶 = 闸门（停下等用户）。

```
新建项目
  ⬜ ingest 抓内容（URL→yt-dlp / idea→直接收）
  🟦 brief 拆解定调（出 brief + 解析统一 config：分辨率/fps/色板/字体）
  🟦 concept 出 2–3 方向 ───────────────────────🔶 闸门① 方向选择
  🟦 script 逐字讲稿/知识点  ⟵ 仅科普·教学 ──────🔶 闸门 script（showreel 跳过）
  🟦 storyboard 分镜（每镜含 role/时长/文案/renderer）
  ⬜ draft 每镜出 gpt-image 草稿 ────────────────🔶 闸门② 分镜确认（草稿+文字beat）
  ⬜ voicing 配音（vo=true 才有：edge-tts 合成 + 时间戳，先于渲染拿到时长）
  ⬜ rendering 逐镜按 renderer 多后端出正片段 ────🔶 闸门③ 分段确认（逐镜 👍/👎，流式）
  ⬜ assembling 成片合成（拼接+混音+字幕，见 §4）
  ⬜ qa 体检（含类型特有 QA 规则） ───────────────🔶 闸门④ 终检（下载，红项不阻断）
  done
```

闸门序列不是写死的：由四件套的 **gates 配置**决定（见 §6、[07-智能体-agent](07-智能体-agent.md)）。showreel 没有 script 闸门，科普/教学有。闸门内"触发→响应→异常"细节见 [02-流程与闸门-flows-and-gates](02-流程与闸门-flows-and-gates.md)。

---

## 4. 成片合成详解（你问的"拼合"到底怎么拼）

不同分镜用不同后端各出一段 mp4，**最后必须把它们拼成一条片子，再叠音频/配音/字幕**。这一步叫 `assemble`，它不是一个动作，是 4 个机械子步：

```
渲染完成：N 个分镜段（每段已是统一规格的 mp4）
  │
  [1] 拼接 concat ── ffmpeg 把 N 段按顺序连成一条无声视频轨
  │       ⚠️ 前提：N 段必须同规格（分辨率/fps/色板/字体/safeArea）
  │          concat 是"笨拼接"，不会帮你统一风格——统一是渲染时的债，见下
  │
  [2] 混音 mux ──── 把 voiceover（voicing 步已合成、带时间戳）+ 可选 BGM 混入
  │
  [3] 字幕 burn ── 用时间戳把字幕烧进画面，或单独导出 srt
  │
  [4] 导出 export ── mp4 + srt + 音频 + zip
```

**三条必须记住的事：**

1. **"看起来统一"是渲染时的活，不是合成时的活。** concat 只负责把段接起来，它无力修正风格差异。所以"统一 config"（分辨率/fps/safeArea/色板/字体）必须在**每个后端渲染时**就强制吃同一份——否则拼出来就是拼贴感（= 验收不通过）。见 [05-生成后端-renderers](05-生成后端-renderers.md) 统一 config 硬约束。
2. **配音要先于渲染合成。** 对配音类型（科普/教学），`voicing` 排在 `rendering` 之前，因为配音时长决定每镜渲多长；showreel 默认不配音，就是纯视觉拼接，无 [2] 的 voiceover。
3. **谁来拼（✅ 已定 2026-06-12：技术层自己用 ffmpeg 拼）。** remotion 段由引擎产出，generative/lottie/still-kenburns 段在引擎之外产出。决策：**[1]–[4] 全归技术层**，引擎只管出 remotion 段 + qa + export，**不让引擎吃外来段**（否则要改引擎、撞"禁止改引擎"护栏）；技术层统一拼接还能顺手强制统一 config。（曾备选"引擎合成"，因需改引擎已否决。）详见 [06-引擎边界-engine-integration](06-引擎边界-engine-integration.md) §2。

---

## 5. 状态机转移表（把 orchestrator 从黑盒变白盒）

编排层就是这张表的执行器。`Stage` = 当前在做的事，`Gate` = 卡住等用户。每个 Stage 完成后写 project.json + 发 SSE，再进下一个。

| Stage | 做什么 | 谁执行 | 产物 | 完成后 → |
|---|---|---|---|---|
| `ingesting` | 抓 URL / 收 idea | ⬜ 抓取 | ingest 内容 | `briefing` |
| `briefing` | 出 brief + 解析统一 config | 🟦 agent + fourpack | brief / config | `concept` |
| `concept` | 出 2–3 概念卡 | 🟦 agent | concepts | 开 Gate `concept`，选 → `scripting`/`storyboarding` |
| `scripting` | 逐字讲稿/知识点（科普·教学） | 🟦 agent | script | 开 Gate `script`，逐条确认 → `storyboarding` |
| `storyboarding` | 写分镜（每镜含 renderer） | 🟦 agent | storyboard | `drafting` |
| `drafting` | 每镜 gpt-image 草稿 | ⬜ draft | drafts/scene-N.png | `storyboard` |
| `storyboard` | （等待态）展示草稿+beat | — | — | 开 Gate `storyboard`；确认 → `voicing`/`rendering`；打回 → 回 `storyboarding` + 追加 revision |
| `voicing` | 配音 + 字幕时间戳（vo=true） | ⬜ tts | audio / srt | `rendering` |
| `rendering` | 逐镜按 renderer 出正片段 | ⬜ renderers | scenes/*.mp4 | 逐镜开 Gate `chunk`，末镜 👍 → `assembling` |
| `assembling` | 拼接+混音+字幕（§4） | ⬜ ffmpeg（技术层） | 07_final/ | `qa` |
| `qa` | 体检 + 类型特有 QA | ⬜ 引擎 | qa 报告 | 开 Gate `final` |
| `done` | 完成，可下载 | — | outputs.* | — |
| `failed` | 任一步致命失败 | — | error | 停在原步，进度不丢，可重试 |

**分段闸门（Gate `chunk`）是 scene 级的**，不在 Stage 上而在 `SceneMeta.status` 上流转：
`pending → drafting → await_storyboard → rendering → await_review → approved`（打回 = `redo` → 重渲该镜 → 追加 revision，见 [03-数据模型-data-model](03-数据模型-data-model.md)）。所以 `rendering` 阶段是"逐镜渲染 + 逐镜等审"交替，不是一次性渲完。

> ✅ **决策 A（并发，已定 2026-06-12）**：queue 是"每项目串行 worker"，**单项目内分镜串行渲染**。"逐分镜流式"= 渲完一个就原位显示一个（渐进揭示），**不等于并行计算**——所以串行也能流式，且单机 CPU 不打架、失败重试简单。项目内并行（上限 2–3 镜）排 v2。

---

## 6. 三套词汇对照 + 四件套注入点

### 6.1 三套词汇对照

系统里并存三种说法，这张表把它们对齐——读任一个都能反查另外两个。

| 阶段直觉 | `Stage`（项目级） | `GateId`（闸门） | 引擎/磁盘产物 |
|---|---|---|---|
| 抓内容 | `ingesting` | — | ingest |
| 定调 | `briefing` | — | brief / config |
| 选方向 | `concept` | `concept` | concepts |
| 定讲稿（科普/教学） | `scripting` | `script` | script |
| 排分镜 | `storyboarding` | — | storyboard |
| 出草稿 | `drafting` | — | drafts/ |
| 确认分镜 | `storyboard` | `storyboard` | storyboard（+drafts） |
| 配音 | `voicing` | — | audio / srt |
| 出正片段 | `rendering` | `chunk`（逐镜） | scenes/*.mp4（chunks） |
| 合成 | `assembling` | — | 07_final/ |
| 体检 | `qa` | `final` | qa 报告 |

类型定义见 [03-数据模型-data-model](03-数据模型-data-model.md)。

### 6.2 四件套注入点（"挂在骨架上"到底挂在哪一层）

"选类型 = 装上四件套，再走同一条公共骨架"——四片各自插进不同地方：

| 四件套 | 是什么 | 注入到哪 / 怎么生效 |
|---|---|---|
| **知识包**（playbook） | 什么算好的判断 | 技术层 agent：运行时读 `docs/types/<id>.md` 注入系统提示（不复制粘贴）。见 [07-智能体-agent](07-智能体-agent.md) |
| **风格包**（style） | 配色字体动效 + genai 基因词 | 汇成统一 `config`，喂给 draft（gpt-image 基因词）+ 全部 renderers（分辨率/色板/字体）。见 [05-生成后端-renderers](05-生成后端-renderers.md) |
| **闸门配置**（gates） | 比标准多/少/不同的闸门 | 技术层编排：`fourpack` 解析出 `gates[]`，决定状态机闸门序列（showreel 跳 `script`） |
| **QA 规则**（qaRules） | 体检特有项 | `qa` 阶段按 `qaRules[]` 追加该类型特有检查（如科普"主画面必须承载信息"） |

解析机制（`videoType → {structureId, playbookRef, styleCandidates, gates, qaRules}`）见 [07-智能体-agent](07-智能体-agent.md)。

---

## 7. 运行时约束（并发 / 事件 / 鉴权）

- **长任务队列**（`lib/queue.ts`）：进程内内存队列，**最大并发 2 个项目**，每项目一个**串行 worker**。API route 只 `enqueue` + 立即返回，后台 worker 跑。**禁止** route 直接跑渲染。第 3 个项目排队，UI 显示「排队中」。（项目内 scene **串行**渲染，见 §5 决策 A。）
- **进度（SSE）**：`GET /api/projects/:id/events`，事件载荷 `{ stage, sceneIndex?, pct, message }`。断线由 UI 自动重连按当前状态重绘；刷新从 `project.json` 恢复，不丢进度。
- **鉴权**：`APP_PASSWORD` 比对 → httpOnly 签名 cookie（7 天，用 `COOKIE_SECRET` 签）。middleware 拦截除 `/login` 外全部。无账号体系、不开放注册。
- **key 边界**：**POC** 创意步用本机 `claude` CLI、复用本地登录态、零 Anthropic key；**v1** Anthropic key = BYO，只在请求 header 透传、用完即弃、绝不落盘。平台 key（OpenAI / 生成式）始终只在服务端 env，绝不下发前端。详见 [03-数据模型-data-model](03-数据模型-data-model.md)。

---

## 8. 模块与文件结构

**用**：Next.js 14 App Router · TypeScript(strict) · Tailwind CSS 3 · 本机 `claude` CLI（POC 创意步）/ `@anthropic-ai/claude-agent-sdk`（v1） · `openai`(gpt-image) · pnpm · Node 20 LTS。
**不用**：Pages Router · shadcn/Antd/MUI · Redux/Zustand 等状态库 · 任何数据库/ORM。（要加先问。）

```
vibe-reel/
  app/                            # ← 用户层
    login/page.tsx
    page.tsx                      # 项目列表 + 新建入口
    settings/page.tsx             # POC：本地 claude CLI 状态 + 选模型档（v1：粘 BYO Anthropic key）
    new/page.tsx                  # 选类型 → 输入 → 画幅 → 风格 → 素材上传
    projects/[id]/page.tsx        # 流程页（公共骨架闸门 + 进度 + 下载）
    api/                          # ← 技术层 · API（只触发）
      login/route.ts
      projects/route.ts           # POST 建项目 / GET 列表
      projects/[id]/route.ts      # GET 状态
      projects/[id]/events/route.ts   # SSE
      projects/[id]/gate/route.ts # POST 闸门决策
      projects/[id]/assets/route.ts   # 素材上传
      projects/[id]/download/route.ts
  lib/                            # ← 技术层 · 编排 + 能力
    orchestrator.ts queue.ts store.ts   # 编排（大脑）
    agent.ts fourpack.ts                # 创意 + 四件套（见 07）
    draft.ts tts.ts                     # 草稿 + 配音
    renderers/ remotion.ts generative.ts lottie.ts still-kenburns.ts  # 4 后端（见 05）
    vibemotion.ts                       # ← 引擎层封装（见 06）
  components/                     # 用户层组件（Tailwind 手写）
  data/projects/                  # ← 数据层（git 忽略）
  engine/                         # 上云时 vendor 的引擎
  scripts/doctor.mjs
  .env.local
```

**env 清单**：`APP_PASSWORD` / `COOKIE_SECRET` / `VIBEMOTION_BIN` / `CLAUDE_BIN`（POC，默认 `claude`） / `OPENAI_API_KEY` / `GENERATIVE_API_KEY`（+ 选用 base url）。

---

## 关联
- 上位：[主文档](00-主文档-PRD.md)
- 流程细节：[02-流程与闸门-flows-and-gates](02-流程与闸门-flows-and-gates.md)
- 数据结构：[03-数据模型-data-model](03-数据模型-data-model.md)
- 渲染后端 + 统一 config：[05-生成后端-renderers](05-生成后端-renderers.md)
- 引擎边界 + 合成归属：[06-引擎边界-engine-integration](06-引擎边界-engine-integration.md)
- 创意与四件套：[07-智能体-agent](07-智能体-agent.md)
