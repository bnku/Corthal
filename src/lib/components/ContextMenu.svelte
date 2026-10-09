<script lang="ts">
  import Icon from "./Icon.svelte";

  interface Props {
    x: number;
    y: number;
    folderPath: string;
    folderTitle: string;
    onConfigureFolder: () => void;
    onCreateNote: () => void;
    onCreateSubfolder: () => void;
    onClose: () => void;
  }

  let {
    x,
    y,
    folderPath,
    folderTitle,
    onConfigureFolder,
    onCreateNote,
    onCreateSubfolder,
    onClose,
  }: Props = $props();

  function handleClickOutside(e: MouseEvent) {
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
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
    <Icon name="folder" size={13} color="#94a3b8" />
    <span class="folder-name">{folderTitle || folderPath}</span>
  </div>

  <div class="menu-divider"></div>

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
  </button>

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
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 2000;
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.25);
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
    color: #94a3b8;
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
    background: rgba(148, 163, 184, 0.12);
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
    color: #e2e8f0;
    border-radius: 5px;
    font-size: 0.82rem;
    text-align: left;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .menu-item:hover {
    background: rgba(59, 130, 246, 0.15);
    color: #ffffff;
  }
</style>
