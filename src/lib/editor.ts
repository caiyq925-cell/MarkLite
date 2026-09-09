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
  /** 把当前选区包裹成旁注 ??...??；无选区时在光标处插入占位旁注 */
  insertAside: () => void;
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
  onSync?: () => void,
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
    ...(onSync
      ? [
          EditorView.updateListener.of((u) => {
            if (u.docChanged || u.selectionSet || u.viewportChanged) onSync();
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
    insertAside() {
      const { from, to, empty } = view.state.selection.main;
      const text = view.state.sliceDoc(from, to);
      // 无选区：插入 ??旁注?? 并把光标放到占位内容里
      if (empty) {
        const insert = "??旁注??";
        view.dispatch({
          changes: { from, insert },
          selection: { anchor: from + 2, head: from + 4 },
        });
        return;
      }
      // 有选区：包裹成 ??选中内容??
      const wrapped = `??${text}??`;
      view.dispatch({
        changes: { from, to, insert: wrapped },
        selection: { anchor: from + 2, head: from + 2 + text.length },
      });
      view.focus();
    },
    destroy() {
      view.destroy();
    },
  };
}
