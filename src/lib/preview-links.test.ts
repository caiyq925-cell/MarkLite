import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderMarkdown } from "./preview";
import { attachPreviewLinks, handlePreviewClick, type PreviewLinkActions } from "./preview-links";

const SRC = [
  "# 安装",
  "",
  "[跳转](#安装)",
  "",
  "[大小写锚点](#Install-Guide)",
  "",
  "[外链](https://example.com/a)",
  "",
  "[同目录](other.md)",
  "",
  "[子目录](../docs/深.md)",
  "",
  "[图片](img/a.png)",
  "",
  "脚注引用[^1]",
  "",
  "[^1]: 脚注内容",
].join("\n");

function makeActions(docPath: string | null = "C:/docs/note.md"): PreviewLinkActions {
  return {
    docPath: () => docPath,
    onAnchor: vi.fn(),
    onExternal: vi.fn(),
    onFile: vi.fn(),
  };
}

function clickLink(text: string, actions: PreviewLinkActions, root: ParentNode = document) {
  const link = [...root.querySelectorAll("a")].find((a) => (a.textContent ?? "").trim() === text);
  expect(link, `找不到链接：${text}`).toBeTruthy();
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  link!.dispatchEvent(event);
  return event;
}

/** 建一个脱离当前测试 DOM 的预览宿主，用于验证"没有监听器 / 只挂局部监听器"的场景 */
function makeIsolatedPreview(markdown: string): HTMLElement {
  const host = document.createElement("div");
  host.className = "preview-host";
  const content = document.createElement("div");
  content.className = "preview-content";
  content.innerHTML = renderMarkdown(markdown);
  host.appendChild(content);
  document.body.appendChild(host);
  return host;
}

describe("预览区锚点跳转", () => {
  let actions: PreviewLinkActions;

  beforeEach(() => {
    actions = makeActions();
    document.body.innerHTML = `<div class="preview-host"><div class="preview-content">${renderMarkdown(SRC)}</div></div>`;
    const host = document.querySelector<HTMLElement>(".preview-host")!;
    attachPreviewLinks(host, actions);
  });

  it("markdown-it-anchor 生成的标题 id 与锚点片段能对上", () => {
    const link = [...document.querySelectorAll("a")].find((a) => a.textContent === "跳转")!;
    const fragment = decodeURIComponent((link.getAttribute("href") ?? "").replace(/^#/, ""));
    expect(document.getElementById(fragment)).not.toBeNull();
  });

  it("点击 #中文锚点 被接管并解码片段", () => {
    const event = clickLink("跳转", actions);
    expect(event.defaultPrevented).toBe(true);
    expect(actions.onAnchor).toHaveBeenCalledWith("安装");
  });

  it("点击大小写不同的锚点也交给锚点处理器", () => {
    clickLink("大小写锚点", actions);
    expect(actions.onAnchor).toHaveBeenCalledWith("Install-Guide");
  });

  it("脚注链接按锚点处理", () => {
    const link = [...document.querySelectorAll("a")].find((a) =>
      /fn/.test(a.getAttribute("href") ?? ""),
    );
    expect(link, "脚注链接未生成").toBeTruthy();
    link!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(actions.onAnchor).toHaveBeenCalledWith(expect.stringMatching(/^fn/));
  });

  it("外部链接交给系统浏览器并阻止 WebView 导航", () => {
    const event = clickLink("外链", actions);
    expect(event.defaultPrevented).toBe(true);
    expect(actions.onExternal).toHaveBeenCalledWith("https://example.com/a");
  });

  it("相对路径的 md 解析成绝对路径后打开", () => {
    clickLink("同目录", actions);
    expect(actions.onFile).toHaveBeenCalledWith("C:/docs/other.md");

    clickLink("子目录", actions);
    expect(actions.onFile).toHaveBeenCalledWith("C:/docs/深.md");
  });

  it("非 markdown 的本地文件不打开，但仍阻止 WebView 导航", () => {
    const event = clickLink("图片", actions);
    expect(event.defaultPrevented).toBe(true);
    expect(actions.onFile).not.toHaveBeenCalled();
  });

  it("没有文档路径时相对链接不打开，但仍阻止导航", () => {
    const bare = makeActions(null);
    const host = makeIsolatedPreview("[同目录](other.md)");
    const detach = attachPreviewLinks(host, bare);
    const event = clickLink("同目录", bare, host);
    expect(event.defaultPrevented).toBe(true);
    expect(bare.onFile).not.toHaveBeenCalled();
    detach();
    host.remove();
  });

  it("未知协议（asset:）不导航也不分派", () => {
    // data:/javascript: 会被 markdown-it 拦下不成链接，asset: 才会渲染出 href
    const host = makeIsolatedPreview("[资源](asset://localhost/a.png)");
    const detach = attachPreviewLinks(host, actions);
    const event = clickLink("资源", actions, host);
    expect(event.defaultPrevented).toBe(true);
    expect(actions.onExternal).not.toHaveBeenCalled();
    expect(actions.onFile).not.toHaveBeenCalled();
    expect(actions.onAnchor).not.toHaveBeenCalled();
    detach();
    host.remove();
  });

  it("点击非链接区域不触发任何处理器", () => {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    document.querySelector(".preview-content p")!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(actions.onAnchor).not.toHaveBeenCalled();
    expect(actions.onExternal).not.toHaveBeenCalled();
    expect(actions.onFile).not.toHaveBeenCalled();
  });

  it("解绑后不再接管点击", () => {
    const local = makeActions();
    const host = document.querySelector<HTMLElement>(".preview-host")!;
    const detach = attachPreviewLinks(host, local);
    detach();
    clickLink("跳转", local);
    expect(local.onAnchor).not.toHaveBeenCalled();
  });
});

describe("handlePreviewClick 边界", () => {
  it("右键/中键不接管", () => {
    const actions = makeActions();
    const anchor = document.createElement("a");
    anchor.href = "#x";
    anchor.textContent = "x";
    document.body.appendChild(anchor);
    const right = new MouseEvent("click", { bubbles: true, cancelable: true, button: 2 });
    anchor.dispatchEvent(right);
    expect(handlePreviewClick(right, actions)).toBe(false);
    anchor.remove();
  });
});
