import { describe, expect, it } from "vitest";
import { classifyLink, isMarkdownPath, joinPath } from "./links";

describe("classifyLink 锚点", () => {
  it("识别纯锚点并还原百分号编码", () => {
    expect(classifyLink("#安装", "/docs/note.md")).toEqual({ kind: "anchor", id: "安装" });
    // markdown-it 会把中文 href 编码成 %E5%AE%89%E8%A3%85
    expect(classifyLink("#%E5%AE%89%E8%A3%85", "/docs/note.md")).toEqual({
      kind: "anchor",
      id: "安装",
    });
  });

  it("空片段表示回到顶部", () => {
    expect(classifyLink("#", "/docs/note.md")).toEqual({ kind: "anchor", id: "" });
  });

  it("非法百分号编码按原样匹配", () => {
    expect(classifyLink("#100%", "/docs/note.md")).toEqual({ kind: "anchor", id: "100%" });
  });
});

describe("classifyLink 外部链接", () => {
  it("保留 http/https/mailto", () => {
    expect(classifyLink("https://example.com/a?b=1#c", null)).toEqual({
      kind: "external",
      url: "https://example.com/a?b=1#c",
    });
    expect(classifyLink("mailto:a@b.c", null)).toEqual({ kind: "external", url: "mailto:a@b.c" });
  });

  it("不接管危险协议", () => {
    expect(classifyLink("javascript:alert(1)", null)).toEqual({ kind: "ignore" });
    expect(classifyLink("data:text/html,x", null)).toEqual({ kind: "ignore" });
    expect(classifyLink("", null)).toEqual({ kind: "ignore" });
  });
});

describe("classifyLink 本地文件", () => {
  it("相对路径解析到当前文档目录", () => {
    expect(classifyLink("./other.md", "/docs/note.md")).toEqual({
      kind: "file",
      path: "/docs/other.md",
    });
    expect(classifyLink("../img/a.md#x", "C:\\docs\\sub\\note.md")).toEqual({
      kind: "file",
      path: "C:/docs/img/a.md",
    });
  });

  it("路径里的中文百分号编码会被还原", () => {
    // markdown-it 会把 ../docs/深.md 编码成 ../docs/%E6%B7%B1.md
    expect(classifyLink("../docs/%E6%B7%B1.md", "C:/docs/sub/note.md")).toEqual({
      kind: "file",
      path: "C:/docs/docs/深.md",
    });
  });

  it("文件名里的字面量百分号不会被破坏", () => {
    expect(classifyLink("./100%.md", "C:/docs/note.md")).toEqual({
      kind: "file",
      path: "C:/docs/100%.md",
    });
  });

  it("Windows 绝对路径与盘符原样保留", () => {
    expect(classifyLink("D:\\notes\\a.md", null)).toEqual({ kind: "file", path: "D:/notes/a.md" });
    expect(classifyLink("C:/notes/a.md", null)).toEqual({ kind: "file", path: "C:/notes/a.md" });
  });

  it("没有文档路径时无法解析相对链接", () => {
    expect(classifyLink("./other.md", null)).toEqual({ kind: "ignore" });
  });

  it(".. 不会越过盘符/根目录", () => {
    expect(joinPath("C:/a", "../../b.md")).toBe("C:/b.md");
    expect(joinPath("/a", "../../b.md")).toBe("/b.md");
  });
});

describe("isMarkdownPath", () => {
  it("只认 markdown 扩展名", () => {
    expect(isMarkdownPath("/docs/a.md")).toBe(true);
    expect(isMarkdownPath("/docs/a.MARKDOWN")).toBe(true);
    expect(isMarkdownPath("/docs/a.txt")).toBe(false);
    expect(isMarkdownPath("/docs/a.png")).toBe(false);
  });
});
