import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { search, searchKeymap, openSearchPanel, closeSearchPanel } from "@codemirror/search";
import { inlineFencePlugin } from "./cm/inline-fence";
import { blockGutter } from "./cm/block-gutter";
import { asideMarkPlugin } from "./cm/aside-mark";
import { statusProbePlugin, computeStatusPayload } from "./cm/status-probe";
import type { EntityIntensity } from "./cm/types";
import type { StatusPayload } from "./cm/types";

export interface EditorHandle {
  view: EditorView;
  setText: (text: string, readonly: boolean) => void;
  getText: () => string;
  openFind: () => void;
  closeFind: () => void;
  scrollToLine: (line: number) => void;
  destroy: () => void;
}

export function createEditor(
  parent: HTMLElement,
  initial: string,
  onChange: (text: string) => void,
  readonly = false,
  intensity: EntityIntensity = "aggressive",
  blacklist: string[] = [],
  onStatus?: (payload: StatusPayload) => void,
): EditorHandle {
  const statusCallback = onStatus;
  const extensions = [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    search(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) onChange(u.state.doc.toString());
    }),
    EditorView.theme({
      "&": { height: "100%" },
      ".cm-scroller": { overflow: "auto" },
    }),
    // 装饰层插件
    inlineFencePlugin(),
    blockGutter(),
    asideMarkPlugin(),
    statusProbePlugin(intensity, blacklist),
    ...(statusCallback
      ? [
          EditorView.updateListener.of((u) => {
            if (u.selectionSet || u.docChanged) {
              const payload = computeStatusPayload(u.view, intensity, blacklist);
              statusCallback(payload);
            }
          }),
        ]
      : []),
  ];
  if (!readonly) extensions.push(markdown());
  extensions.push(EditorState.readOnly.of(readonly));

  const view = new EditorView({
    state: EditorState.create({
      doc: initial,
      extensions,
    }),
    parent,
  });

  return {
    view,
    setText(text, nextReadonly) {
      // 使用 dispatch 替换整个 document，避免 setState 重建视图
      const changes = { from: 0, to: view.state.doc.length, insert: text };
      view.dispatch({ changes });
    },
    getText() {
      return view.state.doc.toString();
    },
    openFind() {
      openSearchPanel(view);
    },
    closeFind() {
      closeSearchPanel(view);
    },
    scrollToLine(line) {
      const max = view.state.doc.lines;
      const n = Math.min(Math.max(1, line), max);
      const pos = view.state.doc.line(n).from;
      view.dispatch({
        selection: { anchor: pos },
        effects: EditorView.scrollIntoView(pos, { y: "start" }),
      });
    },
    destroy() {
      view.destroy();
    },
  };
}
