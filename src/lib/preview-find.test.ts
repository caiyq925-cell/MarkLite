import { describe, expect, it, beforeAll } from "vitest";

// 从 jsdom 拿 Node/NodeFilter，模拟真实浏览器 DOM
beforeAll(() => {});

const PREVIEW_FIND_MARK = "ml-find-hit";
const PREVIEW_FIND_ACTIVE = "ml-find-current";

// 与 App.svelte 相同的查找算法（提取出来测试）
function runFindInHost(host: HTMLElement, query: string) {
  // clear
  host.querySelectorAll(`.${PREVIEW_FIND_MARK}`).forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(m.textContent ?? ""), m);
    parent.normalize();
  });
  const q = query.trim();
  if (!q) return { count: 0, index: -1 };
  const lower = q.toLowerCase();
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (node.parentElement?.closest("script,style")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let count = 0;
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  for (const node of textNodes) {
    const text = node.nodeValue ?? "";
    let idx = text.toLowerCase().indexOf(lower);
    if (idx === -1) continue;
    const frag = document.createDocumentFragment();
    let pos = 0;
    while (idx !== -1) {
      if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)));
      const mark = document.createElement("mark");
      mark.className = PREVIEW_FIND_MARK;
      mark.textContent = text.slice(idx, idx + q.length);
      frag.appendChild(mark);
      pos = idx + q.length;
      idx = text.toLowerCase().indexOf(lower, pos);
      count++;
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    node.parentNode?.replaceChild(frag, node);
  }
  return { count, index: count > 0 ? 0 : -1 };
}

describe("preview find algorithm", () => {
  it("highlights all matches and navigates", () => {
    document.body.innerHTML = `<div id="host"><p>Hello world, hello again</p><div class="preview-content">more hello here</div></div>`;
    const host = document.getElementById("host") as HTMLElement;

    const r = runFindInHost(host, "hello");
    console.log("COUNT:", r.count);
    expect(r.count).toBe(3); // Hello, hello, hello

    const marks = host.querySelectorAll(`.${PREVIEW_FIND_MARK}`);
    console.log("MARKS IN DOM:", marks.length);
    expect(marks.length).toBe(3);

    // 模拟 stepPreviewFind 的 index 导航
    let index = 0;
    index = (index + 1 + r.count) % r.count;
    marks.forEach((m, i) => m.classList.toggle(PREVIEW_FIND_ACTIVE, i === index));
    console.log("INDEX AFTER NEXT:", index);
    expect(index).toBe(1);
    expect((marks[1] as HTMLElement).classList.contains(PREVIEW_FIND_ACTIVE)).toBe(true);
  });

  it("re-run after DOM reset still finds", () => {
    document.body.innerHTML = `<div id="h2"><p>alpha beta alpha</p></div>`;
    const host = document.getElementById("h2") as HTMLElement;
    const r1 = runFindInHost(host, "alpha");
    expect(r1.count).toBe(2);
    // 模拟 $effect 里 innerHTML 重置后重跑
    host.innerHTML = `<p>alpha beta alpha</p>`;
    const r2 = runFindInHost(host, "alpha");
    expect(r2.count).toBe(2);
  });
});
