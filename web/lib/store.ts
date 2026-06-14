import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  CreateProjectBody,
  InputItem,
  ProjectMeta,
  ProjectSummary,
} from "@/lib/types";
import { resolveFourpack } from "@/lib/fourpack";

// ---- 目录助手 ----

export function dataDir(): string {
  return path.join(process.cwd(), "data", "projects");
}
export function projDir(id: string): string {
  return path.join(dataDir(), id);
}
export function draftsDir(id: string): string {
  return path.join(projDir(id), "drafts");
}
export function scenesDir(id: string): string {
  return path.join(projDir(id), "scenes");
}
export function outputsDir(id: string): string {
  return path.join(projDir(id), "outputs");
}
// #1 项目级素材库文件目录；#2 代码包解压/摘要目录。
export function assetsDir(id: string): string {
  return path.join(projDir(id), "assets");
}
export function codeDir(id: string): string {
  return path.join(projDir(id), "code");
}

function indexPath(): string {
  return path.join(dataDir(), "index.json");
}
function projectJsonPath(id: string): string {
  return path.join(projDir(id), "project.json");
}
function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}

export function shortInputId(): string {
  return `in-${crypto.randomUUID().slice(0, 6)}`;
}

// ---- index.json ----

interface IndexFile {
  version: 2;
  items: ProjectSummary[];
}

function readIndex(): IndexFile {
  try {
    const raw = fs.readFileSync(indexPath(), "utf8");
    const parsed = JSON.parse(raw) as IndexFile;
    if (!parsed || !Array.isArray(parsed.items)) return { version: 2, items: [] };
    return parsed;
  } catch {
    return { version: 2, items: [] };
  }
}
function writeIndex(idx: IndexFile): void {
  ensureDir(dataDir());
  fs.writeFileSync(indexPath(), JSON.stringify({ ...idx, version: 2 }, null, 2));
}
function toSummary(p: ProjectMeta): ProjectSummary {
  return {
    id: p.projectId,
    title: p.title,
    videoType: p.videoType,
    aspect: p.aspect,
    stage: p.stage,
    createdAt: p.createdAt,
  };
}
function upsertIndex(p: ProjectMeta): void {
  const idx = readIndex();
  const summary = toSummary(p);
  const i = idx.items.findIndex((it) => it.id === p.projectId);
  if (i >= 0) idx.items[i] = summary;
  else idx.items.push(summary);
  writeIndex(idx);
}

// ---- 输入归一化（#2：支持新 inputs[] 与旧 input 单条） ----
function normalizeInputs(body: CreateProjectBody): InputItem[] {
  const out: InputItem[] = [];
  if (Array.isArray(body.inputs)) {
    for (const it of body.inputs) {
      if (!it || !it.value || !it.kind) continue;
      out.push({
        id: it.id || shortInputId(),
        kind: it.kind,
        value: String(it.value),
        label: it.label,
        meta: it.meta,
      });
    }
  }
  // 旧前端/旧 curl：单 input 兜底
  if (out.length === 0 && body.input && body.input.value) {
    out.push({
      id: shortInputId(),
      kind: body.input.kind,
      value: String(body.input.value),
    });
  }
  return out;
}

// ---- 项目读写 ----

function shortTitle(value: string): string {
  const t = value.trim().replace(/\s+/g, " ");
  if (t.length <= 24) return t || "未命名项目";
  return `${t.slice(0, 24)}…`;
}

export function createProject(body: CreateProjectBody): ProjectMeta {
  const projectId = crypto.randomUUID();
  const fp = resolveFourpack(body.videoType);
  const inputs = normalizeInputs(body);
  if (inputs.length === 0) {
    throw new Error("至少需要一条输入（链接 / 想法 / 代码包）");
  }

  const project: ProjectMeta = {
    version: 2,
    projectId,
    createdAt: new Date().toISOString(),
    title: shortTitle(inputs[0].value),
    videoType: body.videoType,
    fourPack: {
      structureId: fp.structureId,
      playbookRef: fp.playbookRef,
      styleId: body.styleId,
      gates: fp.gates,
      qaRules: fp.qaRules,
    },
    inputs,
    material: null,
    assets: [],
    roleRefs: Array.isArray(body.roleRefs) ? body.roleRefs.map(String) : [],
    aspect: body.aspect,
    vo: fp.vo,
    model: body.model || process.env.VR_MODEL || "sonnet",
    stage: "ingesting",
    concepts: [],
    chosenConcept: null,
    scenes: [],
    error: null,
    outputs: {},
    awaitingGate: null,
  };

  ensureDir(projDir(projectId));
  ensureDir(draftsDir(projectId));
  ensureDir(scenesDir(projectId));
  ensureDir(outputsDir(projectId));
  ensureDir(assetsDir(projectId));
  ensureDir(codeDir(projectId));
  saveProject(project);
  return project;
}

// 迁移旧 project.json：补齐批 B 新增字段，把旧单 input 归一成 inputs[]。
function migrate(raw: Record<string, unknown>): ProjectMeta {
  const p = raw as unknown as ProjectMeta;
  if (!Array.isArray(p.inputs)) {
    const old = (raw as { input?: { kind: "url" | "idea"; value: string } }).input;
    p.inputs = old
      ? [{ id: shortInputId(), kind: old.kind, value: old.value }]
      : [];
  }
  if (p.material === undefined) p.material = null;
  if (!Array.isArray(p.assets)) p.assets = [];
  if (!Array.isArray(p.roleRefs)) p.roleRefs = [];
  return p;
}

export function getProject(id: string): ProjectMeta | null {
  try {
    const raw = fs.readFileSync(projectJsonPath(id), "utf8");
    return migrate(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return null;
  }
}

export function saveProject(p: ProjectMeta): void {
  ensureDir(projDir(p.projectId));
  const out: ProjectMeta = { ...p, version: 2 };
  fs.writeFileSync(projectJsonPath(p.projectId), JSON.stringify(out, null, 2));
  upsertIndex(out);
}

export function listProjects(): ProjectSummary[] {
  const idx = readIndex();
  return [...idx.items].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
  );
}
