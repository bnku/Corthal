<script lang="ts">
  import Icon from "./Icon.svelte";

  interface Props {
    x: number;
    y: number;
    folderPath?: string;
    folderTitle?: string;
    itemPath?: string;
    itemTitle?: string;
    isDir?: boolean;
    onConfigureFolder?: () => void;
    onCreateNote?: () => void;
    onCreateSubfolder?: () => void;
    onDelete?: () => void;
    onClose: () => void;
  }

  let {
    x,
    y,
    folderPath,
    folderTitle,
    itemPath,
    itemTitle,
    isDir = true,
    onConfigureFolder,
    onCreateNote,
    onCreateSubfolder,
    onDelete,
    onClose,
  }: Props = $props();

  let effectivePath = $derived(itemPath ?? folderPath ?? "");
  let effectiveTitle = $derived(itemTitle ?? folderTitle ?? effectivePath);

  function handleClickOutside(e: MouseEvent) {
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" || e.code === "Escape") {
      onClose();
    }
  }
</script>

<svelte:window onclick={handleClickOutside} onkeydown={handleKeydown} />

<div
  class="context-menu"
  style="top: {y}px; left: {x}px;"
  onclick={(e) => e.stopPropagation()}
  onkeydown={(e) => e.stopPropagation()}
  role="menu"
  tabindex="-1"
>
  <div class="menu-header">
    <Icon name={isDir ? "folder" : "file-text"} size={13} color="#94a3b8" />
    <span class="folder-name">{effectiveTitle || effectivePath}</span>
  </div>

  <div class="menu-divider"></div>

  {#if isDir}
    {#if onConfigureFolder}
      <button
        class="menu-item"
        onclick={(e) => {
          e.stopPropagation();
          onConfigureFolder();
          onClose();
        }}
        role="menuitem"
      >
        <Icon name="sliders" size={14} color="#60a5fa" />
        <span>Настроить папку (Метаданные)</span>
      </button>
    {/if}

    {#if onCreateNote}
      <button
        class="menu-item"
        onclick={(e) => {
          e.stopPropagation();
          onCreateNote();
          onClose();
        }}
        role="menuitem"
      >
        <Icon name="file-text" size={14} color="#34d399" />
        <span>Новая заметка</span>
        <span class="menu-shortcut">Ctrl+N</span>
      </button>
    {/if}

    {#if onCreateSubfolder}
      <button
        class="menu-item"
        onclick={(e) => {
          e.stopPropagation();
          onCreateSubfolder();
          onClose();
        }}
        role="menuitem"
      >
        <Icon name="folder" size={14} color="#fbbf24" />
        <span>Новая подпапка</span>
      </button>
    {/if}
  {/if}

  {#if onDelete}
    {#if isDir}
      <div class="menu-divider"></div>
    {/if}
    <button
      class="menu-item danger"
      onclick={(e) => {
        e.stopPropagation();
        onDelete();
        onClose();
      }}
      role="menuitem"
    >
      <Icon name="trash" size={14} color="#f43f5e" />
      <span>Удалить</span>
      <span class="menu-shortcut">Del</span>
    </button>
  {/if}
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 2000;
    background: var(--cortex-bg-card, #0f172a);
    border: 1px solid var(--cortex-border, rgba(148, 163, 184, 0.25));
    border-radius: 8px;
    padding: 4px;
    min-width: 220px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(8px);
    user-select: none;
    font-size: 0.82rem;
  }

  .menu-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    color: var(--cortex-fg-muted, #94a3b8);
    font-weight: 500;
    font-size: 0.76rem;
  }

  .folder-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .menu-divider {
    height: 1px;
    background: var(--cortex-border-subtle, rgba(148, 163, 184, 0.12));
    margin: 3px 0;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    border: none;
    background: transparent;
    color: var(--cortex-fg-primary, #e2e8f0);
    border-radius: 5px;
    font-size: 0.82rem;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .menu-item:hover {
    background: var(--cortex-accent-subtle, rgba(59, 130, 246, 0.15));
    color: var(--cortex-accent, #ffffff);
  }

  .menu-shortcut {
    margin-left: auto;
    font-size: 0.72rem;
    color: var(--cortex-fg-muted, #64748b);
    padding-left: 12px;
  }

  .menu-item.danger:hover {
    background: rgba(244, 63, 94, 0.15);
    color: #f43f5e;
  }
</style>
