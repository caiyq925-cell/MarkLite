import { classifyLink, isMarkdownPath } from "./links";

export interface PreviewLinkActions {
  /** 当前文档绝对路径，用于解析相对链接 */
  docPath: () => string | null;
  /** 文档内锚点（不含 #），已做百分号解码 */
  onAnchor: (id: string) => void;
  onExternal: (url: string) => void;
  onFile: (path: string) => void;
}

/**
 * 处理预览区内 <a> 的点击。
 *
 * 预览内容的滚动容器是 .preview-host，而锚点的默认行为只滚 document，
 * 所以不拦截就等于"点了没反应"。因此只要 href 存在，就一律阻止默认导航
 * （外部链接和本地文件的默认导航会让 WebView 直接离开应用，界面变空白），
 * 再按类型分派处理器。返回 true 表示本次点击已接管。
 */
export function handlePreviewClick(e: MouseEvent, actions: PreviewLinkActions): boolean {
  if (e.button !== 0) return false;
  const anchor = (e.target as Element | null)?.closest?.("a[href]");
  if (!anchor) return false;
  const href = anchor.getAttribute("href") ?? "";
  if (!href.trim()) return false;
  e.preventDefault();
  const target = classifyLink(href, actions.docPath());
  if (target.kind === "anchor") actions.onAnchor(target.id);
  else if (target.kind === "external") actions.onExternal(target.url);
  else if (target.kind === "file" && isMarkdownPath(target.path)) actions.onFile(target.path);
  // 其余（未知协议、无文档路径的相对链接、非 markdown 的本地文件）只阻止导航，不做动作
  return true;
}

/** 在预览宿主元素上挂点击委托，返回解绑函数 */
export function attachPreviewLinks(host: HTMLElement, actions: PreviewLinkActions): () => void {
  const listener = (e: MouseEvent) => {
    handlePreviewClick(e, actions);
  };
  host.addEventListener("click", listener);
  return () => host.removeEventListener("click", listener);
}
