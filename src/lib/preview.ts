import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import python from "highlight.js/lib/languages/python";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import yaml from "highlight.js/lib/languages/yaml";
import sql from "highlight.js/lib/languages/sql";
import markdown from "highlight.js/lib/languages/markdown";
import { convertFileSrc } from "@tauri-apps/api/core";
import { markdownItKatex } from "./math";
import { slugify } from "./toc";

hljs.registerLanguage("bash", bash);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("python", python);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("markdown", markdown);

const ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  html: "xml",
};

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

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: false,
  highlight(code, lang) {
    const key = ALIASES[lang] ?? lang;
    if (key && hljs.getLanguage(key)) {
      return hljs.highlight(code, { language: key, ignoreIllegals: true }).value;
    }
    return md.utils.escapeHtml(code);
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

const PURIFY: DOMPurify.Config = {
  ALLOWED_URI_REGEXP: /^(?:(?:https?|data|asset):|http:\/\/asset\.localhost|#)/i,
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
  ADD_ATTR: ["target", "rel", "class", "id", "open", "style"],
};

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
      // 图表渲染失败不应吞掉整个预览，保留已渲染的 Markdown 并给出提示
      const msg = err instanceof Error ? err.message : String(err);
      html = `<pre class="mermaid-error">图表渲染失败：${md.utils.escapeHtml(msg)}</pre>${html}`;
    }
  }
  return html;
}

async function renderMermaidBlocks(html: string, dark: boolean): Promise<string> {
  const mermaidMod = await loadMermaid();
  mermaidBooted = true;
  mermaidMod.default.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "default",
  });
  const container = document.createElement("div");
  container.innerHTML = html;
  const blocks = [...container.querySelectorAll("pre code.language-mermaid, code.language-mermaid")];
  await Promise.all(
    blocks.map(async (el, index) => {
      const src = el.textContent ?? "";
      const host = el.closest("pre") ?? el;
      try {
        const id = `mermaid-${index}-${Date.now()}`;
        const result = await Promise.race([
          mermaidMod.default.render(id, src),
          timeout(3000),
        ]);
        if (!result) {
          host.replaceWith(errorNode(src, "图表渲染超时（超过 3 秒）"));
          return;
        }
        const wrap = document.createElement("div");
        wrap.className = "mermaid-svg";
        if (/^\s*sequenceDiagram/i.test(src)) {
          wrap.dataset.type = "sequence";
        }
        wrap.innerHTML = result.svg;
        host.replaceWith(wrap);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        host.replaceWith(errorNode(src, msg));
      }
    }),
  );
  return container.innerHTML;
}

function timeout(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

function errorNode(src: string, message: string): HTMLElement {
  const pre = document.createElement("pre");
  pre.className = "mermaid-error";
  pre.textContent = `${src}\n${message}`;
  return pre;
}

export function containsUnsafeHtml(html: string): boolean {
  return /<script\b/i.test(html) || /\son\w+=/i.test(html) || /javascript:/i.test(html);
}
