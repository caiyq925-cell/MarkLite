import { describe, it, expect } from "vitest";
import {
  getLineType,
  getHeadingLevel,
  getListNumber,
  blockGutter,
} from "./block-gutter";

describe("block gutter", () => {
  describe("getLineType", () => {
    it("should detect heading", () => {
      expect(getLineType("# Title")).toBe("heading");
      expect(getLineType("## Subtitle")).toBe("heading");
      expect(getLineType("###### H6")).toBe("heading");
    });

    it("should detect numbered list", () => {
      expect(getLineType("1. First")).toBe("list");
      expect(getLineType("2. Second")).toBe("list");
    });

    it("should detect bullet list", () => {
      expect(getLineType("- Item")).toBe("list");
      expect(getLineType("* Item")).toBe("list");
    });

    it("should detect blockquote", () => {
      expect(getLineType("> quote")).toBe("blockquote");
    });

    it("should return null for regular paragraphs", () => {
      expect(getLineType("Regular text")).toBe(null);
      expect(getLineType("")).toBe(null);
    });
  });

  describe("getHeadingLevel", () => {
    it("should return correct level", () => {
      expect(getHeadingLevel("# H1")).toBe(1);
      expect(getHeadingLevel("## H2")).toBe(2);
      expect(getHeadingLevel("###### H6")).toBe(6);
    });

    it("should return null for non-heading", () => {
      expect(getHeadingLevel("No heading")).toBe(null);
    });
  });

  describe("getListNumber", () => {
    it("should return number for ordered list", () => {
      expect(getListNumber("1. First")).toBe(1);
      expect(getListNumber("5. Fifth")).toBe(5);
    });

    it("should return null for bullet list", () => {
      expect(getListNumber("- Item")).toBe(null);
    });
  });

  describe("blockGutter extension", () => {
    it("should create extension without errors", () => {
      const ext = blockGutter();
      expect(ext).toBeDefined();
    });
  });
});
