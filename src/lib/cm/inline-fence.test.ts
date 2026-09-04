import { describe, it, expect } from "vitest";
import { inlineFencePlugin, findFenceBlocks, getFenceAtCursor, sortNonOverlapping } from "./inline-fence";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

describe("inline fence plugin", () => {
  it("should find bold fence blocks", () => {
    const text = "**bold text**";
    const blocks = findFenceBlocks(text);
    expect(blocks.length).toBe(1);
    expect(blocks[0].kind).toBe("bold");
    expect(blocks[0].from).toBe(0);
    expect(blocks[0].to).toBe(text.length);
  });

  it("should find italic fence blocks", () => {
    const text = "*italic text*";
    const blocks = findFenceBlocks(text);
    expect(blocks.some((b) => b.kind === "italic")).toBe(true);
  });

  it("should find code fence blocks", () => {
    const text = "`code here`";
    const blocks = findFenceBlocks(text);
    expect(blocks.some((b) => b.kind === "code")).toBe(true);
  });

  it("should not double-match ** inside *", () => {
    const text = "**double** and *single*";
    const blocks = findFenceBlocks(text);
    const boldBlocks = blocks.filter((b) => b.kind === "bold");
    const italicBlocks = blocks.filter((b) => b.kind === "italic");
    expect(boldBlocks.length).toBe(1);
    expect(italicBlocks.length).toBe(1);
  });

  it("should create decorations", () => {
    const state = EditorState.create({
      doc: "**bold** *italic* `code`",
      extensions: [inlineFencePlugin()],
    });
    const view = new EditorView({ state });
    const deco = view.state.facet(EditorView.decorations);
    expect(deco).toBeDefined();
    view.destroy();
  });

  it("should not throw when categories appear in reverse order", () => {
    // 回归：行内代码先于加粗出现时，扫描结果不是按位置排序的，
    // RangeSetBuilder 会抛 "Ranges must be added sorted" 导致编辑器空白
    const state = EditorState.create({
      doc: "`code` then *italic* then **bold**",
      extensions: [inlineFencePlugin()],
    });
    const view = new EditorView({ state });
    const decoSets = view.state.facet(EditorView.decorations);
    let count = 0;
    for (const set of decoSets) {
      set.between(0, view.state.doc.length, () => {
        count++;
      });
    }
    expect(count).toBe(3);
    view.destroy();
  });

  it("should skip overlapping ranges", () => {
    // *`code`* 会同时命中 italic 与 code 且区间交叉，必须丢弃其一而不是抛错
    const state = EditorState.create({
      doc: "*`code`* and `plain`",
      extensions: [inlineFencePlugin()],
    });
    const view = new EditorView({ state });
    const decoSets = view.state.facet(EditorView.decorations);
    let count = 0;
    for (const set of decoSets) {
      set.between(0, view.state.doc.length, () => {
        count++;
      });
    }
    expect(count).toBeGreaterThanOrEqual(1);
    view.destroy();
  });

  it("sortNonOverlapping keeps position order and drops overlaps", () => {
    const blocks = findFenceBlocks("`a` **b** *c*");
    const sorted = sortNonOverlapping(blocks);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].from).toBeGreaterThanOrEqual(sorted[i - 1].to);
    }
    expect(sorted[0].kind).toBe("code");
  });

  it("should detect Chinese italic", () => {
    const state = EditorState.create({
      doc: "*中文强调*",
      extensions: [inlineFencePlugin()],
    });
    const view = new EditorView({ state });
    const deco = view.state.facet(EditorView.decorations);
    expect(deco).toBeDefined();
    view.destroy();
  });

  it("getFenceAtCursor should return block info", () => {
    const text = "Hello **world** end";
    const result = getFenceAtCursor(text, 8); // cursor in "world"
    expect(result).not.toBeNull();
    expect(result!.kind).toBe("bold");
  });

  it("getFenceAtCursor should return null outside fence", () => {
    const text = "Hello world";
    const result = getFenceAtCursor(text, 3);
    expect(result).toBeNull();
  });
});
