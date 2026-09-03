import type MarkdownIt from "markdown-it";
import katex from "katex";

function renderMath(src: string, displayMode: boolean): string {
  try {
    return katex.renderToString(src, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `<span class="math-error">${escapeHtml(src)}\n${escapeHtml(msg)}</span>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function markdownItKatex(md: MarkdownIt): void {
  md.inline.ruler.before("escape", "math_inline", (state, silent) => {
    if (state.src[state.pos] !== "$" || state.src[state.pos + 1] === "$") return false;
    const start = state.pos + 1;
    let end = start;
    while (end < state.posMax) {
      if (state.src[end] === "$" && state.src[end - 1] !== "\\") break;
      end += 1;
    }
    if (end >= state.posMax) return false;
    if (!silent) {
      const token = state.push("math_inline", "span", 0);
      token.content = state.src.slice(start, end);
      token.markup = "$";
    }
    state.pos = end + 1;
    return true;
  });

  md.block.ruler.before("fence", "math_block", (state, start, end, silent) => {
    const startLine = state.bMarks[start] + state.tShift[start];
    const max = state.eMarks[start];
    if (!state.src.slice(startLine, max).startsWith("$$")) return false;
    let next = start;
    let closing = state.src.slice(startLine + 2, max).includes("$$");
    if (!closing) {
      for (next = start + 1; next < end; next++) {
        const lineStart = state.bMarks[next] + state.tShift[next];
        const lineEnd = state.eMarks[next];
        if (state.src.slice(lineStart, lineEnd).trim() === "$$") {
          closing = true;
          break;
        }
      }
    }
    if (!closing) return false;
    if (silent) return true;
    const first = state.src.slice(startLine + 2, max);
    let content: string;
    if (first.includes("$$")) {
      content = first.slice(0, first.indexOf("$$"));
      next = start;
    } else {
      const parts: string[] = [];
      for (let i = start + 1; i < next; i++) {
        parts.push(state.src.slice(state.bMarks[i] + state.tShift[i], state.eMarks[i]));
      }
      content = parts.join("\n");
    }
    const token = state.push("math_block", "div", 0);
    token.content = content.trim();
    token.map = [start, next + 1];
    token.markup = "$$";
    state.line = next + 1;
    return true;
  });

  md.renderer.rules.math_inline = (tokens, idx) => renderMath(tokens[idx].content, false);
  md.renderer.rules.math_block = (tokens, idx) =>
    `<div class="math-block">${renderMath(tokens[idx].content, true)}</div>\n`;
}
