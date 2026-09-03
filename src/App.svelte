<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import type { AppConfig, DocumentTab, Heading, ReadFileResult } from "./lib/types";
  import { createEditor, type EditorHandle } from "./lib/editor";
  import { extractHeadings } from "./lib/toc";
  import { renderPreview } from "./lib/preview";
  import { syncPreviewToSource, syncSourceToPreview } from "./lib/sync-scroll";
  import { openUrl } from "@tauri-apps/plugin-opener";

  let tabs = $state<DocumentTab[]>([]);
  let activeId = $state<string | null>(null);
  let splitRatio = $state(0.5);
  let tocVisible = $state(true);
  let blockRemote = $state(false);
  let sourceVisible = $state(true);
  let previewVisible = $state(true);
  let errorText = $state<string | null>(null);
  let prompt = $state<null | {
    title: string;
    body: string;
    actions: { label: string; kind?: "primary" | "danger"; run: () => void | Promise<void> }[];
  }>(null);
  let previewHtml = $state("");
  let headings = $state<Heading[]>([]);
  let encodingHint = $state("");
  let editorHost: HTMLDivElement | undefined = $state();
  let previewHost: HTMLDivElement | undefined = $state();
  let editor: EditorHandle | null = null;
  let boundId: string | null = null;
  let dragging = false;
  let syncing = false;
  let debounceHandle = 0;
  let unlistenOpen: UnlistenFn | undefined;
  let unlistenClose: UnlistenFn | undefined;

  const active = $derived(tabs.find((t) => t.id === activeId) ?? null);
  const dark = $derived(
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  function id(): string {
    return crypto.randomUUID();
  }

  function titleOf(path: string): string {
    return path.split(/[/\\]/).pop() || path;
  }

  function parentDir(path: string): string {
    const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    return i >= 0 ? path.slice(0, i) : path;
  }

  function ellipsisPath(path: string): string {
    if (path.length <= 64) return path;
    return `${path.slice(0, 20)}…${path.slice(-36)}`;
  }

  async function setTitle() {
    const win = getCurrentWindow();
    if (!active) {
      await win.setTitle("MarkLite");
      return;
    }
    const star = active.dirty ? "*" : "";
    await win.setTitle(`MarkLite — ${star}${active.title}`);
  }

  async function persistConfig() {
    const win = getCurrentWindow();
    const pos = await win.outerPosition();
    const size = await win.innerSize();
    const maximized = await win.isMaximized();
    const cfg: AppConfig = {
      window: { x: pos.x, y: pos.y, w: size.width, h: size.height, maximized },
      splitRatio,
      tocVisible,
      blockRemoteImages: blockRemote,
    };
    await invoke("set_config", { config: cfg });
  }

  async function loadConfig() {
    try {
      const cfg = await invoke<AppConfig>("get_config");
      splitRatio = Math.min(0.8, Math.max(0.2, cfg.splitRatio ?? 0.5));
      tocVisible = cfg.tocVisible ?? true;
      blockRemote = cfg.blockRemoteImages ?? false;
    } catch {
      /* keep defaults */
    }
  }

  async function openPath(path: string, force = false) {
    const canonHint = path;
    const existing = tabs.find((t) => t.path === canonHint || t.path.toLowerCase() === path.toLowerCase());
    if (existing && !force) {
      activeId = existing.id;
      return;
    }
    try {
      const result = await invoke<ReadFileResult>("read_file", { path, force });
      const found = tabs.find((t) => t.path === result.path);
      if (found) {
        activeId = found.id;
        return;
      }
      const tab: DocumentTab = {
        id: id(),
        path: result.path,
        title: titleOf(result.path),
        text: result.text,
        lastSavedText: result.text,
        encoding: result.encoding,
        bom: result.bom,
        newline: result.newline,
        dirty: false,
        size: result.size,
        readonlyPlain: force && result.size > 10 * 1024 * 1024,
      };
      tabs = [...tabs, tab];
      activeId = tab.id;
      encodingHint =
        result.encoding === "gbk" ? "已按 GBK 打开，保存将写 UTF-8" : result.bom ? "UTF-8 BOM" : "UTF-8";
      await invoke("set_asset_root", { dir: parentDir(result.path) });
    } catch (e) {
      const msg = String(e);
      if (msg.includes("文件过大") || msg.toLowerCase().includes("file too large")) {
        prompt = {
          title: "文件过大",
          body: `${titleOf(path)} 超过 10 MiB。是否仍以纯文本只读方式打开？`,
          actions: [
            { label: "取消", run: () => (prompt = null) },
            {
              label: "只读打开",
              kind: "primary",
              run: async () => {
                prompt = null;
                await openPath(path, true);
              },
            },
          ],
        };
        return;
      }
      errorText = msg;
    }
  }

  async function chooseOpen() {
    try {
      const paths = await invoke<string[]>("pick_open");
      for (const p of paths) await openPath(p);
    } catch (e) {
      errorText = String(e);
    }
  }

  async function saveActive(saveAs = false) {
    if (!active) return;
    let path = active.path;
    if (saveAs) {
      const picked = await invoke<string | null>("pick_save", { defaultPath: active.title });
      if (!picked) return;
      path = picked;
    }
    try {
      await invoke("write_file", {
        path,
        text: active.text,
        bom: active.bom,
        newline: active.newline,
      });
      tabs = tabs.map((t) =>
        t.id === active.id
          ? {
              ...t,
              path,
              title: titleOf(path),
              lastSavedText: t.text,
              dirty: false,
              encoding: "utf-8",
            }
          : t,
      );
      encodingHint = active.bom ? "UTF-8 BOM" : "UTF-8";
      await invoke("set_asset_root", { dir: parentDir(path) });
    } catch (e) {
      errorText = String(e);
    }
  }

  function requestClose(tab: DocumentTab) {
    if (!tab.dirty) {
      closeTab(tab.id);
      return;
    }
    prompt = {
      title: "未保存的更改",
      body: `${tab.title} 有未保存的更改，是否保存？`,
      actions: [
        {
          label: "取消",
          run: () => {
            prompt = null;
          },
        },
        {
          label: "不保存",
          kind: "danger",
          run: () => {
            prompt = null;
            closeTab(tab.id);
          },
        },
        {
          label: "保存",
          kind: "primary",
          run: async () => {
            prompt = null;
            activeId = tab.id;
            await saveActive(false);
            const latest = tabs.find((t) => t.id === tab.id);
            if (latest && !latest.dirty) closeTab(tab.id);
          },
        },
      ],
    };
  }

  function closeTab(tid: string) {
    const idx = tabs.findIndex((t) => t.id === tid);
    tabs = tabs.filter((t) => t.id !== tid);
    if (activeId === tid) {
      activeId = tabs[idx]?.id ?? tabs[idx - 1]?.id ?? null;
    }
  }

  async function closeWindowFlow(): Promise<boolean> {
    while (tabs.some((t) => t.dirty)) {
      const dirty = tabs.find((t) => t.dirty)!;
      const ok = await new Promise<boolean>((resolve) => {
        prompt = {
          title: "未保存的更改",
          body: `${dirty.title} 有未保存的更改，是否保存？`,
          actions: [
            {
              label: "取消",
              run: () => {
                prompt = null;
                resolve(false);
              },
            },
            {
              label: "不保存",
              kind: "danger",
              run: () => {
                prompt = null;
                closeTab(dirty.id);
                resolve(true);
              },
            },
            {
              label: "保存",
              kind: "primary",
              run: async () => {
                prompt = null;
                activeId = dirty.id;
                await saveActive(false);
                const latest = tabs.find((t) => t.id === dirty.id);
                if (latest && !latest.dirty) closeTab(dirty.id);
                resolve(!(latest && latest.dirty));
              },
            },
          ],
        };
      });
      if (!ok) return false;
    }
    return true;
  }

  function onText(text: string) {
    if (!active) return;
    tabs = tabs.map((t) =>
      t.id === active.id ? { ...t, text, dirty: text !== t.lastSavedText } : t,
    );
    window.clearTimeout(debounceHandle);
    debounceHandle = window.setTimeout(() => refreshPreview(), 300);
  }

  async function refreshPreview() {
    if (!active) {
      previewHtml = "";
      headings = [];
      return;
    }
    headings = extractHeadings(active.text);
    if (active.readonlyPlain) {
      previewHtml = `<pre>${escapeHtml(active.text)}</pre>`;
      return;
    }
    previewHtml = await renderPreview(active.text, {
      docDir: parentDir(active.path),
      blockRemote,
      dark,
    });
  }

  function escapeHtml(s: string): string {
    return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }

  function jumpHeading(h: Heading) {
    editor?.scrollToLine(h.sourceLine + 1);
    const el = previewHost?.querySelector(`#${CSS.escape(h.id)}`);
    el?.scrollIntoView({ block: "start" });
  }

  function onSplitDown(e: MouseEvent) {
    dragging = true;
    e.preventDefault();
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragging) return;
    const panes = document.querySelector(".panes");
    if (!panes) return;
    const rect = panes.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    splitRatio = Math.min(0.8, Math.max(0.2, ratio));
  }

  function onMouseUp() {
    dragging = false;
  }

  function nextTab() {
    if (!tabs.length) return;
    const i = tabs.findIndex((t) => t.id === activeId);
    activeId = tabs[(i + 1) % tabs.length].id;
  }

  async function printPreview() {
    window.print();
  }

  async function onPreviewClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const a = target.closest("a");
    if (!a) return;
    const href = a.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
      e.preventDefault();
      try {
        await openUrl(href);
      } catch {
        /* ignore */
      }
    }
  }

  function onKey(e: KeyboardEvent) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === "o") {
      e.preventDefault();
      void chooseOpen();
    } else if (ctrl && e.shiftKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void saveActive(true);
    } else if (ctrl && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void saveActive(false);
    } else if (ctrl && e.key.toLowerCase() === "w") {
      e.preventDefault();
      if (active) requestClose(active);
    } else if (ctrl && e.key === "Tab") {
      e.preventDefault();
      nextTab();
    } else if (ctrl && e.key.toLowerCase() === "f") {
      e.preventDefault();
      editor?.openFind();
    }
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files ?? [])];
    for (const f of files) {
      const p = (f as File & { path?: string }).path;
      if (p) await openPath(p);
    }
  }

  $effect(() => {
    void active;
    void setTitle();
  });

  function attachScroll(handle: EditorHandle) {
    handle.view.scrollDOM.addEventListener("scroll", () => {
      if (syncing || !previewHost) return;
      syncing = true;
      syncPreviewToSource(handle.view, headings, previewHost);
      syncing = false;
    });
  }

  $effect(() => {
    const tabId = activeId;
    const tab = tabs.find((t) => t.id === tabId) ?? null;
    if (!tab) {
      editor?.destroy();
      editor = null;
      boundId = null;
      previewHtml = "";
      headings = [];
      return;
    }
    encodingHint =
      tab.encoding === "gbk" ? "已按 GBK 打开，保存将写 UTF-8" : tab.bom ? "UTF-8 BOM" : "UTF-8";
    headings = extractHeadings(tab.text);
    void refreshPreview();
    void invoke("set_asset_root", { dir: parentDir(tab.path) });

    if (!editorHost) return;
    if (boundId === tab.id) {
      if (editor && editor.view.dom.parentElement !== editorHost) {
        editorHost.appendChild(editor.view.dom);
        editor.view.requestMeasure();
      }
      return;
    }
    if (!editor) {
      editor = createEditor(editorHost, tab.text, onText, tab.readonlyPlain);
      attachScroll(editor);
    } else {
      editor.setText(tab.text, tab.readonlyPlain);
    }
    boundId = tab.id;
  });

  onMount(async () => {
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    await loadConfig();
    try {
      const argv = await invoke<string[]>("get_argv");
      for (const a of argv) {
        if (/\.(md|markdown|mdown)$/i.test(a)) await openPath(a);
      }
    } catch {
      /* web preview */
    }
    unlistenOpen = await listen<string[]>("open-files", async (ev) => {
      for (const p of ev.payload ?? []) await openPath(p);
    });
    const win = getCurrentWindow();
    unlistenClose = await win.onCloseRequested(async (event) => {
      event.preventDefault();
      const ok = await closeWindowFlow();
      if (!ok) return;
      try {
        await persistConfig();
      } catch {
        /* ignore */
      }
      try {
        await invoke("exit_app");
      } catch {
        try {
          await win.destroy();
        } catch {
          /* ignore */
        }
      }
    });
  });

  onDestroy(() => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    unlistenOpen?.();
    unlistenClose?.();
    editor?.destroy();
  });
</script>

<div class="shell" ondragover={(e) => e.preventDefault()} ondrop={onDrop} role="application">
  <div class="menubar">
    <div class="menu">
      <button type="button">文件</button>
      <div class="menu-panel">
        <button type="button" onclick={() => void chooseOpen()}>打开<kbd>Ctrl+O</kbd></button>
        <button type="button" disabled={!active} onclick={() => void saveActive(false)}>保存<kbd>Ctrl+S</kbd></button>
        <button type="button" disabled={!active} onclick={() => void saveActive(true)}>另存为<kbd>Ctrl+Shift+S</kbd></button>
        <button type="button" disabled={!active} onclick={() => void printPreview()}>打印</button>
      </div>
    </div>
    <div class="menu">
      <button type="button">视图</button>
      <div class="menu-panel">
        <button type="button" onclick={() => (tocVisible = !tocVisible)}>大纲</button>
        <button type="button" onclick={() => (sourceVisible = !sourceVisible)}>源码</button>
        <button type="button" onclick={() => (previewVisible = !previewVisible)}>预览</button>
        <button type="button" onclick={() => { blockRemote = !blockRemote; void refreshPreview(); }}>
          {blockRemote ? "允许远程图片" : "阻止远程图片"}
        </button>
      </div>
    </div>
    <div class="menu">
      <button type="button">帮助</button>
      <div class="menu-panel">
        <button type="button" onclick={() => { errorText = "MarkLite 0.1.0 — 离线 Markdown 阅读与轻编辑"; }}>关于</button>
      </div>
    </div>
  </div>

  <div class="tabs">
    {#each tabs as tab (tab.id)}
      <div class="tab" class:active={tab.id === activeId}>
        <button type="button" onclick={() => (activeId = tab.id)}>
          {tab.dirty ? "*" : ""}{tab.title}
        </button>
        <button class="close" type="button" aria-label="关闭" onclick={() => requestClose(tab)}>×</button>
      </div>
    {/each}
  </div>

  {#if !active}
    <div class="empty">
      <h1>MarkLite</h1>
      <p>打开本地 Markdown 文档，或把文件拖到此窗口。</p>
      <button class="primary" type="button" onclick={() => void chooseOpen()}>打开文件</button>
    </div>
  {:else}
    <div class="workspace">
      {#if tocVisible}
        <aside class="toc">
          <h2>大纲</h2>
          {#each headings as h}
            <button type="button" style="padding-left:{6 + (h.level - 1) * 10}px" onclick={() => jumpHeading(h)}>
              {h.text}
            </button>
          {:else}
            <p>没有标题</p>
          {/each}
        </aside>
      {/if}
      <div class="panes">
        {#if sourceVisible}
          <div class="pane" style="flex:{previewVisible ? splitRatio : 1}">
            <div class="pane-label">源码</div>
            <div class="editor-host" bind:this={editorHost}></div>
          </div>
        {/if}
        {#if sourceVisible && previewVisible}
          <div
            class="split"
            role="separator"
            aria-orientation="vertical"
            tabindex="0"
            onmousedown={onSplitDown}
          ></div>
        {/if}
        {#if previewVisible}
          <div class="pane" style="flex:{sourceVisible ? 1 - splitRatio : 1}">
            <div class="pane-label">预览</div>
            <div
              class="preview-host"
              bind:this={previewHost}
              onclick={onPreviewClick}
              onscroll={() => {
                if (syncing || !editor || !previewHost) return;
                syncing = true;
                syncSourceToPreview(editor.view, headings, previewHost);
                syncing = false;
              }}
            >
              {@html previewHtml}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <div class="status">
    <span class="path" title={active?.path ?? ""}>{active ? ellipsisPath(active.path) : "未打开文档"}</span>
    <span>{encodingHint}</span>
    <span>{active ? `${active.text.length} 字符` : ""}</span>
  </div>
</div>

{#if prompt}
  <div class="dialog-backdrop">
    <div class="dialog" role="dialog" aria-modal="true">
      <h2>{prompt.title}</h2>
      <p>{prompt.body}</p>
      <div class="dialog-actions">
        {#each prompt.actions as a}
          <button class={a.kind === "primary" ? "primary" : ""} type="button" onclick={() => void a.run()}>
            {a.label}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

{#if errorText}
  <div class="dialog-backdrop">
    <div class="dialog" role="alertdialog">
      <h2>提示</h2>
      <p>{errorText}</p>
      <div class="dialog-actions">
        <button class="primary" type="button" onclick={() => (errorText = null)}>确定</button>
      </div>
    </div>
  </div>
{/if}
