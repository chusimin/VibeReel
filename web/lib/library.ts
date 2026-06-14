// ============================================================
// 全局库（跨项目复用）—— #1 角色/品牌库 + #4 自定义风格。
// 落盘在 data/library/ 下，与单个项目目录解耦：
//   data/library/roles.json      角色/品牌条目
//   data/library/styles.json     自定义风格包
//   data/library/files/<id>.<ext> 角色/风格用到的图（参考图、主图）
// POC：纯文件，无并发锁（单机够用）。
// ============================================================

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { RoleEntry } from "@/lib/types";
import type { StylePack } from "@/lib/styles";
import { styleById } from "@/lib/styles";

export function libraryDir(): string {
  return path.join(process.cwd(), "data", "library");
}
export function libraryFilesDir(): string {
  return path.join(libraryDir(), "files");
}
function rolesPath(): string {
  return path.join(libraryDir(), "roles.json");
}
function stylesPath(): string {
  return path.join(libraryDir(), "styles.json");
}
function ensureDir(p: string): void {
  fs.mkdirSync(p, { recursive: true });
}
function readJsonArray<T>(file: string): T[] {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}
function writeJsonArray<T>(file: string, items: T[]): void {
  ensureDir(libraryDir());
  fs.writeFileSync(file, JSON.stringify(items, null, 2));
}

export function shortId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

// ---- 角色 / 品牌库 ----
export function listRoles(): RoleEntry[] {
  return readJsonArray<RoleEntry>(rolesPath());
}
export function getRole(id: string): RoleEntry | undefined {
  return listRoles().find((r) => r.id === id);
}
export function addRole(
  input: Omit<RoleEntry, "id" | "createdAt"> & { id?: string; createdAt?: string }
): RoleEntry {
  const roles = listRoles();
  const entry: RoleEntry = {
    id: input.id ?? shortId("role"),
    kind: input.kind,
    name: input.name,
    description: input.description,
    palette: input.palette,
    assetRefs: input.assetRefs,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  roles.push(entry);
  writeJsonArray(rolesPath(), roles);
  return entry;
}
export function deleteRole(id: string): boolean {
  const roles = listRoles();
  const next = roles.filter((r) => r.id !== id);
  if (next.length === roles.length) return false;
  writeJsonArray(rolesPath(), next);
  return true;
}
// 把选中的角色 id 解析成可喂 agent 的简述（找不到的安静跳过）。
export function describeRoles(ids: string[]): string[] {
  const all = listRoles();
  return ids
    .map((id) => all.find((r) => r.id === id))
    .filter((r): r is RoleEntry => Boolean(r))
    .map((r) => {
      const pal = r.palette?.length ? `；配色 ${r.palette.join(" ")}` : "";
      return `【${kindZh(r.kind)}】${r.name}：${r.description}${pal}`;
    });
}
function kindZh(k: RoleEntry["kind"]): string {
  return k === "brand" ? "品牌" : k === "character" ? "角色" : "产品";
}

// ---- 自定义风格库（#4）----
export function listCustomStyles(): StylePack[] {
  return readJsonArray<StylePack>(stylesPath()).map((s) => ({
    ...s,
    custom: true,
  }));
}
export function addCustomStyle(
  input: Omit<StylePack, "id" | "custom"> & { id?: string }
): StylePack {
  const styles = readJsonArray<StylePack>(stylesPath());
  const entry: StylePack = {
    ...input,
    id: input.id ?? shortId("custom"),
    custom: true,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  styles.push(entry);
  writeJsonArray(stylesPath(), styles);
  return entry;
}
export function deleteCustomStyle(id: string): boolean {
  const styles = readJsonArray<StylePack>(stylesPath());
  const next = styles.filter((s) => s.id !== id);
  if (next.length === styles.length) return false;
  writeJsonArray(stylesPath(), next);
  return true;
}

// 统一风格解析：内置 11 个 ∪ 自定义。渲染/agent 都走它。
export function resolveStyle(id: string): StylePack | undefined {
  return styleById(id) ?? listCustomStyles().find((s) => s.id === id);
}

// 把库里的相对文件路径落地为绝对路径（供 /api/library/file 用，做越权校验）。
export function libraryFileAbs(rel: string): string | null {
  if (!rel || rel.includes("..") || path.isAbsolute(rel)) return null;
  const base = path.resolve(libraryDir());
  const abs = path.resolve(base, rel);
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  return abs;
}
