import { describe, it, expect } from "vitest";
import {
  statusProbePlugin,
  computeStatusPayload,
  setStatusPayload,
  statusField,
} from "./status-probe";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

describe("status probe", () => {
  describe("computeStatusPayload", () => {
    it("should compute basic payload", () => {
      const state = EditorState.create({
        doc: "Hello world",
      });
      const view = new EditorView({ state });
      const payload = computeStatusPayload(view);
      
      expect(payload.line).toBe(1);
      expect(payload.col).toBe(1);
      expect(payload.rawSnippet).toContain("Hello");
      view.destroy();
    });

    it("should detect bold fence", () => {
      const state = EditorState.create({
        doc: "Hello **world** end",
        selection: { anchor: 8, head: 8 }, // inside "world"
      });
      const view = new EditorView({ state });
      const payload = computeStatusPayload(view);
      
      expect(payload.formats).toContain("bold");
      expect(payload.fenceLength).toBeGreaterThan(0);
      view.destroy();
    });

    it("should detect aside fence", () => {
      const state = EditorState.create({
        doc: "Hello ??note?? world",
        selection: { anchor: 8, head: 8 }, // inside "note"
      });
      const view = new EditorView({ state });
      const payload = computeStatusPayload(view);
      
      expect(payload.formats).toContain("aside");
      expect(payload.asideHidden).toBe(true);
      view.destroy();
    });

    it("should detect heading", () => {
      const state = EditorState.create({
        doc: "# Title",
        selection: { anchor: 2, head: 2 },
      });
      const view = new EditorView({ state });
      const payload = computeStatusPayload(view);
      
      expect(payload.formats).toContain("heading");
      view.destroy();
    });

    it("should detect list", () => {
      const state = EditorState.create({
        doc: "- Item",
        selection: { anchor: 2, head: 2 },
      });
      const view = new EditorView({ state });
      const payload = computeStatusPayload(view);
      
      expect(payload.formats).toContain("list");
      view.destroy();
    });
  });

  describe("statusProbePlugin", () => {
    it("should create extension", () => {
      const ext = statusProbePlugin();
      expect(ext).toBeDefined();
      expect(Array.isArray(ext)).toBe(true);
    });
  });

  describe("statusField", () => {
    it("should have default value", () => {
      const field = statusField;
      expect(field).toBeDefined();
    });
  });
});
