<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import type { VaultNode, HubItem } from "$lib/types";
  import { parseFrontmatter } from "$lib/frontmatter";
  import VaultTree from "$lib/components/VaultTree.svelte";
  import FolderFilterDropdown from "$lib/components/FolderFilterDropdown.svelte";
  import EditorPane from "$lib/components/EditorPane.svelte";
  import InsertSecretModal from "$lib/components/InsertSecretModal.svelte";
  import NewNoteModal from "$lib/components/NewNoteModal.svelte";
  import NewFolderModal from "$lib/components/NewFolderModal.svelte";
  import FolderSettingsModal from "$lib/components/FolderSettingsModal.svelte";
  import ContextMenu from "$lib/components/ContextMenu.svelte";
  import AssistantPanel from "$lib/components/AssistantPanel.svelte";
  import SettingsModal from "$lib/components/SettingsModal.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { themeStore } from "$lib/theme/store.svelte";

  // Vault & Tree State
  let vaultTree = $state<VaultNode | null>(null);
  let selectedHubIds = $state<string[]>(["all"]);
  let searchQuery = $state("");
  let areFoldersCollapsed = $state(false);
  let expandedFolders = $state<Set<string>>(new Set());

  function revealPathAncestors(path: string | null) {
    if (!path) return;
    const parts = path.split("/");
    if (parts.length <= 1) return;
    let current = "";
    let changed = false;
    const next = new Set(expandedFolders);
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      if (!next.has(current)) {
        next.add(current);
        changed = true;
      }
    }
    if (changed) {
      expandedFolders = next;
    }
  }

  function handleToggleFolder(folderPath: string) {
    const next = new Set(expandedFolders);
    if (next.has(folderPath)) {
      next.delete(folderPath);
    } else {
      next.add(folderPath);
    }
    expandedFolders = next;
  }

  function collectAllFolderPaths(node: VaultNode, result: string[] = []): string[] {
    if (node.is_dir && node.relative_path !== "") {
      result.push(node.relative_path);
    }
    if (node.children) {
      for (const child of node.children) {
        if (child.is_dir) {
          collectAllFolderPaths(child, result);
        }
      }
    }
    return result;
  }

  // Autosave engine
  let autosaveEnabled = $state(true);
  let autosaveTimers: Record<string, any> = {};

  function triggerAutosave(path: string) {
    if (!autosaveEnabled) return;
    if (autosaveTimers[path]) {
      clearTimeout(autosaveTimers[path]);
    }
    autosaveTimers[path] = setTimeout(() => {
      saveNote(path, true);
    }, 1000);
  }

  // Layout Toggles (VS Code style)
  let showLeftSidebar = $state(true);
  let showAssistant = $state(true);
  let isSplit = $state(false);
  let focusedPane = $state<"left" | "right">("left");

  // In-memory file cache to retain unsaved edits when switching tabs
  interface FileCacheItem {
    content: string;
    originalContent: string;
    title: string;
    isSaving: boolean;
    saveFeedback: boolean;
  }
  let fileCache = $state<Record<string, FileCacheItem>>({});

  // Editor Panes State
  let paneLeftTabs = $state<string[]>([]);
  let paneLeftActive = $state<string | null>(null);
  let paneLeftEditing = $state(false);

  let paneRightTabs = $state<string[]>([]);
  let paneRightActive = $state<string | null>(null);
  let paneRightEditing = $state(false);

  // Active path and active file based on focused pane
  let activeFilePath = $derived.by<string | null>(() => {
    if (isSplit && focusedPane === "right") {
      return paneRightActive || paneLeftActive;
    }
    return paneLeftActive || (isSplit ? paneRightActive : null);
  });

  $effect(() => {
    if (activeFilePath) {
      revealPathAncestors(activeFilePath);
    }
  });

  let activeFile = $derived<FileCacheItem | null>(
    activeFilePath && fileCache[activeFilePath] ? fileCache[activeFilePath] : null
  );

  let isAnyDirty = $derived.by<boolean>(() => {
    if (!activeFile) return false;
    return activeFile.content !== activeFile.originalContent;
  });

  function getFormatLabel(path: string | null): string {
    if (!path) return "Markdown";
    const ext = path.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "md":
      case "markdown":
        return "Markdown";
      case "rs": return "Rust";
      case "py": return "Python";
      case "js":
      case "mjs":
      case "cjs": return "JavaScript";
      case "ts":
      case "mts":
      case "cts": return "TypeScript";
      case "sh":
      case "bash": return "Shell Script";
      case "json": return "JSON";
      case "yaml":
      case "yml": return "YAML";
      case "toml": return "TOML";
      case "css": return "CSS";
      case "html": return "HTML";
      case "c":
      case "h": return "C";
      case "cpp": return "C++";
      case "cs": return "C#";
      case "go": return "Go";
      case "sql": return "SQL";
      default: return ext ? ext.toUpperCase() : "Текст";
    }
  }

  let activeFileFormat = $derived(getFormatLabel(activeFilePath));

  let editorCursorLine = $state(1);
  let editorCursorCol = $state(1);

  function handleCursorChange(line: number, col: number) {
    editorCursorLine = line;
    editorCursorCol = col;
  }

  let isCurrentEditing = $derived(
    focusedPane === "right" && isSplit ? paneRightEditing : paneLeftEditing
  );

  function handleFocusSearch() {
    showLeftSidebar = true;
    setTimeout(() => {
      document.querySelector<HTMLInputElement>(".search-input-wrap input")?.focus();
    }, 50);
  }

  // Human-readable title and breadcrumb for center header
  let activeFileTitle = $derived.by<string>(() => {
    if (!activeFilePath) return "Cortex";
    if (activeFile?.title) return activeFile.title;
    const base = activeFilePath.split("/").pop()?.replace(/\.md$/, "");
    return base || "Cortex";
  });

  let activeFileBreadcrumbs = $derived.by<string>(() => {
    if (!activeFilePath) return "База знаний";
    return activeFilePath.split("/").join("  ›  ");
  });

  // Document word/character statistics for status bar
  let docStats = $derived.by(() => {
    if (!activeFile || !activeFile.content) {
      return { words: 0, chars: 0, readTime: 0 };
    }
    const text = activeFile.content.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = text.length;
    const readTime = Math.max(1, Math.ceil(words / 200));
    return { words, chars, readTime };
  });

  // Tab definitions for Left and Right panes
  let leftTabInfos = $derived(
    paneLeftTabs.map((path) => {
      const item = fileCache[path];
      const isDirty = item ? item.content !== item.originalContent : false;
      const title = item?.title || path.split("/").pop()?.replace(/\.md$/, "") || path;
      return { path, title, isDirty };
    })
  );

  let rightTabInfos = $derived(
    paneRightTabs.map((path) => {
      const item = fileCache[path];
      const isDirty = item ? item.content !== item.originalContent : false;
      const title = item?.title || path.split("/").pop()?.replace(/\.md$/, "") || path;
      return { path, title, isDirty };
    })
  );

  // Modals state
  let isSettingsModalOpen = $state(false);
  let isSecretModalOpen = $state(false);
  let isNewNoteModalOpen = $state(false);
  let targetFolderForNewNote = $state("");
  let isNewFolderModalOpen = $state(false);
  let parentFolderForNew = $state("");
  let isFolderSettingsModalOpen = $state(false);
  let selectedFolderForSettings = $state<VaultNode | null>(null);

  // Context Menu state
  let contextMenu = $state<{
    visible: boolean;
    x: number;
    y: number;
    node: VaultNode | null;
  }>({ visible: false, x: 0, y: 0, node: null });

  // Dynamic hubs derived from root directories in vaultTree
  let hubs = $derived.by<HubItem[]>(() => {
    const list: HubItem[] = [{ id: "all", name: "Все разделы", icon: "globe" }];
    if (!vaultTree) return list;

    const dirChildren = vaultTree.children.filter((c) => c.is_dir);
    for (const child of dirChildren) {
      list.push({
        id: child.name,
        name: child.title || child.name.replace(/^\d+-/, ""),
        icon: child.icon || "folder",
        color: child.color,
        description: child.description,
      });
    }
    return list;
  });

  // Filter vault tree based on selected hubs and search query
  let filteredTree = $derived.by<VaultNode | null>(() => {
    if (!vaultTree) return null;

    const realHubsCount = hubs.filter((h) => h.id !== "all").length;
    const isAll =
      selectedHubIds.includes("all") ||
      (realHubsCount > 0 && selectedHubIds.length >= realHubsCount);

    if (isAll && !searchQuery.trim()) return vaultTree;

    let children = vaultTree.children;

    if (!isAll) {
      children = children.filter((c) => selectedHubIds.includes(c.name));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      children = filterNodesBySearch(children, q);
    }

    return {
      ...vaultTree,
      children,
    };
  });

  function filterNodesBySearch(nodes: VaultNode[], query: string): VaultNode[] {
    const res: VaultNode[] = [];
    for (const n of nodes) {
      const matchName = n.name.toLowerCase().includes(query);
      const matchTitle = n.title?.toLowerCase().includes(query);

      if (!n.is_dir && (matchName || matchTitle)) {
        res.push(n);
      } else if (n.is_dir) {
        const matchingChildren = filterNodesBySearch(n.children, query);
        if (matchingChildren.length > 0 || matchName || matchTitle) {
          res.push({ ...n, children: matchingChildren });
        }
      }
    }
    return res;
  }

  async function loadVault() {
    try {
      vaultTree = await invoke<VaultNode>("vault_get_tree");
      if (expandedFolders.size === 0 && vaultTree) {
        const initial = new Set<string>();
        for (const child of vaultTree.children) {
          if (child.is_dir) {
            initial.add(child.relative_path);
          }
        }
        expandedFolders = initial;
      }
      if (!paneLeftActive && paneLeftTabs.length === 0) {
        selectDefaultNote(vaultTree);
      }
    } catch (err: any) {
      console.error("Failed to load vault:", err);
    }
  }

  function selectDefaultNote(node: VaultNode | null) {
    if (!node) return;
    for (const child of node.children) {
      if (!child.is_dir && child.name.endsWith(".md")) {
        openNote(child.relative_path, "left");
        return;
      }
      if (child.is_dir) {
        selectDefaultNote(child);
        if (paneLeftActive) return;
      }
    }
  }

  async function loadFileIntoCache(path: string): Promise<FileCacheItem> {
    if (fileCache[path]) {
      return fileCache[path];
    }
    try {
      const raw = await invoke<string>("vault_read_file", { relativePath: path });
      const parsed = parseFrontmatter(raw);
      const title =
        parsed.frontmatter?.title ||
        path.split("/").pop()?.replace(/\.md$/, "") ||
        path;

      const item: FileCacheItem = {
        content: raw,
        originalContent: raw,
        title,
        isSaving: false,
        saveFeedback: false,
      };
      fileCache[path] = item;
      return item;
    } catch (err: any) {
      console.error("Failed to read note:", err);
      const fallback: FileCacheItem = {
        content: `# Ошибка чтения файла\n\n${err}`,
        originalContent: "",
        title: path.split("/").pop() || path,
        isSaving: false,
        saveFeedback: false,
      };
      fileCache[path] = fallback;
      return fallback;
    }
  }

  async function openNote(path: string, targetPane?: "left" | "right") {
    const pane = targetPane || (isSplit ? focusedPane : "left");
    await loadFileIntoCache(path);

    if (pane === "left") {
      if (!paneLeftTabs.includes(path)) {
        paneLeftTabs.push(path);
      }
      paneLeftActive = path;
      focusedPane = "left";
    } else {
      if (!paneRightTabs.includes(path)) {
        paneRightTabs.push(path);
      }
      paneRightActive = path;
      focusedPane = "right";
    }
  }

  function closeTab(paneId: "left" | "right", path: string) {
    if (paneId === "left") {
      const idx = paneLeftTabs.indexOf(path);
      if (idx !== -1) {
        paneLeftTabs = paneLeftTabs.filter((p) => p !== path);
        if (paneLeftActive === path) {
          paneLeftActive =
            paneLeftTabs.length > 0
              ? paneLeftTabs[Math.min(idx, paneLeftTabs.length - 1)] || null
              : null;
        }
      }
    } else {
      const idx = paneRightTabs.indexOf(path);
      if (idx !== -1) {
        paneRightTabs = paneRightTabs.filter((p) => p !== path);
        if (paneRightActive === path) {
          paneRightActive =
            paneRightTabs.length > 0
              ? paneRightTabs[Math.min(idx, paneRightTabs.length - 1)] || null
              : null;
        }
        if (paneRightTabs.length === 0) {
          isSplit = false;
          focusedPane = "left";
        }
      }
    }
  }

  async function saveNote(path?: string, silent = false) {
    const targetPath = path || activeFilePath;
    if (!targetPath) return;
    const file = fileCache[targetPath];
    if (!file) return;

    if (autosaveTimers[targetPath]) {
      clearTimeout(autosaveTimers[targetPath]);
      delete autosaveTimers[targetPath];
    }

    file.isSaving = true;
    try {
      await invoke("vault_write_file", {
        relativePath: targetPath,
        content: file.content,
      });
      file.originalContent = file.content;
      // Re-parse title in case frontmatter updated
      const parsed = parseFrontmatter(file.content);
      if (parsed.frontmatter?.title) {
        file.title = parsed.frontmatter.title;
      }
      file.saveFeedback = true;
      setTimeout(() => {
        if (file) file.saveFeedback = false;
      }, 1500);
      loadVault();
    } catch (err: any) {
      if (!silent) {
        alert("Ошибка сохранения: " + err);
      } else {
        console.error("Autosave error:", err);
      }
    } finally {
      file.isSaving = false;
    }
  }

  function toggleSplit() {
    if (!isSplit) {
      isSplit = true;
      // If right pane has no tabs, mirror or open current active note
      if (paneRightTabs.length === 0 && paneLeftActive) {
        paneRightTabs.push(paneLeftActive);
        paneRightActive = paneLeftActive;
      }
      focusedPane = "right";
    } else {
      isSplit = false;
      focusedPane = "left";
    }
  }

  function closeSplit() {
    isSplit = false;
    focusedPane = "left";
  }

  function toggleCollapseAll() {
    areFoldersCollapsed = !areFoldersCollapsed;
    if (areFoldersCollapsed) {
      expandedFolders = new Set();
    } else {
      if (vaultTree) {
        const allPaths = collectAllFolderPaths(vaultTree);
        expandedFolders = new Set(allPaths);
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    // Save: Ctrl+S
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveNote();
    }
    // New Note: Ctrl+N
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
      e.preventDefault();
      openCreateNoteDialog("");
    }
    // Close Tab: Ctrl+W
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w") {
      e.preventDefault();
      if (focusedPane === "right" && isSplit && paneRightActive) {
        closeTab("right", paneRightActive);
      } else if (paneLeftActive) {
        closeTab("left", paneLeftActive);
      }
    }
    // Search: Ctrl+F or Ctrl+P
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "f" || e.key.toLowerCase() === "p")) {
      e.preventDefault();
      handleFocusSearch();
    }
    // Settings: Ctrl+,
    if ((e.ctrlKey || e.metaKey) && e.key === ",") {
      e.preventDefault();
      isSettingsModalOpen = true;
    }
    // Toggle Split: Ctrl+\ or Ctrl+2
    if ((e.ctrlKey || e.metaKey) && (e.key === "\\" || e.key === "2")) {
      e.preventDefault();
      toggleSplit();
    }
    // Toggle Sidebar: Ctrl+B
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      showLeftSidebar = !showLeftSidebar;
    }
    // Toggle Assistant: Ctrl+J
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
      e.preventDefault();
      showAssistant = !showAssistant;
    }
  }

  function handleInsertSecretToken(encryptedToken: string) {
    if (!activeFilePath || !fileCache[activeFilePath]) {
      navigator.clipboard.writeText(encryptedToken);
      alert("Токен скопирован в буфер обмена!");
      return;
    }
    fileCache[activeFilePath].content += `\n${encryptedToken}\n`;
  }

  function handleInsertText(text: string) {
    if (!activeFilePath || !fileCache[activeFilePath]) {
      navigator.clipboard.writeText(text);
      alert("Текст скопирован в буфер обмена!");
      return;
    }
    fileCache[activeFilePath].content += "\n" + text;
  }

  function openCreateNoteDialog(folderPath = "") {
    targetFolderForNewNote = folderPath;
    isNewNoteModalOpen = true;
  }

  function openCreateFolderDialog(parentFolder = "") {
    parentFolderForNew = parentFolder;
    isNewFolderModalOpen = true;
  }

  function openFolderSettings(node: VaultNode) {
    selectedFolderForSettings = node;
    isFolderSettingsModalOpen = true;
  }

  function handleFolderContextMenu(e: MouseEvent, node: VaultNode) {
    contextMenu = {
      visible: true,
      x: Math.min(e.clientX, window.innerWidth - 240),
      y: Math.min(e.clientY, window.innerHeight - 180),
      node,
    };
  }

  async function handleNoteCreated(newPath: string) {
    await loadVault();
    openNote(newPath);
    if (focusedPane === "left") {
      paneLeftEditing = true;
    } else {
      paneRightEditing = true;
    }
  }

  async function handleFolderCreated() {
    await loadVault();
  }

  async function handleFolderMetaSaved() {
    await loadVault();
  }

  onMount(() => {
    themeStore.init();
    loadVault();
    window.addEventListener("keydown", handleKeydown);

    function preventDefaultMenu(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      e.preventDefault();
    }
    window.addEventListener("contextmenu", preventDefaultMenu);

    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("contextmenu", preventDefaultMenu);
    };
  });
</script>

<div class="cortex-app-root">
  <!-- 1. UNIFIED APP TOP TITLEBAR (Across full window) -->
  <header class="app-titlebar">
    <!-- Left: Brand + Multi-select Folder Hubs Filter -->
    <div class="titlebar-left">
      <div class="brand">
        <Icon name="brain" size={18} color="var(--cortex-accent, #38bdf8)" />
        <h1 class="brand-title">Cortex</h1>
      </div>

      <FolderFilterDropdown
        {hubs}
        {selectedHubIds}
        onSelectionChange={(ids) => (selectedHubIds = ids)}
      />
    </div>

    <!-- Center: Human-readable note title & breadcrumbs path with ellipsis -->
    <div class="titlebar-center">
      {#if activeFilePath}
        <div class="doc-header-info">
          <span class="doc-title-main" title={activeFileTitle}>{activeFileTitle}</span>
          <span class="doc-path-sub" title={activeFilePath}>{activeFileBreadcrumbs}</span>
        </div>
      {:else}
        <span class="titlebar-placeholder">База знаний не открыта</span>
      {/if}
    </div>

    <!-- Right: VS Code Layout Controls -->
    <div class="titlebar-right">
      <!-- Layout Toggles (VS Code style icons matching red box #1) -->
      <div class="layout-controls">
        <!-- Toggle Left Sidebar -->
        <button
          class="layout-btn"
          class:active={showLeftSidebar}
          onclick={() => (showLeftSidebar = !showLeftSidebar)}
          title="Скрыть/показать проводник заметок (Ctrl+B)"
          aria-label="Переключить боковую панель проводника"
        >
          <Icon name="panel-left" size={15} />
        </button>

        <!-- Toggle Split Editor Panes -->
        <button
          class="layout-btn"
          class:active={isSplit}
          onclick={toggleSplit}
          title="Разделить экран пополам / Объединить (Ctrl+\\ или Ctrl+2)"
          aria-label="Разделить редактор"
        >
          <Icon name="columns-2" size={15} />
        </button>

        <!-- Toggle Right Assistant Panel -->
        <button
          class="layout-btn"
          class:active={showAssistant}
          onclick={() => (showAssistant = !showAssistant)}
          title="Скрыть/показать панель ИИ-ассистента (Ctrl+J)"
          aria-label="Переключить панель ассистента"
        >
          <Icon name="panel-right" size={15} />
        </button>
      </div>

      <div class="divider-v"></div>

      <!-- Settings trigger -->
      <button
        class="layout-btn settings-btn"
        onclick={() => (isSettingsModalOpen = true)}
        title="Настройки темы и безопасности"
        aria-label="Открыть настройки"
      >
        <Icon name="settings" size={15} />
      </button>
    </div>
  </header>

  <!-- 2. MAIN 3-COLUMN WORKSPACE BODY -->
  <div class="app-body">
    <!-- LEFT SIDEBAR: EXPLORER -->
    {#if showLeftSidebar}
      <aside class="sidebar-explorer">
        <!-- Explorer Header with compact quick action icons (VS Code red box #3) -->
        <div class="explorer-header">
          <div class="explorer-title">
            <span>БАЗА ЗНАНИЙ</span>
          </div>

          <div class="explorer-actions">
            <button
              class="icon-action-btn"
              onclick={() => openCreateNoteDialog("")}
              title="Новая заметка"
              aria-label="Новая заметка"
            >
              <Icon name="file-plus" size={14} />
            </button>

            <button
              class="icon-action-btn"
              onclick={() => openCreateFolderDialog("")}
              title="Новая папка"
              aria-label="Новая папка"
            >
              <Icon name="folder-plus" size={14} />
            </button>

            <button
              class="icon-action-btn"
              onclick={toggleCollapseAll}
              title={areFoldersCollapsed ? "Развернуть папки" : "Свернуть все папки"}
              aria-label="Свернуть / Развернуть папки"
            >
              <Icon name={areFoldersCollapsed ? "chevrons-up-down" : "chevrons-down-up"} size={14} />
            </button>
          </div>
        </div>

        <!-- Search Box -->
        <div class="search-box">
          <div class="search-input-wrap">
            <Icon name="search" size={13} color="var(--cortex-fg-muted, #64748b)" class="search-icon" />
            <input
              type="text"
              placeholder="Поиск заметок и тегов..."
              bind:value={searchQuery}
            />
            {#if searchQuery}
              <button class="clear-search-btn" onclick={() => (searchQuery = "")}>
                <Icon name="x" size={12} />
              </button>
            {/if}
          </div>
        </div>

        <!-- File Tree -->
        <div class="tree-container">
          {#if filteredTree}
            <VaultTree
              node={filteredTree}
              selectedPath={activeFilePath}
              {expandedFolders}
              onToggleFolder={handleToggleFolder}
              onSelectNote={(p) => openNote(p)}
              onCreateNote={openCreateNoteDialog}
              onFolderContextMenu={handleFolderContextMenu}
            />
          {:else}
            <div class="loading">Загрузка базы знаний...</div>
          {/if}
        </div>
      </aside>
    {/if}

    <!-- CENTER WORKSPACE: TABS & SPLIT PANES -->
    <main class="workspace-area">
      <div class="panes-container" class:is-split={isSplit}>
        <!-- Pane 1 (Left) -->
        <EditorPane
          paneId="left"
          isFocused={focusedPane === "left"}
          tabs={leftTabInfos}
          activePath={paneLeftActive}
          content={paneLeftActive && fileCache[paneLeftActive] ? fileCache[paneLeftActive].content : ""}
          isEditing={paneLeftEditing}
          isSaving={paneLeftActive && fileCache[paneLeftActive] ? fileCache[paneLeftActive].isSaving : false}
          saveFeedback={paneLeftActive && fileCache[paneLeftActive] ? fileCache[paneLeftActive].saveFeedback : false}
          {isSplit}
          canCloseSplit={false}
          onFocusPane={() => (focusedPane = "left")}
          onSelectTab={(p) => openNote(p, "left")}
          onCloseTab={(p) => closeTab("left", p)}
          onToggleEditing={(v) => (paneLeftEditing = v)}
          onSaveNote={() => saveNote(paneLeftActive || undefined)}
          onSplitToggle={toggleSplit}
          onOpenSecretModal={() => (isSecretModalOpen = true)}
          onContentChange={(val) => {
            if (paneLeftActive && fileCache[paneLeftActive]) {
              fileCache[paneLeftActive].content = val;
              triggerAutosave(paneLeftActive);
            }
          }}
          onCursorChange={handleCursorChange}
          onTagClick={(tag) => (searchQuery = tag)}
          onOpenCreateNote={() => openCreateNoteDialog("")}
          onOpenSearch={handleFocusSearch}
          onToggleSidebar={() => (showLeftSidebar = !showLeftSidebar)}
          onToggleAssistant={() => (showAssistant = !showAssistant)}
          onOpenSettings={() => (isSettingsModalOpen = true)}
        />

        <!-- Pane 2 (Right, when split enabled) -->
        {#if isSplit}
          <div class="split-separator"></div>
          <EditorPane
            paneId="right"
            isFocused={focusedPane === "right"}
            tabs={rightTabInfos}
            activePath={paneRightActive}
            content={paneRightActive && fileCache[paneRightActive] ? fileCache[paneRightActive].content : ""}
            isEditing={paneRightEditing}
            isSaving={paneRightActive && fileCache[paneRightActive] ? fileCache[paneRightActive].isSaving : false}
            saveFeedback={paneRightActive && fileCache[paneRightActive] ? fileCache[paneRightActive].saveFeedback : false}
            {isSplit}
            canCloseSplit={true}
            onFocusPane={() => (focusedPane = "right")}
            onSelectTab={(p) => openNote(p, "right")}
            onCloseTab={(p) => closeTab("right", p)}
            onToggleEditing={(v) => (paneRightEditing = v)}
            onSaveNote={() => saveNote(paneRightActive || undefined)}
            onSplitToggle={toggleSplit}
            onCloseSplit={closeSplit}
            onOpenSecretModal={() => (isSecretModalOpen = true)}
            onContentChange={(val) => {
              if (paneRightActive && fileCache[paneRightActive]) {
                fileCache[paneRightActive].content = val;
                triggerAutosave(paneRightActive);
              }
            }}
            onCursorChange={handleCursorChange}
            onTagClick={(tag) => (searchQuery = tag)}
            onOpenCreateNote={() => openCreateNoteDialog("")}
            onOpenSearch={handleFocusSearch}
            onToggleSidebar={() => (showLeftSidebar = !showLeftSidebar)}
            onToggleAssistant={() => (showAssistant = !showAssistant)}
            onOpenSettings={() => (isSettingsModalOpen = true)}
          />
        {/if}
      </div>
    </main>

    <!-- RIGHT SIDEBAR: AI ASSISTANT -->
    {#if showAssistant}
      <aside class="sidebar-assistant">
        <AssistantPanel
          activeNotePath={activeFilePath}
          onInsertText={handleInsertText}
        />
      </aside>
    {/if}
  </div>

  <!-- 3. UNIFIED APP BOTTOM STATUS BAR (VS Code red box #4) -->
  <footer class="app-statusbar">
    <!-- Left status items -->
    <div class="statusbar-left">
      <span class="statusbar-item path-item">
        <Icon name="folder" size={12} color="var(--cortex-fg-muted)" />
        <span>~/knowledge</span>
      </span>

      <button
        class="statusbar-item statusbar-btn security-badge"
        onclick={() => (isSettingsModalOpen = true)}
        title="Асимметричное шифрование SSH X25519 активно"
      >
        <Icon name="shield-check" size={13} color="var(--cortex-accent, #38bdf8)" />
        <span>SSH X25519</span>
      </button>

      {#if selectedHubIds.length > 0 && !selectedHubIds.includes("all")}
        <span class="statusbar-item filter-tag">
          {selectedHubIds.join(", ")}
        </span>
      {/if}
    </div>

    <!-- Center: clean spacer -->
    <div class="statusbar-center"></div>

    <!-- Right status items -->
    <div class="statusbar-right">
      {#if activeFilePath && activeFile}
        {#if isCurrentEditing}
          <span class="statusbar-item cursor-pos" title="Текущая строка и столбец курсора">
            Стр {editorCursorLine}, Кол {editorCursorCol}
          </span>
          <span class="statusbar-dot">•</span>
        {/if}
        <span class="statusbar-item stat-item">
          {docStats.words} слов
        </span>
        <span class="statusbar-dot">•</span>
        <span class="statusbar-item format-item">
          {activeFileFormat}
        </span>
        <span class="statusbar-dot">•</span>
        <span class="statusbar-item save-status">
          {#if isAnyDirty}
            <span class="dirty-badge">● Не сохранено</span>
          {:else}
            <span class="clean-badge">✓ Сохранено</span>
          {/if}
        </span>
        <span class="statusbar-dot">•</span>
      {/if}

      <!-- Theme picker pill button -->
      <button
        class="statusbar-item statusbar-btn theme-btn"
        onclick={() => (isSettingsModalOpen = true)}
        title="Тема: {themeStore.currentPreset.name}"
      >
        <span class="theme-dot" style="background: var(--cortex-accent, #38bdf8);"></span>
        <span>{themeStore.currentPreset.name}</span>
      </button>
    </div>
  </footer>
</div>

<!-- Modals -->
{#if contextMenu.visible && contextMenu.node}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    folderPath={contextMenu.node.relative_path}
    folderTitle={contextMenu.node.title || contextMenu.node.name}
    onConfigureFolder={() => {
      if (contextMenu.node) openFolderSettings(contextMenu.node);
    }}
    onCreateNote={() => {
      if (contextMenu.node) openCreateNoteDialog(contextMenu.node.relative_path);
    }}
    onCreateSubfolder={() => {
      if (contextMenu.node) openCreateFolderDialog(contextMenu.node.relative_path);
    }}
    onClose={() => (contextMenu.visible = false)}
  />
{/if}

<InsertSecretModal
  isOpen={isSecretModalOpen}
  onInsert={handleInsertSecretToken}
  onClose={() => (isSecretModalOpen = false)}
/>

<NewNoteModal
  isOpen={isNewNoteModalOpen}
  targetFolder={targetFolderForNewNote}
  onCreated={handleNoteCreated}
  onClose={() => (isNewNoteModalOpen = false)}
/>

<NewFolderModal
  isOpen={isNewFolderModalOpen}
  parentFolder={parentFolderForNew}
  onCreated={handleFolderCreated}
  onClose={() => (isNewFolderModalOpen = false)}
/>

<FolderSettingsModal
  isOpen={isFolderSettingsModalOpen}
  folderNode={selectedFolderForSettings}
  onSaved={handleFolderMetaSaved}
  onClose={() => (isFolderSettingsModalOpen = false)}
/>

<SettingsModal
  isOpen={isSettingsModalOpen}
  onClose={() => (isSettingsModalOpen = false)}
/>

<style>
  :global(*) {
    user-select: none;
    -webkit-user-select: none;
  }

  :global(input),
  :global(textarea),
  :global(.editor-area),
  :global(.markdown-preview),
  :global(.markdown-preview *),
  :global(code),
  :global(pre) {
    user-select: text;
    -webkit-user-select: text;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: var(--cortex-bg-main, #090d16);
    color: var(--cortex-fg-primary, #e2e8f0);
    overflow: hidden;
  }

  .cortex-app-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background: var(--cortex-bg-main, #090d16);
  }

  /* 1. TOP TITLEBAR */
  .app-titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 38px;
    background: var(--cortex-bg-header, #080c14);
    border-bottom: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    padding: 0 12px;
    flex-shrink: 0;
    user-select: none;
    z-index: 100;
  }

  .titlebar-left {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-shrink: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .brand-title {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--cortex-fg-primary, #ffffff);
    letter-spacing: -0.3px;
  }

  .titlebar-center {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: 0 20px;
  }

  .doc-header-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 620px;
    min-width: 0;
    overflow: hidden;
  }

  .doc-title-main {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--cortex-fg-primary, #ffffff);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
    line-height: 1.2;
  }

  .doc-path-sub {
    font-size: 0.68rem;
    color: var(--cortex-fg-muted, #94a3b8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
    line-height: 1.2;
    opacity: 0.85;
  }

  .titlebar-placeholder {
    font-size: 0.8rem;
    color: var(--cortex-fg-muted, #64748b);
  }

  .titlebar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .layout-controls {
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--cortex-bg-card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
    padding: 2px;
  }

  .layout-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 24px;
    border-radius: 4px;
    background: transparent;
    border: none;
    color: var(--cortex-fg-muted, #94a3b8);
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .layout-btn:hover {
    color: var(--cortex-fg-primary, #ffffff);
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.08));
  }

  .layout-btn.active {
    color: var(--cortex-accent, #38bdf8);
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.14));
  }

  .settings-btn {
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    background: var(--cortex-bg-card, rgba(255, 255, 255, 0.05));
    border-radius: 6px;
  }

  .divider-v {
    width: 1px;
    height: 18px;
    background: var(--cortex-border-subtle, rgba(255, 255, 255, 0.1));
  }

  /* 2. MAIN APP BODY */
  .app-body {
    flex: 1;
    display: flex;
    flex-direction: row;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  /* EXPLORER SIDEBAR */
  .sidebar-explorer {
    width: 260px;
    min-width: 220px;
    background: var(--cortex-bg-sidebar, #0a111a);
    border-right: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
  }

  .explorer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--cortex-border-subtle, rgba(255, 255, 255, 0.05));
  }

  .explorer-title {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: var(--cortex-fg-muted, #94a3b8);
  }

  .explorer-actions {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .icon-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    background: transparent;
    border: none;
    color: var(--cortex-fg-muted, #94a3b8);
    cursor: pointer;
    transition: all 0.12s;
  }

  .icon-action-btn:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--cortex-fg-primary, #ffffff);
  }

  .search-box {
    padding: 8px 10px;
    background: var(--cortex-bg-sidebar, #0a111a);
  }

  .search-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-input-wrap :global(.search-icon) {
    position: absolute;
    left: 8px;
    pointer-events: none;
  }

  .search-input-wrap input {
    width: 100%;
    background: var(--cortex-bg-input, rgba(0, 0, 0, 0.25));
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    padding: 5px 26px 5px 28px;
    color: var(--cortex-fg-primary, #f8fafc);
    font-size: 0.78rem;
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.15s;
  }

  .search-input-wrap input:focus {
    border-color: var(--cortex-accent, #38bdf8);
  }

  .clear-search-btn {
    position: absolute;
    right: 6px;
    background: none;
    border: none;
    color: var(--cortex-fg-muted, #64748b);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
  }

  .clear-search-btn:hover {
    color: var(--cortex-fg-primary, #cbd5e1);
  }

  .tree-container {
    flex: 1;
    overflow-y: auto;
    padding: 4px 6px 16px;
  }

  .loading {
    padding: 16px;
    color: var(--cortex-fg-muted, #64748b);
    font-size: 0.85rem;
  }

  /* WORKSPACE AREA */
  .workspace-area {
    flex: 1;
    display: flex;
    min-width: 0;
    overflow: hidden;
    background: var(--cortex-bg-main, #090d16);
  }

  .panes-container {
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 100%;
    min-width: 0;
    overflow: hidden;
  }

  .split-separator {
    width: 2px;
    background: var(--cortex-border, rgba(255, 255, 255, 0.12));
    flex-shrink: 0;
    position: relative;
    cursor: col-resize;
  }

  /* ASSISTANT SIDEBAR */
  .sidebar-assistant {
    width: 320px;
    min-width: 280px;
    flex-shrink: 0;
    border-left: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* 3. BOTTOM STATUSBAR */
  .app-statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 24px;
    background: var(--cortex-bg-header, #080c14);
    border-top: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    padding: 0 10px;
    font-size: 0.72rem;
    color: var(--cortex-fg-muted, #94a3b8);
    flex-shrink: 0;
    user-select: none;
    z-index: 100;
  }

  .statusbar-left,
  .statusbar-center,
  .statusbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .statusbar-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .statusbar-btn {
    background: transparent;
    border: none;
    color: var(--cortex-fg-muted, #94a3b8);
    cursor: pointer;
    padding: 2px 5px;
    border-radius: 3px;
    font-size: 0.72rem;
    transition: all 0.12s;
  }

  .statusbar-btn:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--cortex-fg-primary, #ffffff);
  }

  .security-badge {
    color: var(--cortex-accent, #38bdf8);
    font-weight: 500;
  }

  .filter-tag {
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.12));
    color: var(--cortex-accent, #38bdf8);
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 0.68rem;
  }

  .statusbar-dot {
    opacity: 0.4;
  }

  .dirty-badge {
    color: #f59e0b;
    font-weight: 500;
  }

  .clean-badge {
    color: #10b981;
    font-weight: 500;
  }

  .theme-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .theme-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
</style>
