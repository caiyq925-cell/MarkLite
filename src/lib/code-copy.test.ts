import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
}));

import { attachCodeCopy, buildCodeCopyHtml, copyCodeBlock } from "./code-copy";
import { renderPreview } from "./preview";

class FakeClipboardItem {
  constructor(public data: Record<string, Blob>) {}
  getType(type: string): Blob {
    const blob = this.data[type];
    if (!blob) throw new Error(`no data for ${type}`);
    return blob;
  }
}

function stubClipboard(): { write: ReturnType<typeof vi.fn>; writeText: ReturnType<typeof vi.fn> } {
  const stub = {
    write: vi.fn().mockResolvedValue(undefined),
    writeText: vi.fn().mockResolvedValue(undefined),
  };
  Object.defineProperty(navigator, "clipboard", { value: stub, configurable: true });
  return stub;
}

async function blobText(item: FakeClipboardItem, type: string): Promise<string> {
  const blob = item.getType(type);
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsText(blob);
  });
}

function clickBtn(btn: Element): void {
  btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
}

function mountPreview(html: string): HTMLElement {
  document.body.innerHTML = `<div class="preview-host"><div class="preview-content"></div></div>`;
  const host = document.querySelector<HTMLElement>(".preview-host")!;
  host.querySelector<HTMLElement>(".preview-content")!.innerHTML = html;
  return host;
}

describe("renderPreview 注入复制按钮", () => {
  it("代码块被 .code-block 包裹并带 .code-copy 按钮", async () => {
    const html = await renderPreview("```js\nconst x = 1;\n```\n", {
      docDir: null,
      blockRemote: true,
      dark: false,
    });
    expect(html).toContain('<div class="code-block"><pre><code');
    expect(html).toContain('<button class="code-copy"');
  });

  it("普通段落不包装", async () => {
    const html = await renderPreview("just a paragraph\n", {
      docDir: null,
      blockRemote: true,
      dark: false,
    });
    expect(html).not.toContain("code-block");
  });
});

describe("代码块复制", () => {
  beforeEach(() => {
    vi.stubGlobal("ClipboardItem", FakeClipboardItem);
  });

  it("点击按钮同时写入纯文本与富文本两种格式", async () => {
    const clip = stubClipboard();
    const host = mountPreview(
      await renderPreview("```js\nconst x = 1;\nconst y = 2;\n```\n", {
        docDir: null,
        blockRemote: true,
        dark: false,
      }),
    );
    attachCodeCopy(host);
    clickBtn(host.querySelector(".code-copy")!);
    await vi.waitFor(() => expect(clip.write).toHaveBeenCalledTimes(1));

    const item = clip.write.mock.calls[0][0] as FakeClipboardItem;
    expect(await blobText(item, "text/plain")).toBe("const x = 1;\nconst y = 2;");
    const html = await blobText(item, "text/html");
    expect(html).toContain("<pre");
    // Prism 会把代码拆进 token span，富文本里保留高亮标记和内联样式
    expect(html).toContain('<span class="token keyword" style=');
    expect(html).toContain(">const</span>");
    // 点击后按钮进入"已复制"反馈态
    await vi.waitFor(() =>
      expect(host.querySelector(".code-copy")!.classList.contains("copied")).toBe(true),
    );
  });

  it("富文本内联实时计算样式（jsdom 取内联样式验证机制）", () => {
    document.body.innerHTML = `<div class="code-block"><pre style="color: rgb(16, 16, 16); background-color: rgb(246, 248, 250); padding: 14px 16px; border-radius: 8px;"><code><span style="color: rgb(0, 119, 170);">const</span> x</code></pre></div>`;
    const pre = document.querySelector("pre")!;
    const html = buildCodeCopyHtml(pre as HTMLElement);
    expect(html).toContain("color: rgb(16, 16, 16);");
    expect(html).toContain("background-color: rgb(246, 248, 250);");
    // 子节点的 token 颜色也被内联，粘贴后保留高亮
    expect(html).toContain("color: rgb(0, 119, 170);");
    expect(html).toContain("white-space: pre-wrap;");
  });

  it("复制内容剥掉预览查找的 mark 高亮", async () => {
    const clip = stubClipboard();
    document.body.innerHTML = `<div class="code-block"><pre><code>foo <mark class="preview-find-hit">bar</mark> baz</code></pre><button class="code-copy" type="button"></button></div>`;
    const btn = document.querySelector<HTMLElement>(".code-copy")!;
    const ok = await copyCodeBlock(btn);
    expect(ok).toBe(true);
    expect(clip.write).toHaveBeenCalledTimes(1);
    const item = clip.write.mock.calls[0][0] as FakeClipboardItem;
    expect(await blobText(item, "text/plain")).toBe("foo bar baz");
    expect(await blobText(item, "text/html")).not.toContain("<mark");
  });

  it("无 ClipboardItem 时降级为纯文本复制", async () => {
    vi.stubGlobal("ClipboardItem", undefined);
    const clip = stubClipboard();
    document.body.innerHTML = `<div class="code-block"><pre><code>plain</code></pre><button class="code-copy" type="button"></button></div>`;
    const btn = document.querySelector<HTMLElement>(".code-copy")!;
    const ok = await copyCodeBlock(btn);
    expect(ok).toBe(true);
    expect(clip.write).not.toHaveBeenCalled();
    expect(clip.writeText).toHaveBeenCalledWith("plain");
  });

  it("按钮不在 .code-block 内时不复制", async () => {
    const clip = stubClipboard();
    document.body.innerHTML = `<div><button class="code-copy" type="button"></button></div>`;
    const btn = document.querySelector<HTMLElement>(".code-copy")!;
    expect(await copyCodeBlock(btn)).toBe(false);
    expect(clip.write).not.toHaveBeenCalled();
    expect(clip.writeText).not.toHaveBeenCalled();
  });

  it("点击委托只响应 .code-copy，解绑后失效", async () => {
    const clip = stubClipboard();
    const host = mountPreview(
      await renderPreview("一段说明文字\n\n```\nhello\n```\n", {
        docDir: null,
        blockRemote: true,
        dark: false,
      }),
    );
    const detach = attachCodeCopy(host);

    clickBtn(host.querySelector(".preview-content p")!);
    expect(clip.write).not.toHaveBeenCalled();

    clickBtn(host.querySelector(".code-copy")!);
    await vi.waitFor(() => expect(clip.write).toHaveBeenCalledTimes(1));

    detach();
    clickBtn(host.querySelector(".code-copy")!);
    // 等一拍微任务，确认没有新增调用
    await new Promise((r) => setTimeout(r, 0));
    expect(clip.write).toHaveBeenCalledTimes(1);
  });
});
