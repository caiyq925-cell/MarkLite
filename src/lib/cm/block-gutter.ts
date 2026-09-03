import { EditorView, GutterMarker, gutter } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

/**
 * 标题 Gutter 标记
 */
class HeadingGutterMarker extends GutterMarker {
  readonly elementClass = "cm-gutter-heading";
  level: number = 2;

  eq(other: GutterMarker): boolean {
    return other instanceof HeadingGutterMarker;
  }

  destroy(): void {}
}

/**
 * 列表 Gutter 标记
 */
class ListGutterMarker extends GutterMarker {
  readonly elementClass = "cm-gutter-list";
  kind: "bullet" | "number" = "bullet";
  num: number = 1;

  eq(other: GutterMarker): boolean {
    return other instanceof ListGutterMarker;
  }

  destroy(): void {}
}

/**
 * 引用 Gutter 标记
 */
class BlockquoteGutterMarker extends GutterMarker {
  readonly elementClass = "cm-gutter-blockquote";

  eq(other: GutterMarker): boolean {
    return other instanceof BlockquoteGutterMarker;
  }

  destroy(): void {}
}

/**
 * 判断行类型
 */
export function getLineType(line: string): "heading" | "list" | "blockquote" | null {
  const headingMatch = line.match(/^(#{1,6})\s+/);
  if (headingMatch) return "heading";
  
  const listMatch = line.match(/^(\d+)\.\s+/);
  if (listMatch) return "list";
  
  const bulletMatch = line.match(/^[-*]\s+/);
  if (bulletMatch) return "list";
  
  if (/^>\s/.test(line)) return "blockquote";
  
  return null;
}

/**
 * 获取标题层级
 */
export function getHeadingLevel(line: string): number | null {
  const match = line.match(/^(#{1,6})\s+/);
  return match ? match[1].length : null;
}

/**
 * 获取列表编号
 */
export function getListNumber(line: string): number | null {
  const match = line.match(/^(\d+)\.\s+/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * CodeMirror 6 扩展：添加块级 Gutter
 */
export function blockGutter(): Extension {
  return gutter({
    class: "cm-block-gutter",
    lineMarker: (view, line) => {
      const text = view.state.doc.slice(line.from, line.to).toString();
      const type = getLineType(text);
      if (!type) return null;

      if (type === "heading") {
        const marker = new HeadingGutterMarker();
        const level = getHeadingLevel(text) ?? 2;
        marker.level = level as 1 | 2 | 3 | 4 | 5 | 6;
        return marker;
      }

      if (type === "list") {
        const marker = new ListGutterMarker();
        const num = getListNumber(text);
        if (num) {
          marker.kind = "number";
          marker.num = num;
        }
        return marker;
      }

      if (type === "blockquote") {
        return new BlockquoteGutterMarker();
      }

      return null;
    },
  });
}
