/**
 * 预览区代码块"复制"按钮的点击委托。
 *
 * 按钮由 preview.ts 的 wrapCodeBlocks 注入，本身不挂任何事件；
 * 这里在预览宿主上做委托：点击 .code-copy 时把同容器 <pre> 的代码写入剪贴板。
 * 同时写入 text/plain（纯代码文本）和 text/html（把实时计算样式内联进克隆节点），
 * 粘贴到 Word/WPS/邮件等富文本目标时能保留语法高亮配色（所见即所得，含深浅色主题）。
 */

const COPIED_RESET_MS = 1600;

function pushStyle(parts: string[], prop: string, value: string | undefined | false): void {
  if (value) parts.push(`${prop}: ${value};`);
}

/**
 * 把源节点的实时计算样式内联到克隆节点上。
 * 预览查找会在代码里插入 <mark>，克隆侧已剥掉，因此按双指针配对时源侧的 mark 不消耗克隆子元素。
 */
function inlineComputedStyles(src: Element, dst: Element, isRoot: boolean): void {
  const cs = window.getComputedStyle(src);
  const parts: string[] = [];
  pushStyle(parts, "color", cs.color);
  pushStyle(parts, "background-color", cs.backgroundColor);
  pushStyle(parts, "font-style", cs.fontStyle);
  pushStyle(parts, "font-weight", cs.fontWeight);
  if (isRoot) {
    pushStyle(parts, "font-family", cs.fontFamily);
    pushStyle(parts, "font-size", cs.fontSize);
    pushStyle(parts, "line-height", cs.lineHeight);
    pushStyle(parts, "padding", cs.padding);
    pushStyle(parts, "border-radius", cs.borderRadius);
    // 粘贴目标不一定按 <pre> 排版，显式声明折行行为
    pushStyle(parts, "white-space", "pre-wrap");
  }
  if (parts.length) dst.setAttribute("style", parts.join(" "));
  const srcKids = [...src.children];
  const dstKids = [...dst.children];
  let di = 0;
  for (const sk of srcKids) {
    if (sk.tagName === "MARK") continue;
    const dk = dstKids[di++];
    if (dk) inlineComputedStyles(sk, dk, false);
  }
}

/** 构造富文本 HTML：克隆 <pre>、剥掉查找高亮 <mark>、内联计算样式 */
export function buildCodeCopyHtml(pre: HTMLElement): string {
  const clone = pre.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("mark").forEach((m) => m.replaceWith(...m.childNodes));
  inlineComputedStyles(pre, clone, true);
  return clone.outerHTML;
}

async function writeClipboard(plain: string, html: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write(
        new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      );
      return true;
    }
  } catch {
    /* 富文本写入失败（权限/不支持）时降级为纯文本 */
  }
  try {
    await navigator.clipboard.writeText(plain);
    return true;
  } catch {
    return false;
  }
}

/** 复制按钮所在 .code-block 里的代码；成功返回 true */
export async function copyCodeBlock(btn: HTMLElement): Promise<boolean> {
  const pre = btn.closest(".code-block")?.querySelector("pre");
  if (!pre) return false;
  const code = pre.querySelector("code");
  // markdown-it 渲染出的 code 末尾带一个换行，复制时去掉
  const plain = (code?.textContent ?? pre.textContent ?? "").replace(/\n$/, "");
  return writeClipboard(plain, buildCodeCopyHtml(pre));
}

/** 在预览宿主上挂复制按钮的点击委托，返回解绑函数 */
export function attachCodeCopy(host: HTMLElement): () => void {
  const timers = new Map<HTMLElement, number>();
  const onClick = (e: MouseEvent) => {
    const btn = (e.target as Element | null)?.closest?.<HTMLElement>(".code-copy");
    if (!btn || !host.contains(btn)) return;
    e.preventDefault();
    void copyCodeBlock(btn).then((ok) => {
      if (!ok) return;
      btn.classList.add("copied");
      window.clearTimeout(timers.get(btn));
      timers.set(
        btn,
        window.setTimeout(() => {
          btn.classList.remove("copied");
          timers.delete(btn);
        }, COPIED_RESET_MS),
      );
    });
  };
  host.addEventListener("click", onClick);
  return () => {
    host.removeEventListener("click", onClick);
    timers.forEach((t) => window.clearTimeout(t));
    timers.clear();
  };
}
