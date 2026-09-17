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

/** 光标前后扫描窗口（字符数）。
 *  覆盖绝大多数行内围栏/旁白/上下文实体，同时把扫描成本从 O(全文) 降到 O(窗口)。 */
const SCAN_WINDOW = 400;

/**
 * 从选区计算状态负载
 *
 * 性能优化：只取光标附近一个小窗口（~±400 字符）做围栏/旁白/实体扫描，
 * 而不是把整个文档 toString 后全文正则遍历。对大文件（MB 级），
 * 每次光标移动/按键的开销从 O(n) 降到 O(1)。
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

  // 只截取光标附近的文本窗口，避免对大文件做全文 toString
  const docLen = view.state.doc.length;
  const winFrom = Math.max(0, from - SCAN_WINDOW);
  const winTo = Math.min(docLen, to + SCAN_WINDOW);
  const windowText = view.state.sliceDoc(winFrom, winTo);
  // 窗口内的相对位置 = 绝对位置 - winFrom
  const relFrom = from - winFrom;
  const relTo = to - winFrom;

  // 状态栏 snippet：光标前后各 40 字符
  const snipFrom = Math.max(0, relFrom - 40);
  const snipTo = Math.min(windowText.length, relTo + 40);
  const rawSnippet = windowText.slice(snipFrom, snipTo);

  const formats: StatusPayload["formats"] = [];
  let fenceLength: number | undefined;
  let context: string | undefined;
  let asideHidden = false;
  let mediaError: string | undefined;

  // 检查围栏（在窗口内扫描，命中后换算回绝对位置）
  const fences = findFenceBlocks(windowText);
  for (const fence of fences) {
    const absFrom = winFrom + fence.from;
    const absTo = winFrom + fence.to;
    if (from >= absFrom && from <= absTo) {
      formats.push(fence.kind === "bold" ? "bold" : fence.kind === "italic" ? "italic" : "code");
      fenceLength = absTo - absFrom;

      // 上下文实体：只在围栏内部窗口扫描，避免全文扫描
      const innerWinFrom = Math.max(0, fence.from - 40);
      const innerWinTo = Math.min(windowText.length, fence.to + 40);
      const innerText = windowText.slice(innerWinFrom, innerWinTo);
      const entities = scanEntities(innerText, intensity, blacklist);
      const entityInRange = entities.find(
        (e) => e.from >= fence.from - innerWinFrom && e.to <= fence.to - innerWinFrom,
      );
      if (entityInRange) {
        context = entityInRange.content;
      }
      break;
    }
  }

  // 检查旁白（窗口内扫描）
  const asides = scanAsides(windowText);
  for (const aside of asides) {
    const absFrom = winFrom + aside.from;
    const absTo = winFrom + aside.to;
    if (from >= absFrom && from <= absTo) {
      formats.push("aside");
      asideHidden = true;
      break;
    }
  }

  // 检查标题/列表：只读当前行文本（O(行长)）
  const lineText = view.state.doc.line(line).text;
  if (/^#{1,6}\s/.test(lineText)) {
    formats.push("heading");
  }
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
