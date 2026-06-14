# VibeReel · 进度表

> 实现进度跟踪（与 PRD 的「验收清单」分工：08-验收清单是目标，本表是已交付状态）。
> 更新日期：2026-06-13

## 图例
✅ 已交付并验证 ｜ 🟡 部分 / 待打磨 ｜ ⬜ 未开始

---

## 一、核心生成链路（公共骨架 + 四闸门）

| 能力 | 状态 | 说明 |
|---|---|---|
| 三类型 showreel / 教学 / 科普 + 四件套 | ✅ | 同一公共骨架，按类型装结构/playbook/风格候选/闸门/QA/配音 |
| 状态机 + 四闸门（方向①/讲稿/分镜②/分段③/终检④） | ✅ | `lib/orchestrator.ts`，每闸门可确认/打回/逐项改/返回 |
| 创意步真调 claude（方向/讲稿/分镜+选 visual 模板） | ✅ | 经独立 `lib/llm.ts`，POC 用本机 CLI |
| **真实渲染**：复用 vibemotion 引擎 Remotion 渲染 | ✅ | `lib/engine.ts`，每镜真出文字/图形/风格（见下「真实渲染后端」）|
| 草图缩略 + 拼合成片 | ✅ | `lib/render.ts` makeDraft + assemble 仍 ffmpeg |
| SSE 实时推全量快照 + 前端纯函数渲染 | ✅ | `/api/projects/:id/events` |
| 成片在线播放 / 全屏预览 / 下载 MP4 | ✅ | 中文名下载已修 |

## 二、批 A —— 前端交互（7 项，✅ 全部已验收）

| # | 项 | 状态 |
|---|---|---|
| 3 | 选画幅三选一并排卡片 | ✅ |
| 4 | 风格列全 11 个 + 每卡主图位 | ✅ |
| 6 | 每一步可「← 上一步」 | ✅ |
| 7 | 方向展示 look/palette/pacing + 逐项可改 | ✅ |
| 8 | 分镜横排表格 + 列项内联编辑 | ✅ |
| 9 | 渲染列表/全屏两视图 + 先 2 镜后续渲 | ✅ |
| 10 | 全片整页全屏预览 | ✅ |
| — | URL 输入失败 bug 修复（真抓正文） | ✅ |

## 三、批 B —— 后端喂料 + 前端接入（✅ 全部已交付并验证）

| # | 项 | 后端 | 前端 | 验证 |
|---|---|---|---|---|
| 2 | 多输入（链接/想法/代码包 zip 同投） | ✅ `inputs[]` + `/inputs` 解压摘要 + 两段式创建 | ✅ 向导 step2 多条 + 代码包上传 | curl + browse |
| 5 | 内容拆解成可引用料块 | ✅ `lib/decompose.ts`（6~12 块带 `@id`，回填 refs） | ✅ 详情页料块面板 + refs chips | curl（实测三路融合）|
| 1 | 素材库 + 角色/品牌库 | ✅ 项目 `/assets` + 全局 `/library/roles` | ✅ step5 真上传 + 角色选/建 | curl + browse |
| 4 | 自定义风格三法 | ✅ `/library/styles`（手填/文字/参考图）| ✅ step4 创建器 + 列出 | curl（三法全过）|
| — | 独立 Agent 层（CLI↔API 可切） | ✅ `lib/llm.ts`，`VR_LLM` 一行切 | — | curl |

**实测亮点**：Vercel链接 + 一句想法 + 代码包 zip 三路同投 → 拆出 12 料块（三路内容全被融合）→ 3 个概念正确回填 `refs=[@m1…]`。`tsc --noEmit` 0 错，无 console 报错。

## 四、基础设施

| 能力 | 状态 |
|---|---|
| Next.js 14 + TS strict（tsc 0 错） | ✅ |
| 密码登录 + cookie 鉴权（中间件全站保护） | ✅ |
| 项目列表 / 5 步向导 / 项目详情页 | ✅ |
| 数据落盘 `project.json` 单一真相源 + 旧数据迁移 | ✅ |
| 全局库落盘 `data/library/`（角色 + 自定义风格 + 文件） | ✅ |

## 五、真实渲染后端（✅ 已接 vibemotion 引擎，已验证）

| 项 | 状态 | 说明 |
|---|---|---|
| 引擎桥 `lib/engine.ts` | ✅ | VibeReel 状态 → 引擎 config/storyboard/STATE → `vibemotion render --chunk N` → 拷回 scenes/ |
| 一镜一段映射（s0i↔chunk i-1） | ✅ | 与引擎样例一致；assemble 仍 ffmpeg 拼 |
| 风格直通（11 内置 → 引擎 presets/styles） | ✅ | 自定义风格喂合并 palette/fonts |
| agent 选 visual 模板（title/stat/comparison/bullet/quote/cta/term-define…） | ✅ | 分镜阶段产出；缺省由 engine 启发式兜底 |
| 画幅→平台映射（9:16→douyin 等） | ✅ | aspectSpec()，分辨率 1080p |
| 开关 `VR_RENDER=engine\|stub` | ✅ | 默认 engine；stub 保留 ffmpeg 占位兜底 |
| **实测** | ✅ | editorial-saas（title/stat）、deep-space（comparison）真出画；整片 5 镜→合成 22s mp4 |

## 六、下一步（未开始）

| 项 | 状态 | 说明 |
|---|---|---|
| 切真模型 API | ⬜ | 用户给 key → `.env.local` 设 `VR_LLM=api` + `ANTHROPIC_API_KEY` 跑通生产链 |
| 配音 / 字幕（vo→TTS + srt 烧录） | ⬜ | vo 文案已生成；config.voiceover 暂 false，未接 edge-tts/minimax |
| still-kenburns 用上传图（素材推拉真渲） | ⬜ | 现 visual 走文字模板；上传图 → 引擎 product-capture/media 待接 |
| 渲染性能（每镜单独 spawn 一次 bundle） | 🟡 | 首镜打包后有缓存，后续约 6s/镜；可批量渲染优化 |
| 分镜表 renderer 下拉 ↔ visual 联动 | 🟡 | 当前 renderer 仅徽章，真实渲染以 visual 为准；可改成直接编辑 visual.type |
| @引用可视化编辑（料块拖入概念/分镜） | 🟡 | 现为只读展示 refs；交互式 @mention 待做 |

## 关联
- PRD 主文档：[docs/prd/00-主文档-PRD.md](prd/00-主文档-PRD.md)
- 验收清单（目标）：[docs/prd/08-验收清单-acceptance.md](prd/08-验收清单-acceptance.md)
