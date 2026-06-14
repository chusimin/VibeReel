# VibeReel · 创意 Agent 与四件套加载
> 子文档 · 隶属 [主文档](00-主文档-PRD.md)｜讲：agent 系统提示注入、工具集、fourpack 四件套解析、各类型风格卡候选｜上位结构见主文档「架构总览」与 [01-架构-architecture](01-架构-architecture.md)。
> 维护提示：改本文不影响其他子文档；跨文档引用集中在文末「关联」。

## 运行方式：POC = 本机 claude CLI（当前）｜v1 = Agent SDK

创意 agent 有两种落地，**POC 阶段用前者**：

| 阶段 | 怎么跑 | 鉴权 | key |
|---|---|---|---|
| **POC（当前）** | 后端子进程 spawn 本机 **`claude` CLI** | 复用本地 Claude Code 登录态 | **零 key** |
| **v1 生产** | `@anthropic-ai/claude-agent-sdk`（headless） | BYO Anthropic key（透传、不落盘） | 用户自带 |

**POC 调用形态**（`lib/agent.ts` 复用 [lib/vibemotion.ts](../../lib/vibemotion.ts) 同款 spawn 封装）：

```bash
claude -p "<step 提示 + 已抓取内容>" \
  --output-format json \                 # 返回单条 JSON，助手输出在 .result
  --model <claude-haiku-4-5 | claude-sonnet-4-6 | claude-opus-4-8> \  # 映射模型档
  --append-system-prompt "<PLAYBOOK + docs/types/<type>.md 四件套知识包>" \
  --tools ""                             # 创意步只要文本/JSON，禁用工具更快更稳
```

- **二进制**：env `CLAUDE_BIN`（默认 `claude`；本机实测 `/opt/homebrew/bin/claude`，v2.0.37）。
- **结构化输出**：每个 step（writeBrief / writeConcepts / writeScript / writeStoryboard）的提示要求 claude **只输出该步 JSON**；从 `--output-format json` 的 `.result` 取出再 `JSON.parse`，校验失败重试（最多 N 次）。
- **四件套注入**：知识包经 `--append-system-prompt` 注入（等价 SDK 的系统提示注入），仍是**运行时读取源文件、不复制粘贴**。
- **失败处理**：非零退出 → 同机械步，红 toast + stderr 末 20 行 +「重试该步」（见 [02-流程与闸门-flows-and-gates](02-流程与闸门-flows-and-gates.md)）；可选 `--fallback-model` 兜底过载。
- **语义不变**：POC 下创意步虽走 spawn，语义仍是**创意步**（不可复现 / 可打回重做），与机械后端区分（见 [01-架构-architecture](01-架构-architecture.md) §4）。

> 切到 v1 SDK 时，本文「工具集」与「系统提示注入」原样适用；只是把 spawn CLI 换成 SDK 调用、把"零 key"换成"BYO key 透传"。其余流程/数据/闸门不变。

## 四件套加载（fourpack）

四件套加载逻辑落在 [lib/fourpack.ts](../../lib/fourpack.ts)。

- **输入**：`videoType`（`showreel` / `teaching` / `popsci`）。
- **输出**：解析出 `{structureId, playbookRef, styleCandidates, gates, qaRules}`。
  - `structureId`：引擎 structures/`<id>`。
  - `playbookRef`：知识包，指向 docs/types/`<id>`.md（注入 agent 系统提示）。
  - `styleCandidates`：该类型的候选风格卡（见下「各类型风格卡候选」）。
  - `gates`：该类型的闸门序列（含特有闸门）。
  - `qaRules`：该类型特有的 QA 检查项 id。
- **gates 决定该类型闸门序列**：
  - `showreel` → **跳过 script**（无讲稿/知识点闸门）。
  - `popsci` / `teaching` → **含 script**（在方向之后插入讲稿/知识点确认闸门）。

四件套的解析结果来自引擎预设 + 类型配置，会写入 `project.json` 的 `fourPack` 字段（`structureId` / `playbookRef` / `styleId` / `gates` / `qaRules`）。

## 创意 Agent（lib/agent.ts）

创意 agent 实现落在 [lib/agent.ts](../../lib/agent.ts)。

### 系统提示注入（运行时读取，不复制粘贴）

系统提示在**运行时读取**以下三份来源注入，**不复制粘贴**：

- skill 的 PLAYBOOK.md；
- 该类型的知识包 docs/types/`<id>`.md；
- showreel 专用的 references/showreel-director-prompt.md（showreel 类型）。

这是硬约束：提示内容始终从源文件运行时读取注入，避免内容随源文件演进而漂移。

### 工具集

agent 可用工具：

- `writeBrief` —— 落 JSON。
- `writeConcepts` —— 落 JSON。
- `writeScript` —— 落 JSON。
- `writeStoryboard` —— 落 JSON，**storyboard 含每镜 `renderer` 选择**（remotion / generative / lottie / still-kenburns）。
- `readIngest` —— 读取已抓取的输入内容。

### 创意步 / 机械步分界（二者不混）

- **创意步用 agent**：写 brief、concepts、script、storyboard（含每镜 renderer 选择）等需要判断与生成的步骤，交给 agent。
- **机械步 spawn CLI / 后端**：渲染、合成等确定性步骤，由子进程调用 CLI / 后端执行。
- **二者不混（按语义，不按机制）**：区分点是"创意/判断" vs "确定性执行"，不是"是否 spawn"。POC 下创意步也用 spawn（本机 `claude` CLI，见上「运行方式」），但仍属创意步；机械步绝不混入 agent 推理。

## 各类型风格卡候选（v1）

引擎共 **11 个风格包**，按视频类型给出候选风格卡：

| 视频类型 | 候选风格卡 |
|---|---|
| showreel | `editorial-saas` / `apple-keynote-light` |
| 科普（popsci） | `deep-space-diagram` / `minimal-ink` |
| 教学（teaching） | `apple-keynote-light` / `bento` |

用户选中的风格卡 id 记入 `project.json` 的 `fourPack.styleId`；风格包同时携带配色字体动效 + genai 提示词基因，供草稿与各后端取用。

## 关联

- 上位：[主文档](00-主文档-PRD.md)
- [01-架构-architecture](01-架构-architecture.md)：四件套注入点总图（四件套在公共骨架上的挂载与注入位置）。
- [04-视觉规范-design-system](04-视觉规范-design-system.md)：风格视觉（风格卡对应的配色 / 字体 / 动效观感）。
- [06-引擎边界-engine-integration](06-引擎边界-engine-integration.md)：structures / playbook 均来自引擎（四件套最大化复用引擎已有资产）。
