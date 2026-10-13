<script lang="ts">
  import type { VaultNode } from "$lib/types";
  import VaultTree from "./VaultTree.svelte";
  import Icon from "./Icon.svelte";
  import { t } from "$lib/i18n";

  interface Props {
    node: VaultNode;
    selectedPath: string | null;
    expandedFolders: Set<string>;
    depth?: number;
    onSelectNote: (path: string) => void;
    onSelectFolder?: (folderPath: string, node: VaultNode) => void;
    onToggleFolder: (folderPath: string) => void;
    onCreateNote?: (folderPath: string) => void;
    onFolderContextMenu?: (e: MouseEvent, node: VaultNode) => void;
    onItemContextMenu?: (e: MouseEvent, node: VaultNode) => void;
    onDeleteItem?: (node: VaultNode) => void;
  }

  let {
    node,
    selectedPath,
    expandedFolders,
    depth = 0,
    onSelectNote,
    onSelectFolder,
    onToggleFolder,
    onCreateNote,
    onFolderContextMenu,
    onItemContextMenu,
    onDeleteItem,
  }: Props = $props();

  let isSelectedChild = $derived(
    Boolean(selectedPath && node.relative_path && selectedPath.startsWith(node.relative_path + "/"))
  );

  let isExpanded = $derived(
    node.relative_path === "" || expandedFolders.has(node.relative_path)
  );

  function toggleExpand(e?: MouseEvent) {
    e?.stopPropagation();
    onToggleFolder(node.relative_path);
  }

  function handleDirClick(e: MouseEvent) {
    e.stopPropagation();
    onSelectFolder?.(node.relative_path, node);
    onToggleFolder(node.relative_path);
  }

  function handleFileClick(path: string) {
    onSelectNote(path);
  }

  function handleNewNoteClick(e: MouseEvent) {
    e.stopPropagation();
    onSelectFolder?.(node.relative_path, node);
    onCreateNote?.(node.relative_path);
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (node.is_dir) {
      onSelectFolder?.(node.relative_path, node);
    } else {
      onSelectNote(node.relative_path);
    }
    if (onItemContextMenu) {
      onItemContextMenu(e, node);
    } else {
      onFolderContextMenu?.(e, node);
    }
  }

  // Formatting friendly names
  let folderDisplayName = $derived(
    node.title || node.name.replace(/^\d+-/, "")
  );

  let fileDisplayName = $derived(
    node.title || node.name.replace(/\.md$/, "")
  );

  function getFileIcon(name: string): string {
    const ext = name.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "md":
      case "markdown":
        return "file-text";
      case "rs":
      case "js":
      case "mjs":
      case "cjs":
      case "ts":
      case "py":
      case "sh":
      case "bash":
      case "json":
      case "yaml":
      case "yml":
      case "toml":
      case "css":
      case "html":
      case "c":
      case "cpp":
      case "cs":
      case "go":
      case "sql":
      case "lua":
        return "file-code";
      default:
        return "file-text";
    }
  }

  let fileIconName = $derived(getFileIcon(node.name));

  let folderIconName = $derived(
    node.icon || (isExpanded ? "folder-open" : "folder")
  );
</script>

<div class="tree-node">
  {#if node.is_dir}
    {#if node.relative_path !== ""}
      <div
        class="dir-item"
        class:selected={selectedPath === node.relative_path}
        class:has-selected-child={isSelectedChild && selectedPath !== node.relative_path}
        onclick={handleDirClick}
        oncontextmenu={handleContextMenu}
        role="button"
        tabindex="0"
        onkeydown={(e) => {
          if (e.key === "Enter" || e.code === "Enter") {
            e.preventDefault();
            handleDirClick(e as any);
          } else if (e.code === "Delete" || e.key === "Delete") {
            e.preventDefault();
            onDeleteItem?.(node);
          }
        }}
      >
        <span class="chevron" onclick={toggleExpand} role="presentation">
          <Icon name={isExpanded ? "chevron-down" : "chevron-right"} size={13} color="#64748b" />
        </span>

        <span class="icon">
          <Icon name={folderIconName} size={15} color={node.color || "#94a3b8"} />
        </span>

        <span class="label">{folderDisplayName}</span>

        {#if onCreateNote}
          <button
            class="action-add-btn"
            aria-label={t("explorer.new_note")}
            onclick={handleNewNoteClick}
          >
            <Icon name="plus" size={13} />
          </button>
        {/if}
      </div>
    {/if}

    {#if isExpanded || node.relative_path === ""}
      <div class="children" class:nested={node.relative_path !== ""}>
        {#each node.children as child (child.relative_path)}
          <VaultTree
            node={child}
            {selectedPath}
            {expandedFolders}
            depth={depth + 1}
            {onSelectNote}
            {onSelectFolder}
            {onToggleFolder}
            {onCreateNote}
            {onFolderContextMenu}
            {onItemContextMenu}
            {onDeleteItem}
          />
        {/each}
      </div>
    {/if}
  {:else}
    <div
      class="file-item"
      class:selected={selectedPath === node.relative_path}
      onclick={() => handleFileClick(node.relative_path)}
      oncontextmenu={handleContextMenu}
      role="button"
      tabindex="0"
      onkeydown={(e) => {
        if (e.key === "Enter" || e.code === "Enter") {
          e.preventDefault();
          handleFileClick(node.relative_path);
        } else if (e.code === "Delete" || e.key === "Delete") {
          e.preventDefault();
          onDeleteItem?.(node);
        }
      }}
    >
      <span class="file-icon">
        <Icon name={fileIconName} size={14} color={selectedPath === node.relative_path ? "#ffffff" : "#94a3b8"} />
      </span>
      <span class="file-name">{fileDisplayName}</span>
    </div>
  {/if}
</div>

<style>
  .tree-node {
    font-size: 0.85rem;
    user-select: none;
  }

  .dir-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 6px;
    color: var(--corthal-fg-secondary, #94a3b8);
    cursor: pointer;
    font-weight: 500;
    transition: background 0.15s, color 0.15s;
    position: relative;
  }

  .dir-item:hover {
    background: var(--corthal-bg-hover, rgba(255, 255, 255, 0.06));
    color: var(--corthal-fg-primary, #f8fafc);
  }

  .dir-item.selected {
    background: var(--corthal-accent-subtle, rgba(59, 130, 246, 0.18));
    color: var(--corthal-accent, #38bdf8);
    font-weight: 600;
  }

  .dir-item.has-selected-child {
    color: var(--corthal-fg-primary, #f1f5f9);
  }

  .dir-item.has-selected-child > .chevron {
    color: var(--corthal-accent, #38bdf8);
  }

  .dir-item:hover .action-add-btn {
    opacity: 1;
  }

  .chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    flex-shrink: 0;
  }

  .icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .action-add-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--corthal-fg-muted, #94a3b8);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0;
    transition: all 0.15s;
  }

  .action-add-btn:hover {
    background: var(--corthal-bg-hover, rgba(255, 255, 255, 0.15));
    color: var(--corthal-fg-primary, #ffffff);
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 4px 8px 4px 20px;
    border-radius: 6px;
    color: var(--corthal-fg-secondary, #cbd5e1);
    cursor: pointer;
    transition: all 0.15s;
    margin: 1px 0;
  }

  .file-item:hover {
    background: var(--corthal-bg-hover, rgba(255, 255, 255, 0.07));
    color: var(--corthal-fg-primary, #ffffff);
  }

  .file-item.selected {
    background: var(--corthal-accent, #3b82f6);
    color: var(--corthal-accent-fg, #ffffff);
    font-weight: 500;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .file-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .children.nested {
    padding-left: 10px;
    border-left: 1px solid var(--corthal-border-subtle, rgba(148, 163, 184, 0.12));
    margin-left: 12px;
  }

  .label,
  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-grow: 1;
  }
</style>
