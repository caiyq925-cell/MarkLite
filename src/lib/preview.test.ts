import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
}));

import {
  hasMermaidFence,
  mermaidEngineLoaded,
  renderMarkdown,
  rewriteImages,
} from "./preview";
import { loadLanguage } from "./prism-loader";

describe("preview pipeline", () => {
  it("renders GFM table tasklist strikethrough and footnote", () => {
    const src = [
      "# Title",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "- [x] done",
      "",
      "~~strike~~",
      "",
      "See https://example.com",
      "",
      "Note.[^1]",
      "",
      "[^1]: foot",
    ].join("\n");
    const html = renderMarkdown(src);
    expect(html).toContain("<table>");
    expect(html).toMatch(/checkbox|task-list/i);
    expect(html).toMatch(/<del>|<s>/);
    expect(html).toContain("example.com");
    expect(html).toMatch(/footnote|fn/i);
  });

  it("highlights registered languages and leaves unknown as text", () => {
    const js = renderMarkdown("```js\nconst x = 1;\n```");
    expect(js).toContain("token keyword");
    expect(js).toContain("const");
    const unknown = renderMarkdown("```brainfuck\n+++\n```");
    expect(unknown).toContain("+++");
    expect(unknown).not.toContain("token keyword");
  });

  it("renders katex and keeps source on failure", () => {
    const ok = renderMarkdown("inline $a+b$ and\n\n$$c=d$$\n");
    expect(ok).toMatch(/katex/i);
    const bad = renderMarkdown("$$\\notacommandZZZ$$\n");
    expect(bad.length).toBeGreaterThan(0);
  });

  it("strips script handlers and javascript urls", () => {
    const html = renderMarkdown(`<script>alert(1)</script>\n\n<a href="javascript:alert(1)">x</a>\n\n<img src="x" onclick="alert(1)">`);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/javascript:/i);
    expect(html).not.toMatch(/\sonclick=/i);
  });

  it("does not boot mermaid without a fence", () => {
    expect(hasMermaidFence("# hi\n```js\n1\n```")).toBe(false);
    expect(mermaidEngineLoaded()).toBe(false);
  });

  it("rewrites relative images and blocks remote when asked", () => {
    const local = rewriteImages(`<img src="images/logo.png">`, "D:/docs", false);
    expect(local).toContain("asset://");
    const blocked = rewriteImages(`<img src="https://evil.example/a.png">`, "D:/docs", true);
    expect(blocked).toContain("已拦截远程图片");
    const escape = rewriteImages(`<img src="../secret.png">`, "D:/docs", false);
    expect(escape).toContain("越界");
  });
});

  it("highlights Java code with keywords", async () => {
    await loadLanguage("java");
    const java = renderMarkdown('```java\nprivate static final String x = "test";\n```');
    expect(java).toContain('token keyword');
    expect(java).toContain('private');
  });
