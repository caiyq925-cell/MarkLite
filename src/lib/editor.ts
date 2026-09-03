import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { search, searchKeymap, openSearchPanel, closeSearchPanel } from "@codemirror/search";

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
): EditorHandle {
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
      view.setState(
        EditorState.create({
          doc: text,
          extensions: [
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
            ...(nextReadonly ? [] : [markdown()]),
            EditorState.readOnly.of(nextReadonly),
          ],
        }),
      );
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
