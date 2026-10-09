<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { marked } from "marked";
  import type { VaultNode, HubItem } from "$lib/types";
  import { parseFrontmatter } from "$lib/frontmatter";
  import VaultTree from "$lib/components/VaultTree.svelte";
  import SecretPill from "$lib/components/SecretPill.svelte";
  import PropertiesBlock from "$lib/components/PropertiesBlock.svelte";
  import InsertSecretModal from "$lib/components/InsertSecretModal.svelte";
  import NewNoteModal from "$lib/components/NewNoteModal.svelte";
  import NewFolderModal from "$lib/components/NewFolderModal.svelte";
  import FolderSettingsModal from "$lib/components/FolderSettingsModal.svelte";
  import ContextMenu from "$lib/components/ContextMenu.svelte";
  import AssistantPanel from "$lib/components/AssistantPanel.svelte";
  import SettingsModal from "$lib/components/SettingsModal.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { themeStore } from "$lib/theme/store.svelte";

  let vaultTree = $state<VaultNode | null>(null);
  let selectedPath = $state<string | null>(null);
  let activeHub = $state<string>("all");
  let noteContent = $state("");
  let isEditing = $state(false);
  let isSaving = $state(false);
  let saveFeedback = $state(false);
  let searchQuery = $state("");
  let showAssistant = $state(true);

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

  // Dynamically derive hubs list from root children in vaultTree
  let hubs = $derived.by<HubItem[]>(() => {
    const list: HubItem[] = [{ id: "all", name: "Всё", icon: "globe" }];
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

  async function loadVault() {
    try {
      vaultTree = await invoke<VaultNode>("vault_get_tree");
      // If nothing selected, select the first note found
      if (!selectedPath) {
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
        openNote(child.relative_path);
        return;
      }
      if (child.is_dir) {
        selectDefaultNote(child);
        if (selectedPath) return;
      }
    }
  }

  async function openNote(path: string) {
    selectedPath = path;
    try {
      noteContent = await invoke<string>("vault_read_file", { relativePath: path });
    } catch (err: any) {
      alert("Не удалось прочитать заметку: " + err);
    }
  }

  async function saveNote() {
    if (!selectedPath) return;
    isSaving = true;
    try {
      await invoke("vault_write_file", {
        relativePath: selectedPath,
        content: noteContent,
      });
      saveFeedback = true;
      setTimeout(() => (saveFeedback = false), 2000);
      loadVault();
    } catch (err: any) {
      alert("Ошибка сохранения: " + err);
    } finally {
      isSaving = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      saveNote();
    }
  }

  // Filter vault tree based on active hub and search
  let filteredTree = $derived.by<VaultNode | null>(() => {
    if (!vaultTree) return null;
    if (activeHub === "all" && !searchQuery.trim()) return vaultTree;

    let children = vaultTree.children;

    if (activeHub !== "all") {
      children = children.filter((c) => c.name === activeHub);
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

  // Parse YAML Frontmatter & Body
  let parsedDoc = $derived(parseFrontmatter(noteContent));

  // Parse markdown body into text chunks and secret tokens
  interface ContentSlice {
    type: "text" | "secret";
    content: string;
  }

  let contentSlices = $derived.by<ContentSlice[]>(() => {
    const raw = parsedDoc.body;
    const slices: ContentSlice[] = [];
    const regex = /(`?🔒\[enc:v1:[A-Za-z0-9+/=]+\]`?)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(raw)) !== null) {
      if (match.index > lastIndex) {
        slices.push({
          type: "text",
          content: raw.slice(lastIndex, match.index),
        });
      }
      slices.push({
        type: "secret",
        content: match[1],
      });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < raw.length) {
      slices.push({
        type: "text",
        content: raw.slice(lastIndex),
      });
    }

    return slices;
  });

  function handleInsertSecretToken(encryptedToken: string) {
    if (isEditing) {
      noteContent += `\n${encryptedToken}\n`;
    } else {
      navigator.clipboard.writeText(encryptedToken);
      alert("Токен скопирован в буфер обмена!");
    }
  }

  function handleInsertText(text: string) {
    if (isEditing) {
      noteContent += "\n" + text;
    } else {
      navigator.clipboard.writeText(text);
      alert("Токен скопирован в буфер обмена!");
    }
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
    isEditing = true;
  }

  async function handleFolderCreated(createdPath: string) {
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

<div class="cortex-layout" class:hide-assistant={!showAssistant}>
  <!-- 1. LEFT SIDEBAR: EXPLORER -->
  <aside class="sidebar">
    <div class="sidebar-top">
      <div class="brand">
        <Icon name="brain" size={20} color="#60a5fa" />
        <h2>Cortex</h2>
      </div>

      <div class="sidebar-top-actions">
        <button
          class="sidebar-action-btn"
          aria-label="Создать заметку"
          onclick={() => openCreateNoteDialog(activeHub !== "all" ? activeHub : "")}
        >
          <Icon name="plus" size={13} />
          <span>Заметка</span>
        </button>

        <button
          class="sidebar-action-btn folder-btn"
          aria-label="Создать папку"
          onclick={() => openCreateFolderDialog(activeHub !== "all" ? activeHub : "")}
        >
          <Icon name="folder" size={13} />
          <span>Папка</span>
        </button>
      </div>
    </div>

    <!-- Dynamic Hubs Bar -->
    <div class="hubs-bar">
      {#each hubs as hub}
        <button
          class="hub-btn"
          class:active={activeHub === hub.id}
          onclick={() => (activeHub = hub.id)}
          aria-label={hub.name}
        >
          <Icon name={hub.icon} size={14} color={hub.color || (activeHub === hub.id ? "#ffffff" : "#94a3b8")} />
          <span class="hub-label">{hub.name}</span>
        </button>
      {/each}
    </div>

    <!-- Search box -->
    <div class="search-box">
      <div class="search-input-wrap">
        <Icon name="search" size={13} color="#64748b" class="search-icon" />
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

    <!-- File tree -->
    <div class="tree-container">
      {#if filteredTree}
        <VaultTree
          node={filteredTree}
          {selectedPath}
          onSelectNote={openNote}
          onCreateNote={openCreateNoteDialog}
          onFolderContextMenu={handleFolderContextMenu}
        />
      {:else}
        <div class="loading">Загрузка базы знаний...</div>
      {/if}
    </div>

    <!-- Sidebar Footer -->
    <div class="sidebar-footer">
      <button class="settings-trigger-btn" onclick={() => (isSettingsModalOpen = true)}>
        <Icon name="settings" size={14} color="var(--cortex-accent)" />
        <span>Настройки</span>
      </button>
      <button
        class="theme-pill"
        onclick={() => (isSettingsModalOpen = true)}
        title="Оформление: {themeStore.currentPreset.name}"
      >
        <span class="theme-accent-indicator" style="background: var(--cortex-accent);"></span>
        <span class="theme-pill-name">{themeStore.currentPreset.name}</span>
      </button>
    </div>
  </aside>

  <!-- 2. CENTER PANEL: DOCUMENT WORKSPACE -->
  <main class="workspace">
    {#if selectedPath}
      <header class="doc-header">
        <div class="doc-meta">
          <Icon name="file-text" size={14} color="#64748b" />
          <span class="doc-path">{selectedPath}</span>
        </div>

        <div class="doc-actions">
          {#if isEditing}
            <button
              class="action-btn insert-secret-btn"
              aria-label="Зашифровать и вставить секрет"
              onclick={() => (isSecretModalOpen = true)}
            >
              <Icon name="lock" size={13} color="#f59e0b" />
              <span>Вставить секрет</span>
            </button>
          {/if}

          <div class="view-toggle">
            <button class:active={!isEditing} onclick={() => (isEditing = false)}>
              <Icon name="eye" size={13} />
              <span>Просмотр</span>
            </button>
            <button class:active={isEditing} onclick={() => (isEditing = true)}>
              <Icon name="file-edit" size={13} />
              <span>Правка</span>
            </button>
          </div>

          <button class="save-btn" onclick={saveNote} disabled={isSaving}>
            <Icon name="check" size={13} />
            <span>
              {#if saveFeedback}
                Сохранено!
              {:else if isSaving}
                Сохранение...
              {:else}
                Сохранить (Ctrl+S)
              {/if}
            </span>
          </button>

          <button
            class="action-btn toggle-assistant-btn"
            class:active={showAssistant}
            onclick={() => (showAssistant = !showAssistant)}
            aria-label="Показать или скрыть ИИ-панель"
          >
            <Icon name="bot" size={14} />
            <span>{showAssistant ? "Скрыть ИИ" : "ИИ"}</span>
          </button>
        </div>
      </header>

      <div class="doc-body">
        {#if isEditing}
          <textarea
            class="editor-area"
            bind:value={noteContent}
            placeholder="Пишите в формате Markdown..."
          ></textarea>
        {:else}
          <div class="markdown-preview">
            <!-- Obsidian Properties Block -->
            {#if parsedDoc.frontmatter && Object.keys(parsedDoc.frontmatter).length > 0}
              <PropertiesBlock
                properties={parsedDoc.frontmatter}
                onTagClick={(tag) => (searchQuery = tag)}
              />
            {/if}

            <!-- Note Content Body -->
            {#each contentSlices as slice}
              {#if slice.type === "secret"}
                <SecretPill token={slice.content} />
              {:else}
                {@html marked.parse(slice.content)}
              {/if}
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <div class="empty-state">
        <Icon name="book-open" size={48} color="#334155" />
        <p>Выберите заметку в панели слева или создайте новую</p>
        <button class="create-hero-btn" onclick={() => openCreateNoteDialog("")}>
          <Icon name="plus" size={15} />
          <span>Создать заметку</span>
        </button>
      </div>
    {/if}
  </main>

  <!-- 3. RIGHT PANEL: ASSISTANT -->
  <aside class="assistant-pane">
    <AssistantPanel
      activeNotePath={selectedPath}
      onInsertText={handleInsertText}
    />
  </aside>
</div>

<!-- Context Menu -->
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

<!-- Modals -->
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
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: var(--cortex-bg-main, #090d16);
    color: var(--cortex-fg-primary, #e2e8f0);
    overflow: hidden;
  }

  .cortex-layout {
    display: grid;
    grid-template-columns: 260px 1fr 320px;
    height: 100vh;
    width: 100vw;
    transition: grid-template-columns 0.2s ease;
  }

  .cortex-layout.hide-assistant {
    grid-template-columns: 260px 1fr 0px;
  }

  .cortex-layout.hide-assistant .assistant-pane {
    display: none;
  }

  /* SIDEBAR */
  .sidebar {
    background: var(--cortex-bg-sidebar, #0f172a);
    border-right: 1px solid var(--cortex-border, rgba(148, 163, 184, 0.15));
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--cortex-border-subtle, rgba(148, 163, 184, 0.08));
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .brand h2 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--cortex-fg-primary, #f8fafc);
    letter-spacing: -0.3px;
  }

  .sidebar-top-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sidebar-action-btn {
    background: var(--cortex-bg-card, rgba(30, 41, 59, 0.7));
    border: 1px solid var(--cortex-border, rgba(148, 163, 184, 0.2));
    color: var(--cortex-fg-secondary, #cbd5e1);
    height: 24px;
    padding: 0 7px;
    border-radius: 5px;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.74rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .sidebar-action-btn:hover {
    background: var(--cortex-accent-subtle, rgba(59, 130, 246, 0.2));
    border-color: var(--cortex-accent, #3b82f6);
    color: var(--cortex-fg-primary, #ffffff);
  }

  .sidebar-action-btn.folder-btn:hover {
    background: rgba(245, 158, 11, 0.2);
    border-color: #f59e0b;
  }

  .hubs-bar {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    padding: 8px 10px;
    background: var(--cortex-bg-header, rgba(15, 23, 42, 0.6));
    border-bottom: 1px solid var(--cortex-border-subtle, rgba(148, 163, 184, 0.1));
  }

  .hub-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 6px;
    background: var(--cortex-bg-card, rgba(30, 41, 59, 0.4));
    border: 1px solid transparent;
    color: var(--cortex-fg-secondary, #94a3b8);
    border-radius: 5px;
    font-size: 0.76rem;
    cursor: pointer;
    transition: all 0.15s;
    overflow: hidden;
  }

  .hub-btn:hover {
    background: var(--cortex-bg-hover, rgba(30, 41, 59, 0.8));
    color: var(--cortex-fg-primary, #f1f5f9);
  }

  .hub-btn.active {
    background: var(--cortex-accent, #2563eb);
    color: var(--cortex-accent-fg, #ffffff);
    border-color: var(--cortex-accent, #3b82f6);
    font-weight: 500;
  }

  .hub-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-box {
    padding: 8px 10px;
    background: var(--cortex-bg-sidebar, #0f172a);
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
    background: var(--cortex-bg-input, #1e293b);
    border: 1px solid var(--cortex-border, #334155);
    border-radius: 6px;
    padding: 5px 26px 5px 28px;
    color: var(--cortex-fg-primary, #f8fafc);
    font-size: 0.78rem;
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.15s;
  }

  .search-input-wrap input:focus {
    border-color: var(--cortex-accent, #3b82f6);
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
    padding: 6px 8px 16px;
  }

  .sidebar-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--cortex-bg-header, #0b1120);
    border-top: 1px solid var(--cortex-border-subtle, rgba(148, 163, 184, 0.08));
    gap: 8px;
  }

  .settings-trigger-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: var(--cortex-fg-secondary, #94a3b8);
    font-size: 0.78rem;
    font-weight: 500;
    padding: 4px 8px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .settings-trigger-btn:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--cortex-fg-primary, #ffffff);
  }

  .theme-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--cortex-bg-card, rgba(30, 41, 59, 0.5));
    border: 1px solid var(--cortex-border-subtle, rgba(148, 163, 184, 0.1));
    border-radius: 12px;
    padding: 3px 8px;
    font-size: 0.72rem;
    color: var(--cortex-fg-secondary, #cbd5e1);
    cursor: pointer;
    transition: all 0.15s;
    max-width: 120px;
  }

  .theme-pill:hover {
    border-color: var(--cortex-accent, #3b82f6);
    background: var(--cortex-accent-subtle, rgba(59, 130, 246, 0.15));
  }

  .theme-accent-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .theme-pill-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .loading {
    padding: 16px;
    color: var(--cortex-fg-muted, #64748b);
    font-size: 0.85rem;
  }

  /* WORKSPACE */
  .workspace {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--cortex-bg-main, #090d16);
    overflow: hidden;
  }

  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 24px;
    background: var(--cortex-bg-header, #0b1120);
    border-bottom: 1px solid var(--cortex-border, rgba(148, 163, 184, 0.12));
  }

  .doc-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .doc-path {
    font-size: 0.82rem;
    color: var(--cortex-fg-secondary, #94a3b8);
    font-family: ui-monospace, SFMono-Regular, monospace;
  }

  .doc-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: var(--cortex-bg-card, rgba(30, 41, 59, 0.7));
    border: 1px solid var(--cortex-border, rgba(148, 163, 184, 0.2));
    color: var(--cortex-fg-secondary, #cbd5e1);
    padding: 5px 10px;
    border-radius: 5px;
    font-size: 0.76rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn:hover {
    background: var(--cortex-accent-subtle, rgba(59, 130, 246, 0.2));
    border-color: var(--cortex-accent, #3b82f6);
    color: var(--cortex-fg-primary, #ffffff);
  }

  .view-toggle {
    display: flex;
    background: var(--cortex-bg-card, #1e293b);
    border-radius: 5px;
    padding: 2px;
  }

  .view-toggle button {
    display: flex;
    align-items: center;
    gap: 5px;
    background: transparent;
    border: none;
    color: var(--cortex-fg-secondary, #94a3b8);
    padding: 4px 10px;
    font-size: 0.76rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .view-toggle button.active {
    background: var(--cortex-accent, #3b82f6);
    color: var(--cortex-accent-fg, #ffffff);
  }

  .save-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #10b981;
    border: none;
    color: #ffffff;
    font-weight: 500;
    padding: 5px 12px;
    border-radius: 5px;
    font-size: 0.76rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .save-btn:hover {
    background: #059669;
  }

  .doc-body {
    flex: 1;
    overflow-y: auto;
    padding: 24px 36px;
  }

  .editor-area {
    width: 100%;
    height: 100%;
    background: transparent;
    border: none;
    color: var(--cortex-fg-primary, #f1f5f9);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
    font-size: 0.92rem;
    line-height: 1.6;
    resize: none;
    outline: none;
    box-sizing: border-box;
  }

  .markdown-preview {
    max-width: 860px;
    line-height: 1.7;
    font-size: 0.98rem;
    color: var(--cortex-fg-primary, #e2e8f0);
  }

  .markdown-preview :global(h1) {
    font-size: 1.8rem;
    color: var(--cortex-fg-primary, #f8fafc);
    border-bottom: 1px solid var(--cortex-border, rgba(148, 163, 184, 0.2));
    padding-bottom: 8px;
    margin-top: 0;
  }

  .markdown-preview :global(h2) {
    font-size: 1.35rem;
    color: var(--cortex-fg-primary, #f1f5f9);
    margin-top: 28px;
  }

  .markdown-preview :global(h3) {
    font-size: 1.15rem;
    color: var(--cortex-fg-secondary, #e2e8f0);
  }

  .markdown-preview :global(p) {
    margin: 14px 0;
  }

  .markdown-preview :global(blockquote) {
    border-left: 4px solid var(--cortex-accent, #3b82f6);
    margin: 16px 0;
    padding: 10px 16px;
    background: var(--cortex-bg-card, rgba(30, 41, 59, 0.35));
    border-radius: 0 8px 8px 0;
    color: var(--cortex-fg-secondary, #cbd5e1);
  }

  .markdown-preview :global(ul),
  .markdown-preview :global(ol) {
    padding-left: 24px;
  }

  .markdown-preview :global(li) {
    margin: 6px 0;
  }

  .markdown-preview :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
  }

  .markdown-preview :global(th),
  .markdown-preview :global(td) {
    border: 1px solid var(--cortex-border, rgba(148, 163, 184, 0.2));
    padding: 8px 12px;
    text-align: left;
  }

  .markdown-preview :global(th) {
    background: var(--cortex-bg-card, rgba(30, 41, 59, 0.6));
  }

  .markdown-preview :global(pre) {
    background: var(--cortex-bg-input, #0f172a);
    border: 1px solid var(--cortex-border-subtle, rgba(148, 163, 184, 0.15));
    border-radius: 6px;
    padding: 14px;
    overflow-x: auto;
  }

  .markdown-preview :global(code) {
    background: var(--cortex-bg-card, rgba(30, 41, 59, 0.6));
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.88em;
    font-family: ui-monospace, SFMono-Regular, monospace;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--cortex-fg-muted, #64748b);
    gap: 12px;
  }

  .create-hero-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--cortex-accent, #3b82f6);
    border: none;
    color: var(--cortex-accent-fg, #ffffff);
    font-weight: 500;
    padding: 8px 18px;
    border-radius: 6px;
    font-size: 0.88rem;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .create-hero-btn:hover {
    opacity: 0.9;
  }

  /* ASSISTANT PANE */
  .assistant-pane {
    height: 100%;
    overflow: hidden;
  }
</style>
