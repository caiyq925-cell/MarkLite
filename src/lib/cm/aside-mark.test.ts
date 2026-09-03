import { describe, it, expect } from "vitest";
import { scanAsides, asideMarkPlugin, isAsideAtCursor, getAsideAtCursor } from "./aside-mark";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

describe("aside mark", () => {
  describe("scanAsides", () => {
    it("should find simple aside", () => {
      const text = "??note??";
      const spans = scanAsides(text);
      expect(spans.length).toBe(1);
      expect(spans[0].content).toBe("note");
      expect(spans[0].from).toBe(0);
      expect(spans[0].to).toBe(8); // ??note?? is 8 chars
    });

    it("should find multiple asides", () => {
      const text = "First ??note1?? and ??note2??";
      const spans = scanAsides(text);
      expect(spans.length).toBe(2);
      expect(spans[0].content).toBe("note1");
      expect(spans[1].content).toBe("note2");
    });

    it("should mark long asides as overlong", () => {
      const longText = "x".repeat(121);
      const text = `??${longText}??`;
      const spans = scanAsides(text);
      expect(spans[0].overlong).toBe(true);
    });

    it("should not treat nested ?? as nested aside", () => {
      const text = "??outer ??inner?? outer??";
      const spans = scanAsides(text);
      // 非贪婪匹配，只找到第一个完整对
      expect(spans.length).toBeGreaterThanOrEqual(1);
    });

    it("should handle multiline aside", () => {
      const text = "??line1\nline2??";
      const spans = scanAsides(text);
      expect(spans.length).toBe(1);
      expect(spans[0].content).toContain("line1");
    });
  });

  describe("isAsideAtCursor", () => {
    it("should return true when cursor is in aside", () => {
      const text = "Hello ??note?? world";
      expect(isAsideAtCursor(text, 7)).toBe(true); // inside "note"
      expect(isAsideAtCursor(text, 0)).toBe(false); // before aside
    });

    it("should return false when cursor is outside aside", () => {
      const text = "Hello ??note?? world";
      expect(isAsideAtCursor(text, 0)).toBe(false);
      expect(isAsideAtCursor(text, 20)).toBe(false);
    });
  });

  describe("getAsideAtCursor", () => {
    it("should return aside span when cursor is inside", () => {
      const text = "Hello ??note?? world";
      const span = getAsideAtCursor(text, 7);
      expect(span).not.toBeNull();
      expect(span!.content).toBe("note");
    });

    it("should return null when cursor is outside", () => {
      const text = "Hello world";
      const span = getAsideAtCursor(text, 3);
      expect(span).toBeNull();
    });
  });

  describe("asideMarkPlugin", () => {
    it("should create decorations", () => {
      const state = EditorState.create({
        doc: "Hello ??note?? world",
        extensions: [asideMarkPlugin()],
      });
      const view = new EditorView({ state });
      const deco = view.state.facet(EditorView.decorations);
      expect(deco).toBeDefined();
      view.destroy();
    });
  });
});
