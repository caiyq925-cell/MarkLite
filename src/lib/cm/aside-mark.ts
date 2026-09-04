import { EditorView, Decoration } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import type { AsideSpan } from "./types";

const ASIDE_REGEX = /\?\?([\s\S]*?)\?\?/g;

/**
 * 扫描文本中的旁白（??...??）
 */
export function scanAsides(text: string): AsideSpan[] {
  const spans: AsideSpan[] = [];
  let match;

  ASIDE_REGEX.lastIndex = 0;
  while ((match = ASIDE_REGEX.exec(text)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    const innerFrom = from + 2; // 跳过第一个 ??
    const innerTo = to - 2;     // 跳过最后一个 ??
    const content = match[1];

    spans.push({
      from,
      to,
      innerFrom,
      innerTo,
      content,
      overlong: content.length > 120,
    });
  }

  return spans;
}

/**
 * CodeMirror 6 插件：为旁白添加装饰
 */
export function asideMarkPlugin(): Extension {
  return EditorView.decorations.compute(["doc"], (state) => {
    const text = state.doc.toString();
    const spans = scanAsides(text);
    const builder = new RangeSetBuilder<Decoration>();

    for (const span of spans) {
      // 隐藏开始围栏 ??
      builder.add(span.from, span.innerFrom, Decoration.replace({
        class: "cm-aside-fence",
      }));

      // 装饰内部文本（空旁白 ??…?? 内部为零长度时跳过，避免同位置区间冲突）
      if (span.innerTo > span.innerFrom) {
        builder.add(span.innerFrom, span.innerTo, Decoration.mark({
          class: span.overlong ? "cm-aside cm-aside-overlong" : "cm-aside",
          inclusive: false,
        }));
      }

      // 隐藏结束围栏 ??
      builder.add(span.innerTo, span.to, Decoration.replace({
        class: "cm-aside-fence",
      }));
    }

    return builder.finish();
  });
}

/**
 * 检查光标是否在旁白内
 */
export function isAsideAtCursor(text: string, cursorPos: number): boolean {
  const spans = scanAsides(text);
  return spans.some((span) => cursorPos >= span.from && cursorPos <= span.to);
}

/**
 * 获取光标所在旁白范围
 */
export function getAsideAtCursor(text: string, cursorPos: number): AsideSpan | null {
  const spans = scanAsides(text);
  return spans.find((span) => cursorPos >= span.from && cursorPos <= span.to) ?? null;
}
