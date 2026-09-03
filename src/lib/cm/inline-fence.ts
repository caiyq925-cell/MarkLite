import { EditorView, Decoration } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import type { FenceBlock, FenceState } from "./types";

/**
 * 扫描文本中的行内围栏（**bold**, *italic*, `code`）
 * @internal
 */
export function findFenceBlocks(text: string): FenceBlock[] {
  const blocks: FenceBlock[] = [];

  // 匹配 **bold**
  const boldRegex = /\*\*([^*]+)\*\*/g;
  let match;
  while ((match = boldRegex.exec(text)) !== null) {
    blocks.push({
      from: match.index,
      to: match.index + match[0].length,
      kind: "bold",
      state: "idle" as FenceState,
    });
  }

  // 匹配 *italic* (但不匹配 ** 包裹的)
  const italicRegex = /(?<!\*)\*(?!\*)([^*\n]+?)(?<!\*)\*(?!\*)/g;
  while ((match = italicRegex.exec(text)) !== null) {
    blocks.push({
      from: match.index,
      to: match.index + match[0].length,
      kind: "italic",
      state: "idle" as FenceState,
    });
  }

  // 匹配 `code`
  const codeRegex = /`([^`]+)`/g;
  while ((match = codeRegex.exec(text)) !== null) {
    blocks.push({
      from: match.index,
      to: match.index + match[0].length,
      kind: "code",
      state: "idle" as FenceState,
    });
  }

  return blocks;
}

/**
 * 检查是否主要是中文
 */
function isMainlyChinese(text: string): boolean {
  const cjkMatch = text.match(/[\u4e00-\u9fa5]/g);
  if (!cjkMatch || cjkMatch.length === 0) return false;
  const ratio = cjkMatch.length / text.length;
  return ratio > 0.8;
}

/**
 * CodeMirror 6 插件：为行内围栏添加装饰
 */
export function inlineFencePlugin(): Extension {
  return EditorView.decorations.compute(["doc"], (state) => {
    const text = state.doc.toString();
    const blocks = findFenceBlocks(text);
    const builder = new RangeSetBuilder<Decoration>();

    for (const block of blocks) {
      if (block.kind === "bold") {
        builder.add(block.from, block.to, Decoration.mark({
          class: "cm-inline-bold",
          inclusive: false,
        }));
      } else if (block.kind === "italic") {
        const innerText = text.slice(block.from + 1, block.to - 1);
        const className = isMainlyChinese(innerText) ? "cm-inline-italic-zh" : "cm-inline-italic";
        builder.add(block.from, block.to, Decoration.mark({
          class: className,
          inclusive: false,
        }));
      } else if (block.kind === "code") {
        builder.add(block.from, block.to, Decoration.mark({
          class: "cm-inline-code-chip",
          inclusive: false,
        }));
      }
    }

    return builder.finish();
  });
}

/**
 * 获取光标所在围栏状态（用于状态栏）
 */
export function getFenceAtCursor(
  text: string,
  cursorPos: number
): { kind: string; length: number } | null {
  const blocks = findFenceBlocks(text);
  for (const block of blocks) {
    if (cursorPos >= block.from && cursorPos <= block.to) {
      return { kind: block.kind, length: block.to - block.from };
    }
  }
  return null;
}
