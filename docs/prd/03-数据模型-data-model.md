# VibeReel · 数据模型
> 子文档 · 隶属 [主文档](00-主文档-PRD.md)｜讲：project.json 单一真相源的 schema、文件布局、索引、写盘约束｜上位结构见主文档「架构总览」与 [01-架构-architecture](01-架构-architecture.md)。
> 维护提示：改本文不影响其他子文档；跨文档引用集中在文末「关联」。

## 单一真相源

项目**元数据驱动**：[data/projects/&lt;projectId&gt;/project.json](data/projects/) 为单一真相源（网页编排层）。引擎产物仍各自落盘，这里引用 / 镜像关键字段。它定义类型 / 四件套引用 / 每个分镜内容、后端、草稿、正片。前端刷新或 SSE 断线后均从 project.json 恢复状态，不丢进度（行为细节见 [02-流程与闸门-flows-and-gates](02-流程与闸门-flows-and-gates.md)）。

## project.json 接口

```typescript
// data/projects/<projectId>/project.json —— 单一真相源（网页编排层；引擎产物仍各自落盘，这里引用/镜像关键字段）
interface ProjectMeta {
  version: 2;
  projectId: string;                 // crypto.randomUUID()
  createdAt: string;                 // ISO
  title: string;
  videoType: 'showreel' | 'teaching' | 'popsci';   // 决定装哪套四件套
  fourPack: {                        // 四件套的解析结果（来自引擎预设 + 类型配置）
    structureId: string;             // 引擎 structures/<id>
    playbookRef: string;             // docs/types/<id>.md（注入 agent 系统提示）
    styleId: string;                 // 选中的风格卡
    gates: GateId[];                 // 该类型的闸门序列（含特有闸门）
    qaRules: string[];               // 该类型特有 QA 检查项 id
  };
  input: { kind: 'url' | 'idea'; value: string };
  aspect: '16:9' | '9:16' | '1:1';   // 默认 '16:9'；映射引擎 --platform（16:9→generic, 9:16→douyin, 1:1→generic 1080² 变体）
  assets: AssetItem[];               // 用户上传素材
  vo: boolean;                       // 配音（showreel 默认 false；teaching/popsci 默认 true）
  model: string;                     // 'claude-sonnet-4-6' 等（只记档，不存 key）；POC 映射 claude --model
  stage: Stage;
  gate: GateState | null;
  scenes: SceneMeta[];               // 分镜级元数据（含后端 / 草稿 / 正片 / 版本）
  error: string | null;
  outputs: { mp4?: string; srt?: string; audio?: string; zip?: string };
}
type GateId = 'concept' | 'script' | 'storyboard' | 'chunk' | 'final';
type Stage =
  | 'ingesting' | 'briefing' | 'concept'
  | 'scripting'                       // 科普/教学特有
  | 'storyboarding' | 'drafting'      // drafting = gpt-image 草稿生成中（B3 生成态）
  | 'storyboard'                      // → 闸门②
  | 'voicing' | 'rendering'           // → 闸门③（逐镜）
  | 'assembling' | 'qa' | 'done' | 'failed';
interface SceneMeta {
  index: number;
  role: string; durationSec: number; vo: string; onScreenText: string;
  renderer: 'remotion' | 'generative' | 'lottie' | 'still-kenburns';  // agent 选
  draftImage?: string;               // gpt-image 草稿相对路径
  mp4?: string;                      // 正片段相对路径
  status: 'pending'|'drafting'|'await_storyboard'|'rendering'|'await_review'|'approved'|'redo';
  revisions: Revision[];             // 分镜级版本记录（C2）
}
interface Revision { at: string; reason: string; by: 'agent'|'user'; snapshot: unknown; } // v1 仅留痕可回看，回滚排 v2
interface AssetItem { id: string; kind: 'logo'|'screenshot'|'image'|'clip'|'font'|'color'; path: string; note?: string; }
interface GateState { kind: GateId; payload: unknown; }
```

### 接口要点说明

- **ProjectMeta**：项目级元数据。`videoType` 决定装哪套四件套；`fourPack` 是四件套（structure + playbook + style + gates + qaRules）的解析结果；`aspect` 默认 `16:9` 并映射引擎 `--platform`；`model` 只记档，不存 key；`outputs` 记录终检产物相对路径。
- **GateId**：闸门标识序列（concept / script / storyboard / chunk / final），`fourPack.gates` 据此排该类型闸门序列。
- **Stage**：编排状态机；其中 `scripting` 为科普/教学特有，`drafting` 为 gpt-image 草稿生成中（B3 生成态），`storyboard` → 闸门②，`voicing`/`rendering` → 闸门③（逐镜）。
- **SceneMeta**：分镜级元数据，含后端选择（`renderer`）、草稿（`draftImage`）、正片（`mp4`）、状态机（`status`）与版本（`revisions`）。
- **Revision**：分镜级版本记录（C2），v1 仅留痕可回看，回滚排 v2。
- **AssetItem**：用户上传素材项（logo / screenshot / image / clip / font / color）。
- **GateState**：当前闸门快照。

闸门与各 stage / status 的触发-响应流程见 [02-流程与闸门-flows-and-gates](02-流程与闸门-flows-and-gates.md)。

## 项目目录布局与复用引擎产物

- 项目根 [data/projects/&lt;projectId&gt;/](data/projects/)：**复用** skill 既有产物（[brief](data/projects/) / [config](data/projects/) / [concepts](data/projects/) / [storyboard](data/projects/) / [script](data/projects/) / [chunks](data/projects/) / [07_final/](data/projects/)），**新增** [project.json](data/projects/) + [assets/](data/projects/) + [drafts/](data/projects/)。

引擎产物如何落盘、与 project.json 字段的引用/镜像关系见 [06-引擎边界-engine-integration](06-引擎边界-engine-integration.md)。

## 索引文件

- 索引 [data/projects/index.json](data/projects/index.json)：`{ projects: {id,title,videoType,createdAt,stage}[] }`，变更即更新。

## 写盘与 key 安全约束

- **Anthropic key 绝不写盘**；**平台 key（OpenAI / 生成式）只在服务端 env，绝不下发前端**。
- 所有写盘 JSON 带 `version: 2`，留升级位。

## 关联

- 上位：[主文档](00-主文档-PRD.md)
- [01-架构-architecture](01-架构-architecture.md) — 上位结构「架构总览」
- [02-流程与闸门-flows-and-gates](02-流程与闸门-flows-and-gates.md) — 闸门、stage / status 触发-响应流程
- [06-引擎边界-engine-integration](06-引擎边界-engine-integration.md) — 引擎产物落盘与字段引用/镜像
