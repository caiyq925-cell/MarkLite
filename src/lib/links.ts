/**
 * 预览区链接目标解析。
 *
 * 预览 HTML 里的 <a> 由 markdown-it 生成，href 可能是三类：
 *   - "#片段"          文档内锚点（markdown-it 会把非 ASCII 字符做百分号编码）
 *   - "https://…"      外部链接
 *   - "./note.md"      相对当前文档的本地文件
 * 桌面 WebView 里这三类都不能走浏览器默认跳转：锚点默认只滚 document，
 * 而预览内容在 .preview-host 这个嵌套滚动容器里，结果是"点了没反应"；
 * 另外两类则会让 WebView 直接导航离开应用。所以统一解析后交给各自的处理器。
 */

export type LinkTarget =
  | { kind: "anchor"; id: string }
  | { kind: "external"; url: string }
  | { kind: "file"; path: string }
  | { kind: "ignore" };

const EXTERNAL = /^(?:https?|mailto|tel):/i;
const PROTOCOL = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
const WINDOWS_ABS = /^[a-zA-Z]:[\\/]/;

function toSlashes(p: string): string {
  return p.replace(/\\/g, "/");
}

/** 百分号编码还原（markdown-it 会对 href 里的非 ASCII 字符编码）；非法编码时按原样返回 */
export function decodePercent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function dirname(path: string): string {
  const s = toSlashes(path);
  const i = s.lastIndexOf("/");
  if (i < 0) return "";
  if (i === 0) return "/";
  return s.slice(0, i);
}

/** 归一化绝对路径：展开 "." / ".."，".." 不会越过盘符或根目录 */
export function normalizePath(path: string): string {
  const abs = toSlashes(path);
  const prefix = abs.startsWith("/") ? "/" : "";
  // 盘符段（C:）不可被 ".." 弹出
  const floor = WINDOWS_ABS.test(abs) ? 1 : 0;
  const segs: string[] = [];
  for (const part of abs.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (segs.length > floor) segs.pop();
      continue;
    }
    segs.push(part);
  }
  return prefix + segs.join("/");
}

/** 拼接目录与相对路径 */
export function joinPath(dir: string, rel: string): string {
  return normalizePath(`${toSlashes(dir).replace(/\/$/, "")}/${rel}`);
}

export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown|mdown)$/i.test(toSlashes(path).split("?")[0]);
}

export function classifyLink(href: string, docPath: string | null): LinkTarget {
  const raw = href.trim();
  if (!raw) return { kind: "ignore" };

  const hashAt = raw.indexOf("#");
  const before = hashAt >= 0 ? raw.slice(0, hashAt) : raw;
  const fragment = hashAt >= 0 ? raw.slice(hashAt + 1) : null;

  // 纯锚点：#标题 / 空片段（回到顶部）
  if (!before) {
    return fragment === null ? { kind: "ignore" } : { kind: "anchor", id: decodePercent(fragment) };
  }

  if (EXTERNAL.test(before)) return { kind: "external", url: raw };
  // javascript:、data:、asset: 等协议不接管，避免越权跳转
  if (PROTOCOL.test(before) && !WINDOWS_ABS.test(before)) return { kind: "ignore" };

  // 路径同样可能被百分号编码（../docs/深.md → ../docs/%E6%B7%B1.md）
  const pathPart = decodePercent(before.split("?")[0]);
  if (!pathPart) return { kind: "ignore" };

  if (WINDOWS_ABS.test(pathPart) || pathPart.startsWith("/") || pathPart.startsWith("\\\\")) {
    return { kind: "file", path: normalizePath(pathPart) };
  }

  // 相对路径需要文档所在目录才能解析
  if (!docPath) return { kind: "ignore" };
  const dir = dirname(docPath);
  if (!dir) return { kind: "ignore" };
  return { kind: "file", path: joinPath(dir, pathPart) };
}
