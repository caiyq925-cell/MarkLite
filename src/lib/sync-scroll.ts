import type { Heading } from "./types";
import type { EditorView } from "@codemirror/view";

export function syncPreviewToSource(
  view: EditorView,
  headings: Heading[],
  preview: HTMLElement,
): void {
  if (!headings.length) return;
  const scrollTop = view.scrollDOM.scrollTop;
  let current = headings[0];
  for (const h of headings) {
    const line = view.state.doc.line(Math.min(h.sourceLine + 1, view.state.doc.lines));
    const coords = view.coordsAtPos(line.from);
    if (!coords) continue;
    const y = coords.top - view.scrollDOM.getBoundingClientRect().top + scrollTop;
    if (y <= scrollTop + 24) current = h;
    else break;
  }
  const el = preview.querySelector<HTMLElement>(`#${cssEscape(current.id)}`);
  el?.scrollIntoView({ block: "start" });
}

export function syncSourceToPreview(
  view: EditorView,
  headings: Heading[],
  preview: HTMLElement,
): void {
  if (!headings.length) return;
  const nodes = headings
    .map((h) => ({ h, el: preview.querySelector<HTMLElement>(`#${cssEscape(h.id)}`) }))
    .filter((x): x is { h: Heading; el: HTMLElement } => !!x.el);
  if (!nodes.length) return;
  const top = preview.scrollTop;
  let current = nodes[0].h;
  for (const n of nodes) {
    if (n.el.offsetTop <= top + 24) current = n.h;
    else break;
  }
  const line = view.state.doc.line(Math.min(current.sourceLine + 1, view.state.doc.lines));
  view.dispatch({
    effects: EditorView.scrollIntoView(line.from, { y: "start" }),
  });
}

function cssEscape(id: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(id);
  return id.replace(/[^a-zA-Z0-9_\u00A0-\uFFFF-]/g, "\\$&");
}
