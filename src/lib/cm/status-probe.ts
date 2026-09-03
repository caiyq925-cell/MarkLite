import { EditorView } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import type { StatusPayload } from "./types";
import { findFenceBlocks } from "./inline-fence";
import { scanAsides } from "./aside-mark";
import { scanEntities } from "./entity-lex";

/**
 * 设置状态负载的效果
 */
export const setStatusPayload = StateEffect.define<StatusPayload>();

/**
 * 状态栏状态字段
 */
export const statusField = StateField.define<StatusPayload>({
  create() {
    return {
      line: 1,
      col: 1,
      formats: [],
      rawSnippet: "",
    };
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setStatusPayload)) {
        return effect.value;
      }
    }
    return value;
  },
});

/**
 * 从选区计算状态负载
 */
export function computeStatusPayload(
  view: EditorView,
  intensity: "aggressive" | "conservative" = "aggressive",
  blacklist: string[] = []
): StatusPayload {
  const { from, to } = view.state.selection.main;
  const lineObj = view.state.doc.lineAt(from);
  const line = lineObj.number;
  const col = from - lineObj.from + 1;

  const text = view.state.doc.toString();
  const snippetStart = Math.max(0, from - 40);
  const snippetEnd = Math.min(text.length, to + 40);
  const rawSnippet = text.slice(snippetStart, snippetEnd);

  const formats: StatusPayload["formats"] = [];
  let fenceLength: number | undefined;
  let context: string | undefined;
  let asideHidden = false;
  let mediaError: string | undefined;

  // 检查围栏
  const fences = findFenceBlocks(text);
  for (const fence of fences) {
    if (from >= fence.from && from <= fence.to) {
      formats.push(fence.kind === "bold" ? "bold" : fence.kind === "italic" ? "italic" : "code");
      fenceLength = fence.to - fence.from;
      
      // 计算上下文实体
      const entities = scanEntities(text, intensity, blacklist);
      const entityInRange = entities.find((e) => e.from >= fence.from && e.to <= fence.to);
      if (entityInRange) {
        context = entityInRange.content;
      }
      break;
    }
  }

  // 检查旁白
  const asides = scanAsides(text);
  for (const aside of asides) {
    if (from >= aside.from && from <= aside.to) {
      formats.push("aside");
      asideHidden = true;
      break;
    }
  }

  // 检查标题
  const lineText = view.state.doc.line(line).text;
  if (/^#{1,6}\s/.test(lineText)) {
    formats.push("heading");
  }

  // 检查列表
  if (/^[-*]\s/.test(lineText) || /^\d+\.\s/.test(lineText)) {
    formats.push("list");
  }

  return {
    line,
    col,
    formats,
    fenceLength,
    rawSnippet,
    context,
    asideHidden,
    mediaError,
  };
}

/**
 * CodeMirror 6 扩展：状态栏探针
 */
export function statusProbePlugin(
  intensity: "aggressive" | "conservative" = "aggressive",
  blacklist: string[] = []
): Extension {
  return [
    statusField,
    EditorView.updateListener.of((update) => {
      if (update.selectionSet || update.docChanged) {
        const payload = computeStatusPayload(update.view, intensity, blacklist);
        update.view.dispatch({ effects: setStatusPayload.of(payload) });
      }
    }),
  ];
}
