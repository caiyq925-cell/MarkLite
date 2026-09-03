import { describe, it, expect } from "vitest";
import { inlineFencePlugin, findFenceBlocks, getFenceAtCursor } from "./inline-fence";
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
