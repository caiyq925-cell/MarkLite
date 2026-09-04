<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import type { AppConfig, DocumentTab, Heading, ReadFileResult } from "./lib/types";
  import { createEditor, type EditorHandle } from "./lib/editor";
  import { extractHeadings } from "./lib/toc";
  import { renderPreview } from "./lib/preview";
  import { THEMES, ACCENTS, effectiveTheme, isDarkTheme, isTheme, accentForeground } from "./lib/theme";

  let tabs = $state<DocumentTab[]>([]);
  let activeId = $state<string | null>(null);
  let tocOpen = $state(false);
  let activeHeadingId = $state<string | null>(null);
  let tocPos = $state({ x: 8, y: 40 });
  let railRight = $state(24);
  let blockRemote = $state(false);
  let entityIntensity = $state<"aggressive" | "conservative">("aggressive");
  let entityBlacklist = $state<string[]>([]);
  let theme = $state("light");
  let followSystem = $state(true);
  let accent = $state<string | null>(null);
  let systemDark = $state(
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  let errorText = $state<string | null>(null);
  let prompt = $state<null | {
    title: string;
    body: string;
    actions: { label: string; kind?: "primary" | "danger"; run: () => void | Promise<void> }[];
  }>(null);
  let previewHtml = $state("");
  let headings = $state<Heading[]>([]);
  let encodingHint = $state("");
  let previewHost: HTMLDivElement | undefined = $state();
  let editorHost: HTMLDivElement | undefined = $state();
  let editor: EditorHandle | null = null;
  let boundId: string | null = null;
  let tocRailEl: HTMLDivElement | undefined = $state();
  let tocPanelEl: HTMLDivElement | undefined = $state();
  let tocCloseTimer = 0;
  let dragging = false;
  let splitRatio = $state(0.5);
  let sourceVisible = $state(true);
  let scrollUnlisten: (() => void) | null = null;
  let previewScrollUnlisten: (() => void) | null = null;
  let syncing = false;
  let syncTimer = 0;
  let unlistenDrag: UnlistenFn | undefined;
  let debounceHandle = 0;
  let unlistenOpen: UnlistenFn | undefined;
  let unlistenClose: UnlistenFn | undefined;
  let unlistenResized: UnlistenFn | undefined;
  let unlistenSystemTheme: (() => void) | null = null;
  let maximized = $state(false);

  function destroyEditor() {
    scrollUnlisten?.();
    scrollUnlisten = null;
    previewScrollUnlisten?.();
    previewScrollUnlisten = null;
    editor?.destroy();
    editor = null;
  }

  const active = $derived(tabs.find((t) => t.id === activeId) ?? null);
  const resolvedTheme = $derived(effectiveTheme(theme, followSystem, systemDark));
  const dark = $derived(isDarkTheme(resolvedTheme));

  // 应用主题与强调色到 <html>
  $effect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    if (accent) {
      root.style.setProperty("--accent", accent);
      root.style.setProperty("--accent-fg", accentForeground(accent));
    } else {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-fg");
    }
  });

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
      theme,
      followSystem,
      accent,
    };
    await invoke("set_config", { config: cfg });
  }

  async function loadConfig() {
    try {
      const cfg = await invoke<AppConfig>("get_config");
      blockRemote = cfg.blockRemoteImages ?? false;
      entityIntensity = cfg.entityIntensity ?? "aggressive";
      entityBlacklist = cfg.entityBlacklist ?? [];
      theme = isTheme(cfg.theme) ? cfg.theme : "light";
      followSystem = cfg.followSystem ?? true;
      accent = cfg.accent ?? null;
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
    window.clearTimeout(debounceHandle);
    debounceHandle = window.setTimeout(() => refreshPreview(), 300);
  }

  async function refreshPreview() {
    if (!active) {
      previewHtml = "";
      return;
    }
    if (active.readonlyPlain) {
      previewHtml = `<pre>${active.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`;
      return;
    }
    try {
      previewHtml = await renderPreview(active.text, {
        docDir: parentDir(active.path),
        blockRemote,
        dark,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const esc = msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      previewHtml = `<pre class="math-error">预览渲染失败：${esc}</pre>`;
    }
  }

  function jumpHeading(h: Heading) {
    activeHeadingId = h.id;
    lockSync();
    editor?.scrollToLine(h.sourceLine + 1);
    scrollPreviewToHeading(h);
  }

  // 同步锁：主动滚动后短暂锁定，避免两个方向的 scroll 事件互相触发（回声）
  function lockSync() {
    syncing = true;
    window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      syncing = false;
    }, 160);
  }

  function getPreviewHost(): HTMLElement | null {
    return document.getElementById("pane-preview")?.querySelector<HTMLElement>(".preview-host") ?? null;
  }

  // 滚动预览到指定标题（直接设置 scrollTop，避免 scrollIntoView 在嵌套滚动容器中失效）
  function scrollPreviewToHeading(h: Heading) {
    const host = getPreviewHost();
    const el = document.getElementById(h.id);
    if (!el || !host) return;
    const target = el.getBoundingClientRect().top - host.getBoundingClientRect().top + host.scrollTop;
    host.scrollTop = target;
    // 兜底：若 scrollTop 赋值未生效（某些 WebView2 嵌套滚动场景），改用 scrollIntoView
    if (Math.abs(host.scrollTop - target) > 2) {
      el.scrollIntoView({ block: "start", behavior: "auto" });
    }
  }

  // 根据源码滚动位置，找到视口顶部最近的标题
  function headingAtSourceTop(): Heading | null {
    if (!editor) return null;
    const view = editor.view;
    if (!view.state.doc.length) return null;
    const topLine = view.state.doc.lineAt(
      view.lineBlockAtHeight(view.scrollDOM.scrollTop).from,
    ).number;
    let current: Heading | null = null;
    for (const h of headings) {
      if (h.sourceLine + 1 > topLine) break;
      current = h;
    }
    return current;
  }

  // 根据预览滚动位置，找到视口顶部最近的标题
  function headingAtPreviewTop(): Heading | null {
    const host = getPreviewHost();
    if (!host) return null;
    const scrollTop = host.scrollTop;
    const hostRect = host.getBoundingClientRect();
    let current: Heading | null = null;
    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (!el || !host.contains(el)) continue;
      const top = el.getBoundingClientRect().top - hostRect.top + scrollTop;
      if (top <= scrollTop + 48) current = h;
      else break;
    }
    return current;
  }

  const TOC_PANEL_WIDTH = 260;

  // 分栏拖拽
  function onSplitMouseDown(e: MouseEvent) {
    dragging = true;
    e.preventDefault();
  }
  function onSplitMouseMove(e: MouseEvent) {
    if (!dragging) return;
    const paneLeft = document.getElementById("pane-editor");
    const paneRight = document.getElementById("pane-preview");
    if (!paneLeft || !paneRight) return;
    const totalW = paneLeft.offsetWidth + 6 + paneRight.offsetWidth;
    if (totalW === 0) return;
    const leftRect = paneLeft.getBoundingClientRect();
    const ratio = Math.min(0.8, Math.max(0.2, (e.clientX - leftRect.left) / totalW));
    paneLeft.style.flex = `${ratio} 1 0`;
    paneRight.style.flex = `${1 - ratio} 1 0`;
    splitRatio = ratio;
  }
  function onSplitMouseUp() {
    dragging = false;
  }

  // 胶囊避开编辑器原生滚动条：滚动条宽度 = offsetWidth - clientWidth
  function updateRailPos() {
    if (!editor) return;
    const sb = editor.view.scrollDOM.offsetWidth - editor.view.scrollDOM.clientWidth;
    railRight = Math.max(20, sb + 6);
  }

  function positionToc() {
    if (!tocRailEl) return;
    const rect = tocRailEl.getBoundingClientRect();
    const x = Math.max(8, rect.left - TOC_PANEL_WIDTH - 8);
    const cy = Math.min(window.innerHeight - 140, Math.max(140, rect.top + rect.height / 2));
    tocPos = { x, y: cy };
  }

  function openTocFromRail() {
    window.clearTimeout(tocCloseTimer);
    if (!tocOpen) positionToc();
    tocOpen = true;
  }

  function scheduleTocClose() {
    window.clearTimeout(tocCloseTimer);
    tocCloseTimer = window.setTimeout(() => {
      tocOpen = false;
    }, 300);
  }

  function cancelTocClose() {
    window.clearTimeout(tocCloseTimer);
  }

  function onTocPointerDown(e: PointerEvent) {
    if (!tocOpen) return;
    const target = e.target as Node;
    if (tocPanelEl?.contains(target)) return;
    if (tocRailEl?.contains(target)) return;
    tocOpen = false;
  }

  function onTocResize() {
    updateRailPos();
    if (tocOpen) positionToc();
  }

  // 源码滚动：更新大纲高亮 + 同步滚动预览
  function onSourceScroll() {
    const h = headingAtSourceTop();
    activeHeadingId = h?.id ?? null;
    if (syncing) return;
    if (h) {
      lockSync();
      scrollPreviewToHeading(h);
    }
  }

  // 预览滚动：同步滚动源码
  function onPreviewScroll() {
    if (syncing) return;
    const h = headingAtPreviewTop();
    if (h) {
      lockSync();
      editor?.scrollToLine(h.sourceLine + 1);
      activeHeadingId = h.id;
    }
  }

  // 预览内容更新：用 $effect 确保 DOM 已挂载后再设 innerHTML
  $effect(() => {
    void previewHtml;
    const panePreview = document.getElementById("pane-preview");
    if (panePreview && previewHtml) {
      const el = panePreview.querySelector<HTMLElement>(".preview-content");
      if (el) el.innerHTML = previewHtml;
    }
  });

  // 预览滚动监听：previewHost 变化时绑定，预览滚动同步源码
  $effect(() => {
    const host = previewHost;
    if (!host) return;
    host.addEventListener("scroll", onPreviewScroll, { passive: true });
    previewScrollUnlisten = () => host.removeEventListener("scroll", onPreviewScroll);
    return () => {
      previewScrollUnlisten?.();
      previewScrollUnlisten = null;
    };
  });

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
      cancelTocClose();
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

  $effect(() => {
    void active;
    void setTitle();
  });

  $effect(() => {
    const tabId = activeId;
    const tab = tabs.find((t) => t.id === tabId) ?? null;
    if (!tab) {
      destroyEditor();
      boundId = null;
      headings = [];
      tocOpen = false;
      previewHtml = "";
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
      });
      // 源码滚动时同步预览 + 高亮（只在真正滚动时触发，避免光标移动/编辑时预览跳动）
      scrollUnlisten = () => {};
      editor.view.scrollDOM.addEventListener("scroll", onSourceScroll, { passive: true });
    } else {
      editor.setText(tab.text, tab.readonlyPlain);
    }
    boundId = tab.id;
    updateRailPos();
    void refreshPreview();
  });

  onMount(async () => {
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onTocPointerDown);
    window.addEventListener("resize", onTocResize);
    window.addEventListener("mousemove", onSplitMouseMove);
    window.addEventListener("mouseup", onSplitMouseUp);
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    systemDark = mql.matches;
    const onSystemTheme = (e: MediaQueryListEvent) => {
      systemDark = e.matches;
    };
    mql.addEventListener("change", onSystemTheme);
    unlistenSystemTheme = () => mql.removeEventListener("change", onSystemTheme);
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
    // 文件拖放：使用 Tauri 原生事件，避免与窗口拖动冲突
    unlistenDrag = await win.onDragDropEvent(async (event) => {
      if (event.payload.type === "drop") {
        for (const p of event.payload.paths) await openPath(p);
      }
    });
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
    window.removeEventListener("mousemove", onSplitMouseMove);
    window.removeEventListener("mouseup", onSplitMouseUp);
    window.clearTimeout(tocCloseTimer);
    unlistenOpen?.();
    unlistenClose?.();
    unlistenResized?.();
    unlistenDrag?.();
    unlistenSystemTheme?.();
    destroyEditor();
  });
</script>

<div class="shell" role="application">
  <header class="titlebar" data-tauri-drag-region="deep">
    <div class="tb-left">
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
      <span class="brand-name">MarkLite</span>
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
        <button type="button" disabled={!active} onclick={() => (sourceVisible = !sourceVisible)}>
          {sourceVisible ? "隐藏源码" : "显示源码"}
        </button>
        <button type="button" onclick={() => { blockRemote = !blockRemote; }}>
          {blockRemote ? "允许远程图片" : "阻止远程图片"}
        </button>
        <button type="button" onclick={() => (entityIntensity = entityIntensity === "aggressive" ? "conservative" : "aggressive")}>
          实体着色: {entityIntensity === "aggressive" ? "激进" : "保守"}
        </button>
      </div>
    </div>
    <div class="menu">
      <button type="button">主题</button>
      <div class="menu-panel">
        {#each THEMES as t (t.id)}
          <button type="button" class:active={!followSystem && theme === t.id}
            onclick={() => { theme = t.id; followSystem = false; }}>
            <span>{!followSystem && theme === t.id ? "✓ " : ""}{t.name}</span>
          </button>
        {/each}
        <button type="button" class:active={followSystem} onclick={() => (followSystem = true)}>
          <span>{followSystem ? "✓ " : ""}跟随系统</span>
        </button>
        <div class="menu-sep"></div>
        <div class="menu-label">强调色</div>
        <div class="accent-row">
          {#each ACCENTS as a (a.value)}
            <button type="button" class="accent-swatch" class:selected={accent === a.value} title={a.name}
              style={`background:${a.value}`}
              onclick={() => (accent = accent === a.value ? null : a.value)}></button>
          {/each}
        </div>
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
      <div class="tb-spacer"></div>
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
      <div class="panes">
        {#if sourceVisible}
        <div id="pane-editor" class="pane pane-editor">
          <div class="pane-label"><span class="pane-label-text">源码</span></div>
          <div class="editor-host" bind:this={editorHost}></div>
        </div>
        <div class="split" onmousedown={onSplitMouseDown}></div>
        {/if}
        <div id="pane-preview" class="pane pane-preview">
          <div class="pane-label"><span class="pane-label-text">预览</span></div>
          <div class="preview-host" bind:this={previewHost}><div class="preview-content"></div></div>
        </div>
      </div>
    </div>
  {/if}

  {#if active && headings.length > 0}
    <div
      class="toc-rail"
      bind:this={tocRailEl}
      style="right:{railRight}px"
      role="navigation"
      aria-label="大纲导航"
      onmouseenter={openTocFromRail}
      onmouseleave={scheduleTocClose}
    >
      {#each headings as h (h.id)}
        <button
          type="button"
          class="rail-dot"
          class:active={h.id === activeHeadingId}
          title={h.text}
          onclick={() => jumpHeading(h)}
        ></button>
      {/each}
    </div>
  {/if}

  {#if tocOpen && active}
    <div
      class="toc-popup"
      bind:this={tocPanelEl}
      style="left:{tocPos.x}px; top:{tocPos.y}px"
      role="navigation"
      aria-label="大纲面板"
      onmouseenter={cancelTocClose}
      onmouseleave={scheduleTocClose}
    >
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
          <button class={a.kind === "primary" ? "primary" : a.kind === "danger" ? "danger" : ""} type="button" onclick={() => void a.run()}>
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
