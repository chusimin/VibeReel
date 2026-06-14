# VibeReel · 引擎边界（vibemotion 集成）

> 子文档 · 隶属 [主文档](00-主文档-PRD.md)｜讲：怎么复用既有 vibemotion CLI、VibeReel 与引擎各拥有哪些步、合成归属、引擎层缺口、系统依赖｜上位结构见主文档「架构总览」与 [01-架构-architecture](01-架构-architecture.md)。
> 维护提示：改本文不影响其他子文档；跨文档引用集中在文末「关联」。

**一句话定位**：VibeReel 是 vibemotion 引擎的**编排壳 + 多后端分发层**。引擎是核心资产，本项目只负责"什么时候、用什么后端、出哪一段、怎么拼"，**绝不重写、绝不绕过引擎自己实现视频生成**。

---

## 1. 引擎封装（lib/vibemotion.ts）

统一封装对引擎 CLI 的子进程调用：

- 职责：`spawn` 引擎进程 → 解析 stdout JSON → 检查退出码 → 捕获 stderr。
- 二进制定位：env `VIBEMOTION_BIN`，默认 `~/.claude/skills/vibe-motion-video/bin/vibemotion.mjs`；上云时把引擎 vendor 到仓库内 `engine/`。
- 失败约定：CLI / 后端非零退出 → 抛出错误，编排层转成红 toast + **stderr 末 20 行** +「重试该步」（异常路径见 [02-流程与闸门-flows-and-gates](02-流程与闸门-flows-and-gates.md)）。
- 所有机械步（合成、体检、导出、remotion 段渲染）都经此封装，不在别处散落裸 `spawn`。

---

## 2. 引擎边界契约：谁拥有哪一步

这是本项目最容易返工的地方，必须先把"哪边干"钉清楚。下表是**意图划分**——VibeReel 负责编排与非 remotion 后端，引擎负责其传统强项（remotion 渲染、合成、体检、导出）。

| 流水线步骤 | 拥有方 | 说明 |
|---|---|---|
| ingest 抓内容 | 引擎（复用其 ingest）/ VibeReel 触发 | URL→yt-dlp、idea 直收 |
| brief / concept / script / storyboard | **VibeReel**（agent） | 创意步，agent 落 JSON，复用引擎的 structures/playbook 资产 |
| gpt-image 草稿 | **VibeReel**（draft.ts） | 引擎无此能力，新增 |
| remotion 正片段 | 引擎 | `vibemotion render --chunk N`，VibeReel 只调度 |
| generative / lottie / still-kenburns 段 | **VibeReel**（renderers/） | 引擎无这些后端，新增；见 [05-生成后端-renderers](05-生成后端-renderers.md) |
| 配音 / 字幕 | **VibeReel**（tts.ts, edge-tts） | 合成时混入，见 [02-流程与闸门-flows-and-gates](02-流程与闸门-flows-and-gates.md) |
| **assemble 合成** | **VibeReel（ffmpeg）** | 拼接+混音+烧字幕+导出，引擎不碰外来段；见下方决策 B |
| qa 体检 | 引擎 | 复用，叠加类型特有 QA 规则（qaRules） |
| export 导出 | 引擎 | mp4 / srt / 音频 / zip |

> ✅ **决策 B（合成归属，已定 2026-06-12）：方案 B —— VibeReel 自己用 ffmpeg 合成。**
> v1 的段来自 **4 个异构后端**：remotion 段由引擎产出，generative / lottie / still-kenburns 段由 VibeReel 在引擎之外产出。`assemble`（拼接 + 混音 + 烧字幕 + 导出）**全归 VibeReel 技术层**，引擎只出 remotion 段 + qa + export，**不让引擎吃外来段**（否则需改引擎、撞护栏）。"统一 config 硬约束"（分辨率/fps/safeArea/色板/字体）由 VibeReel 在**渲染时**强制——见 [05-生成后端-renderers](05-生成后端-renderers.md)，否则拼出拼贴感 = 验收不通过。
> （曾备选"方案 A：引擎合成"，因需改引擎已否决。）

---

## 3. 多后端如何保持"同规格"（与合成强相关）

合成能拼得不露缝，前提是 4 个后端输出**同规格段**。约束本身在 [05-生成后端-renderers](05-生成后端-renderers.md)（统一 config 硬约束），这里只强调它与引擎边界的关系：

- 无论合成归谁，**所有段必须吃同一份 `config`**：分辨率 / fps / safeArea / 色板 / 字体。
- remotion 段走引擎，引擎的平台参数必须由 `aspect` **显式**传入：`--platform`（16:9→generic、9:16→**douyin**、1:1→generic 1080² 变体）。⚠️ 引擎默认已是 generic/16:9，**9:16 必须显式 `douyin`，漏传会出成 16:9**（这是 [08-验收清单-acceptance](08-验收清单-acceptance.md) 的一条验收项）。

---

## 4. 引擎层前置依赖（不在本仓库，属 vibe-motion-video）

四件套**最大化复用引擎已有资产**，但**教学类型**在引擎侧有缺口，VibeReel 接入前这些必须先就位：

- `docs/types/teaching.md`——教学知识包（playbook）。
- `presets/audio/teaching.json`——教学音频预设。
- （必要时）`structures/teaching.json`——教学结构；v1 可先复用 `talking-blogger` 调整。

> ❌ **这些缺口去 `vibe-motion-video` 仓库补，不在本仓库改引擎。** showreel、知识科普的四件套（structure `knowledge-explainer`/`knowledge-popsci`、深空图解风格等）现成，直接接。

---

## 5. 系统依赖与自检

引擎与后端依赖一组系统级工具，缺一不可：

- `ffmpeg`（合成 / still-kenburns 的 zoompan / 转码）
- `yt-dlp`（URL / 视频抓取）
- `edge-tts`（pip 安装；配音合成，兜底策略见主文档护栏与 [02-流程与闸门-flows-and-gates](02-流程与闸门-flows-and-gates.md)）
- Playwright Chromium（引擎渲染所需）
- **`claude` CLI（POC 创意步）**：env `CLAUDE_BIN`（默认 `claude`），需本机已登录 Claude Code，`claude -p … --output-format json` 可用。见 [07-智能体-agent](07-智能体-agent.md) §运行方式。

**自检**：`scripts/doctor.mjs` 内含 `vibemotion doctor` + `claude --version`（POC）检测，启动前跑一遍确认依赖齐全。

---

## 6. 护栏（与本文强相关）

- ❌ 不重写 / 不绕过引擎自己实现视频生成。
- ❌ 不在本仓库改引擎逻辑；四件套缺口去引擎仓库补。
- ❌ 不让任一后端无视统一 `config`；跨后端 / 跨类型视觉统一是硬约束。
- ❌ 遇**新的**边界模糊（如新增后端的归属、新依赖、新闸门）→ 停下问作者，不脑补。（assemble / 配音归属已定，见 §2。）

完整护栏与决策时机表见 [主文档](00-主文档-PRD.md)。

---

## 关联
- 上位：[主文档](00-主文档-PRD.md)
- 架构总图：[01-架构-architecture](01-架构-architecture.md)
- 渲染后端与统一 config：[05-生成后端-renderers](05-生成后端-renderers.md)
- 创意与四件套资产：[07-智能体-agent](07-智能体-agent.md)
- 验收（含 9:16→douyin）：[08-验收清单-acceptance](08-验收清单-acceptance.md)
