---
title: VibeReel 品味库（Skill Library）
version: 0.1
样本状态: 初始沉淀，基于 1 条参考视频
---

# VibeReel 品味库

> Agent 输出的知识底座。所有"什么是好的、什么是差的"判断都沉淀在这里。
>
> **每条 skill 必须写清楚**：从哪些参考视频归纳、样本量、是硬约束还是软偏好、反例是什么。

## 三层结构

```
docs/skills/
├── atomic/          # 原子 skill：一个维度一个 skill（对应 26 拆解维度）
├── templates/       # 模板 skill：一条视频 = 一个可复用配方
└── antipatterns/    # 反例 skill：什么是丑
```

## 加载策略

- **v1**：业务代码手动 include 到 prompt（`lib/agent.ts` 拼字符串）
- **v1.5**：切 pi Agent + skill 系统自动加载

## 样本状态标记

每条 skill 必须在 frontmatter 声明：

```yaml
样本量: N       # 从 N 条参考视频归纳
参考视频: [...]  # 具体来源
成熟度: 
  - draft     # 单样本，待验证
  - validated # 3+ 样本已验证
  - hard      # 硬约束，Agent 必须遵守
```

**未达到 validated 的 skill 不喂给 Agent 做硬约束**，只做 hint。

## 当前状态

| 分类 | 数量 | 备注 |
|---|---|---|
| atomic  | 7 | 全部 draft，样本量 1 |
| templates | 1 | draft |
| antipatterns | 1 | draft，5 条反例 |

拆完 7 条参考视频后预计：atomic 20+，templates 5-7，antipatterns 20+。
