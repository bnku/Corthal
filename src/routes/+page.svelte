<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { marked } from "marked";
  import type { VaultNode, HubId } from "$lib/types";
  import VaultTree from "$lib/components/VaultTree.svelte";
  import SecretPill from "$lib/components/SecretPill.svelte";
  import AssistantPanel from "$lib/components/AssistantPanel.svelte";

  let vaultTree = $state<VaultNode | null>(null);
  let selectedPath = $state<string | null>(null);
  let activeHub = $state<HubId>("all");
  let noteContent = $state("");
  let isEditing = $state(false);
  let isSaving = $state(false);
  let saveFeedback = $state(false);
  let searchQuery = $state("");

  // Hub list for top navigation
  const hubs: Array<{ id: HubId; name: string; icon: string }> = [
    { id: "all", name: "Всё", icon: "🌐" },
    { id: "10-System", name: "Система", icon: "🖥️" },
    { id: "20-Work", name: "Работа", icon: "💼" },
    { id: "30-Life", name: "Жизнь", icon: "🏠" },
    { id: "40-Resources", name: "Ресурсы", icon: "📚" },
    { id: "00-Inbox", name: "Инбокс", icon: "📥" },
  ];

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
  let filteredTree = $derived(() => {
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
      if (!n.is_dir && n.name.toLowerCase().includes(query)) {
        res.push(n);
      } else if (n.is_dir) {
        const matchingChildren = filterNodesBySearch(n.children, query);
        if (matchingChildren.length > 0 || n.name.toLowerCase().includes(query)) {
          res.push({ ...n, children: matchingChildren });
        }
      }
    }
    return res;
  }

  // Parse markdown into text chunks and secret tokens
  interface ContentSlice {
    type: "text" | "secret";
    content: string;
  }

  let contentSlices = $derived(() => {
    const raw = noteContent;
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

  function handleInsertText(text: string) {
    if (isEditing) {
      noteContent += "\n" + text;
    } else {
      navigator.clipboard.writeText(text);
      alert("Токен скопирован в буфер обмена!");
    }
  }

  onMount(() => {
    loadVault();
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });
</script>

<div class="cortex-layout">
  <!-- 1. LEFT SIDEBAR: EXPLORER -->
  <aside class="sidebar">
    <div class="brand">
      <span class="logo">🧠</span>
      <h2>Cortex</h2>
    </div>

    <!-- Hub selector tabs -->
    <div class="hubs-bar">
      {#each hubs as hub}
        <button
          class="hub-btn"
          class:active={activeHub === hub.id}
          onclick={() => (activeHub = hub.id)}
          title={hub.name}
        >
          <span>{hub.icon}</span>
          <span class="hub-label">{hub.name}</span>
        </button>
      {/each}
    </div>

    <!-- Search box -->
    <div class="search-box">
      <input type="text" placeholder="Поиск заметок..." bind:value={searchQuery} />
    </div>

    <!-- File tree -->
    <div class="tree-container">
      {#if filteredTree()}
        <VaultTree
          node={filteredTree()!}
          {selectedPath}
          onSelectNote={openNote}
        />
      {:else}
        <div class="loading">Загрузка базы знаний...</div>
      {/if}
    </div>
  </aside>

  <!-- 2. CENTER PANEL: DOCUMENT WORKSPACE -->
  <main class="workspace">
    {#if selectedPath}
      <header class="doc-header">
        <div class="doc-meta">
          <span class="doc-path">{selectedPath}</span>
        </div>

        <div class="doc-actions">
          <div class="view-toggle">
            <button class:active={!isEditing} onclick={() => (isEditing = false)}>
              Просмотр
            </button>
            <button class:active={isEditing} onclick={() => (isEditing = true)}>
              Правка
            </button>
          </div>

          <button class="save-btn" onclick={saveNote} disabled={isSaving}>
            {#if saveFeedback}
              Сохранено!
            {:else if isSaving}
              ...
            {:else}
              Сохранить (Ctrl+S)
            {/if}
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
            {#each contentSlices() as slice}
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
        <span class="empty-icon">📖</span>
        <p>Выберите заметку в панели слева</p>
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

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: #090d16;
    color: #e2e8f0;
    overflow: hidden;
  }

  .cortex-layout {
    display: grid;
    grid-template-columns: 280px 1fr 340px;
    height: 100vh;
    width: 100vw;
  }

  /* SIDEBAR */
  .sidebar {
    background: #0f172a;
    border-right: 1px solid rgba(148, 163, 184, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  }

  .brand h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: #f8fafc;
  }

  .brand .logo {
    font-size: 1.3rem;
  }

  .hubs-bar {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    padding: 8px 12px;
    background: rgba(15, 23, 42, 0.6);
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  }

  .hub-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: #1e293b;
    border: 1px solid rgba(148, 163, 184, 0.15);
    color: #94a3b8;
    padding: 5px;
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .hub-btn:hover,
  .hub-btn.active {
    background: #2563eb;
    color: #ffffff;
    border-color: #3b82f6;
  }

  .hub-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .search-box {
    padding: 10px 12px;
  }

  .search-box input {
    width: 100%;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 6px 10px;
    color: #f8fafc;
    font-size: 0.8rem;
    box-sizing: border-box;
  }

  .search-box input:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .tree-container {
    flex: 1;
    overflow-y: auto;
    padding: 6px 12px 16px;
  }

  .loading {
    padding: 16px;
    color: #64748b;
    font-size: 0.85rem;
  }

  /* WORKSPACE */
  .workspace {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #090d16;
    overflow: hidden;
  }

  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 24px;
    background: #0b1120;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  }

  .doc-path {
    font-size: 0.85rem;
    color: #94a3b8;
    font-family: ui-monospace, SFMono-Regular, monospace;
  }

  .doc-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .view-toggle {
    display: flex;
    background: #1e293b;
    border-radius: 5px;
    padding: 2px;
  }

  .view-toggle button {
    background: transparent;
    border: none;
    color: #94a3b8;
    padding: 4px 12px;
    font-size: 0.8rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .view-toggle button.active {
    background: #3b82f6;
    color: #ffffff;
  }

  .save-btn {
    background: #10b981;
    border: none;
    color: #ffffff;
    font-weight: 500;
    padding: 5px 14px;
    border-radius: 5px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .save-btn:hover {
    background: #059669;
  }

  .doc-body {
    flex: 1;
    overflow-y: auto;
    padding: 24px 32px;
  }

  .editor-area {
    width: 100%;
    height: 100%;
    background: transparent;
    border: none;
    color: #f1f5f9;
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
    color: #e2e8f0;
  }

  .markdown-preview :global(h1) {
    font-size: 1.8rem;
    color: #f8fafc;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    padding-bottom: 8px;
    margin-top: 0;
  }

  .markdown-preview :global(h2) {
    font-size: 1.35rem;
    color: #f1f5f9;
    margin-top: 28px;
  }

  .markdown-preview :global(h3) {
    font-size: 1.15rem;
    color: #e2e8f0;
  }

  .markdown-preview :global(p) {
    margin: 14px 0;
  }

  .markdown-preview :global(ul), .markdown-preview :global(ol) {
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

  .markdown-preview :global(th), .markdown-preview :global(td) {
    border: 1px solid rgba(148, 163, 184, 0.2);
    padding: 8px 12px;
    text-align: left;
  }

  .markdown-preview :global(th) {
    background: rgba(30, 41, 59, 0.6);
  }

  .markdown-preview :global(pre) {
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 6px;
    padding: 14px;
    overflow-x: auto;
  }

  .markdown-preview :global(code) {
    background: rgba(30, 41, 59, 0.6);
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
    color: #64748b;
  }

  .empty-icon {
    font-size: 3rem;
    margin-bottom: 12px;
  }

  /* ASSISTANT PANE */
  .assistant-pane {
    height: 100%;
    overflow: hidden;
  }
</style>
