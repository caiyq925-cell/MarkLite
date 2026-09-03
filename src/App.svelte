<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import type { AppConfig, DocumentTab, Heading, ReadFileResult } from "./lib/types";
  import { createEditor, type EditorHandle } from "./lib/editor";
  import { extractHeadings } from "./lib/toc";

  let tabs = $state<DocumentTab[]>([]);
  let activeId = $state<string | null>(null);
  let tocOpen = $state(false);
  let activeHeadingId = $state<string | null>(null);
  let tocPos = $state({ x: 8, y: 40 });
  let blockRemote = $state(false);
  let entityIntensity = $state<"aggressive" | "conservative">("aggressive");
  let entityBlacklist = $state<string[]>([]);
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
  let editor: EditorHandle | null = null;
  let boundId: string | null = null;
  let tocTriggerEl: HTMLButtonElement | undefined = $state();
  let tocPanelEl: HTMLDivElement | undefined = $state();
  let debounceHandle = 0;
  let unlistenOpen: UnlistenFn | undefined;
  let unlistenClose: UnlistenFn | undefined;
  let unlistenResized: UnlistenFn | undefined;
  let maximized = $state(false);

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
      splitRatio: 0.5,
      blockRemoteImages: blockRemote,
      entityIntensity,
      entityBlacklist,
    };
    await invoke("set_config", { config: cfg });
  }

  async function loadConfig() {
    try {
      const cfg = await invoke<AppConfig>("get_config");
      blockRemote = cfg.blockRemoteImages ?? false;
      entityIntensity = cfg.entityIntensity ?? "aggressive";
      entityBlacklist = cfg.entityBlacklist ?? [];
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
            { label: "取消", run: () => { prompt = null; } },
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
    const nextTab = tabs[idx + 1];
    const prevTab = tabs[idx - 1];
    tabs = tabs.filter((t) => t.id !== tid);
    if (activeId === tid) {
      activeId = nextTab?.id ?? prevTab?.id ?? null;
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
  }

  function jumpHeading(h: Heading) {
    editor?.scrollToLine(h.sourceLine + 1);
  }

  const TOC_PANEL_WIDTH = 260;

  function positionToc() {
    const rect = tocTriggerEl?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(8, Math.min(rect.left, window.innerWidth - TOC_PANEL_WIDTH - 8));
    tocPos = { x, y: rect.bottom + 4 };
  }

  function toggleToc() {
    if (!tocOpen) positionToc();
    tocOpen = !tocOpen;
  }

  function onTocPointerDown(e: PointerEvent) {
    if (!tocOpen) return;
    const target = e.target as Node;
    if (tocPanelEl?.contains(target)) return;
    if (tocTriggerEl?.contains(target)) return;
    tocOpen = false;
  }

  function onTocResize() {
    if (tocOpen) positionToc();
  }

  // 滚动同步：以编辑区视口顶部所在行为准，高亮其上方最近的标题
  function syncTocHighlight() {
    if (!editor) {
      activeHeadingId = null;
      return;
    }
    const view = editor.view;
    if (!view.state.doc.length) {
      activeHeadingId = null;
      return;
    }
    const topLine = view.state.doc.lineAt(
      view.lineBlockAtHeight(view.scrollDOM.scrollTop).from,
    ).number;
    let current: Heading | null = null;
    for (const h of headings) {
      if (h.sourceLine + 1 > topLine) break;
      current = h;
    }
    activeHeadingId = current?.id ?? null;
  }

  // 高亮项变化时，保证弹层内当前标题可见
  $effect(() => {
    if (!tocOpen || !activeHeadingId || !tocPanelEl) return;
    tocPanelEl.querySelector<HTMLElement>(".toc-item.active")?.scrollIntoView({ block: "nearest" });
  });

  function nextTab() {
    if (!tabs.length) return;
    const i = tabs.findIndex((t) => t.id === activeId);
    activeId = tabs[(i + 1) % tabs.length].id;
  }

  async function printPreview() {
    window.print();
  }

  function minimizeWindow() {
    void getCurrentWindow().minimize();
  }

  function toggleMaximizeWindow() {
    void getCurrentWindow().toggleMaximize();
  }

  // 走 close() 以触发 onCloseRequested 的未保存检查流程
  function closeWindow() {
    void getCurrentWindow().close();
  }

  function onZoomMouseDown(e: MouseEvent) {
    e.preventDefault();
  }

  function onZoomMouseMove(e: MouseEvent) {
    e.preventDefault();
  }

  function onZoomMouseUp() {
    // no-op
  }

  function onKey(e: KeyboardEvent) {
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.key === "Escape" && tocOpen) {
      tocOpen = false;
      return;
    }
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

  $effect(() => {
    const tabId = activeId;
    const tab = tabs.find((t) => t.id === tabId) ?? null;
    if (!tab) {
      editor?.destroy();
      editor = null;
      boundId = null;
      headings = [];
      tocOpen = false;
      return;
    }
    encodingHint =
      tab.encoding === "gbk" ? "已按 GBK 打开，保存将写 UTF-8" : tab.bom ? "UTF-8 BOM" : "UTF-8";
    headings = extractHeadings(tab.text);
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
      editor = createEditor(editorHost, tab.text, onText, tab.readonlyPlain, entityIntensity, entityBlacklist, (payload) => {
        const el = document.getElementById("status-info");
        if (el) el.textContent = payload.rawSnippet || "";
      }, () => syncTocHighlight());
    } else {
      editor.setText(tab.text, tab.readonlyPlain);
    }
    boundId = tab.id;
  });

  onMount(async () => {
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onTocPointerDown);
    window.addEventListener("resize", onTocResize);
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
    try {
      maximized = await win.isMaximized();
      unlistenResized = await win.onResized(async () => {
        maximized = await getCurrentWindow().isMaximized();
      });
    } catch {
      /* web preview */
    }
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
    window.removeEventListener("pointerdown", onTocPointerDown);
    window.removeEventListener("resize", onTocResize);
    unlistenOpen?.();
    unlistenClose?.();
    unlistenResized?.();
    editor?.destroy();
  });
</script>

<div class="shell" ondragover={(e) => e.preventDefault()} ondrop={onDrop} role="application">
  <header class="titlebar" data-tauri-drag-region>
    <div class="tb-left" data-tauri-drag-region>
      <svg class="brand-logo" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="1" y="1" width="22" height="22" rx="6" fill="var(--accent)" />
        <path
          d="M7 16.5v-9l5 5 5-5v9"
          fill="none"
          stroke="var(--accent-fg)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <span class="brand-name" data-tauri-drag-region>MarkLite</span>
    </div>

    <div class="menus">
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
        <button type="button" bind:this={tocTriggerEl} onclick={() => toggleToc()}>大纲</button>
        <button type="button" onclick={() => { blockRemote = !blockRemote; }}>
          {blockRemote ? "允许远程图片" : "阻止远程图片"}
        </button>
        <button type="button" onclick={() => (entityIntensity = entityIntensity === "aggressive" ? "conservative" : "aggressive")}>
          实体着色: {entityIntensity === "aggressive" ? "激进" : "保守"}
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

    <div class="tb-right">
      <div class="tb-spacer" data-tauri-drag-region></div>
      <div class="win-controls">
        <button type="button" title="最小化" onclick={minimizeWindow}>
          <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 5.5h8" stroke="currentColor" stroke-width="1" /></svg>
        </button>
        <button type="button" title={maximized ? "还原" : "最大化"} onclick={toggleMaximizeWindow}>
          {#if maximized}
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <rect x="1" y="3" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1" />
              <path d="M3.5 3V1h5.5v5.5H7" fill="none" stroke="currentColor" stroke-width="1" />
            </svg>
          {:else}
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1" />
            </svg>
          {/if}
        </button>
        <button type="button" class="close" title="关闭" onclick={closeWindow}>
          <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1" /></svg>
        </button>
      </div>
    </div>
  </header>

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
      <div class="editor-full">
        <div class="editor-host" bind:this={editorHost}></div>
      </div>
    </div>
  {/if}

  {#if tocOpen && active}
    <div class="toc-popup" bind:this={tocPanelEl} style="left:{tocPos.x}px; top:{tocPos.y}px">
      <div class="toc-header">
        <h2>大纲</h2>
        <button class="toc-close" type="button" title="关闭大纲" onclick={() => (tocOpen = false)}>×</button>
      </div>
      <div class="toc-body">
        {#each headings as h (h.id)}
          <button
            class="toc-item"
            class:active={h.id === activeHeadingId}
            type="button"
            style="padding-left:{6 + (h.level - 1) * 10}px"
            onclick={() => jumpHeading(h)}
          >
            {h.text}
          </button>
        {:else}
          <p>没有标题</p>
        {/each}
      </div>
    </div>
  {/if}

  <div class="status">
    <span class="path" title={active?.path ?? ""}>{active ? ellipsisPath(active.path) : "未打开文档"}</span>
    <span>{encodingHint}</span>
    <span id="status-info"></span>
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
