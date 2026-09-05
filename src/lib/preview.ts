import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import DOMPurify from "dompurify";
import { convertFileSrc } from "@tauri-apps/api/core";
import { markdownItKatex } from "./math";
import { slugify } from "./toc";
import { Prism, loadLanguages, loadLanguage, applyPrismPatches } from "./prism-loader";

// ── 初始化 Prism 补丁 ──────────────────────────────────────────────────
applyPrismPatches();

// ── 预加载常用语言 ─────────────────────────────────────────────────────
// markdown-it 的 highlight 回调是同步的，异步加载的语言第一次渲染时
// 拿不到 grammar 会退回纯文本，因此启动时先把高频语言注册进 Prism。
const COMMON_LANGS = [
  "typescript", "tsx", "jsx", "java", "python", "c", "cpp", "csharp",
  "go", "rust", "ruby", "php", "swift", "kotlin", "scala", "sql",
  "bash", "json", "yaml", "toml", "markdown", "diff",
];
void loadLanguages(COMMON_LANGS);

// ── Markdown 高亮配置 ──────────────────────────────────────────────────
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight(code, lang) {
    if (!lang) return md.utils.escapeHtml(code);
    const fullLang = lang.toLowerCase();
    const grammar = Prism.languages[fullLang];
    if (!grammar) {
      // 尝试加载语言（同步模式下返回纯文本，异步加载后会重新渲染）
      loadLanguage(fullLang);
      return md.utils.escapeHtml(code);
    }
    return Prism.highlight(code, grammar, fullLang);
  },
});

md.enable("strikethrough");
md.use(anchor, {
  slugify,
  permalink: false,
});
md.use(footnote);
md.use(taskLists, { enabled: true, label: true });
md.use(markdownItKatex);

// ── DOMPurify 配置 ──────────────────────────────────────────────────────
const PURIFY: DOMPurify.Config = {
  ALLOWED_URI_REGEXP: /^(?:(?:https?|data|asset):|http:\/\/asset\.localhost|#)/i,
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
  ALLOWED_ATTR: ["class", "id", "style", "open"],
  ADD_ATTR: ["target", "rel", "class", "id", "open", "style"],
};

// ── Mermaid 引擎 ────────────────────────────────────────────────────────
let mermaidReady: Promise<typeof import("mermaid")> | null = null;
let mermaidBooted = false;

export function mermaidEngineLoaded(): boolean {
  return mermaidBooted;
}

function loadMermaid() {
  if (!mermaidReady) {
    mermaidReady = import("mermaid");
  }
  return mermaidReady;
}

// ── 导出 ──────────────────────────────────────────────────────────────────
export function hasMermaidFence(source: string): boolean {
  return /```[ \t]*mermaid\b/i.test(source);
}

export function rewriteImages(
  html: string,
  docDir: string | null,
  blockRemote: boolean,
): string {
  return html.replace(/<img\b([^>]*?)>/gi, (full, attrs: string) => {
    const srcMatch = attrs.match(/\ssrc=["']([^"']+)["']/i);
    if (!srcMatch) return full;
    const src = srcMatch[1];
    if (/^https?:\/\//i.test(src)) {
      if (blockRemote) {
        return `<span class="remote-blocked">已拦截远程图片</span>`;
      }
      return full;
    }
    if (/^(data:|asset:|blob:)/i.test(src)) return full;
    if (!docDir) {
      return `<span class="img-broken">缺少文档目录，无法加载本地图片</span>`;
    }
    if (src.includes("..")) {
      return `<span class="img-broken">图片路径越界：${md.utils.escapeHtml(src)}</span>`;
    }
    const joined = `${docDir.replace(/[/\\]$/, "")}/${src.replace(/^[/\\]/, "")}`;
    try {
      const asset = convertFileSrc(joined);
      return `<img${attrs.replace(srcMatch[0], ` src="${asset}"`)}>`;
    } catch {
      return `<span class="img-broken">无法加载图片：${md.utils.escapeHtml(src)}</span>`;
    }
  });
}

export function renderMarkdown(source: string): string {
  const raw = md.render(source);
  return DOMPurify.sanitize(raw, PURIFY);
}

export async function renderPreview(
  source: string,
  options: { docDir: string | null; blockRemote: boolean; dark: boolean },
): Promise<string> {
  let html = renderMarkdown(source);
  html = rewriteImages(html, options.docDir, options.blockRemote);
  if (hasMermaidFence(source)) {
    try {
      html = await renderMermaidBlocks(html, options.dark);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      html = `<pre class="mermaid-error">图表渲染失败：${md.utils.escapeHtml(msg)}</pre>${html}`;
    }
  }
  return html;
}

async function renderMermaidBlocks(html: string, dark: boolean): Promise<string> {
  const mermaidMod = await loadMermaid();
  const blocks = [...html.matchAll(/<pre class="mermaid">([\s\S]*?)<\/pre>/gi)];
  if (blocks.length === 0) return html;

  const results: string[] = [];
  for (const [, code] of blocks) {
    const decoded = code
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    try {
      const result = await mermaidMod.render("mermaid", decoded, dark);
      results.push(`<div class="mermaid-svg">${result.svg}</div>`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push(`<pre class="mermaid-error">图表渲染失败：${md.utils.escapeHtml(msg)}</pre>`);
    }
  }

  let idx = 0;
  return html.replace(/<pre class="mermaid">[\s\S]*?<\/pre>/g, () => results[idx++] ?? "");
}
