<script lang="ts">
  import type { VaultNode } from "$lib/types";
  import VaultTree from "./VaultTree.svelte";

  interface Props {
    node: VaultNode;
    selectedPath: string | null;
    depth?: number;
    onSelectNote: (path: string) => void;
    onCreateNote?: (folderPath: string) => void;
  }

  let { node, selectedPath, depth = 0, onSelectNote, onCreateNote }: Props = $props();

  // Root or 1st-level directories default to expanded; subdirectories default to collapsed unless selected
  let isSelectedChild = $derived(
    Boolean(selectedPath && node.relative_path && selectedPath.startsWith(node.relative_path + "/"))
  );

  let userExpanded = $state<boolean | null>(null);

  // If user explicitly toggled, use that; otherwise auto-expand if root/1st level or contains active note
  let isExpanded = $derived(
    userExpanded !== null
      ? userExpanded
      : depth <= 1 || isSelectedChild || node.relative_path === ""
  );

  function toggleExpand(e: MouseEvent) {
    e.stopPropagation();
    userExpanded = !isExpanded;
  }

  function handleFileClick(path: string) {
    onSelectNote(path);
  }

  function handleNewNoteClick(e: MouseEvent) {
    e.stopPropagation();
    onCreateNote?.(node.relative_path);
  }

  // Formatting friendly names
  let folderDisplayName = $derived(
    node.title || node.name.replace(/^\d+-/, "")
  );

  let fileDisplayName = $derived(
    node.title || node.name.replace(/\.md$/, "")
  );

  let folderIcon = $derived(
    node.icon || (isExpanded ? "📂" : "📁")
  );
</script>

<div class="tree-node">
  {#if node.is_dir}
    {#if node.relative_path !== ""}
      <div
        class="dir-item"
        class:has-selected-child={isSelectedChild}
        onclick={toggleExpand}
        role="button"
        tabindex="0"
        onkeydown={(e) => e.key === "Enter" && toggleExpand(e as any)}
        title={node.title ? `${node.title} (${node.name})` : node.name}
      >
        <span class="chevron" class:expanded={isExpanded}>▶</span>
        <span class="icon">{folderIcon}</span>
        <span class="label">{folderDisplayName}</span>

        {#if onCreateNote}
          <button
            class="action-add-btn"
            title="Создать заметку в этой папке"
            onclick={handleNewNoteClick}
          >
            +
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
            depth={depth + 1}
            {onSelectNote}
            {onCreateNote}
          />
        {/each}
      </div>
    {/if}
  {:else}
    <div
      class="file-item"
      class:selected={selectedPath === node.relative_path}
      onclick={() => handleFileClick(node.relative_path)}
      role="button"
      tabindex="0"
      onkeydown={(e) => e.key === "Enter" && handleFileClick(node.relative_path)}
      title={node.title ? `${node.title} (${node.name})` : node.name}
    >
      <span class="file-icon">📄</span>
      <span class="file-name">{fileDisplayName}</span>
    </div>
  {/if}
</div>

<style>
  .tree-node {
    font-size: 0.86rem;
    user-select: none;
  }

  .dir-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-radius: 6px;
    color: #94a3b8;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.15s, color 0.15s;
    position: relative;
  }

  .dir-item:hover {
    background: rgba(255, 255, 255, 0.06);
    color: #f8fafc;
  }

  .dir-item:hover .action-add-btn {
    opacity: 1;
  }

  .chevron {
    font-size: 0.65rem;
    color: #64748b;
    display: inline-block;
    transition: transform 0.15s ease;
    width: 12px;
    text-align: center;
  }

  .chevron.expanded {
    transform: rotate(90deg);
  }

  .action-add-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 1rem;
    line-height: 1;
    padding: 0 4px;
    border-radius: 3px;
    cursor: pointer;
    opacity: 0;
    transition: all 0.15s;
  }

  .action-add-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    color: #ffffff;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 4px 18px;
    border-radius: 6px;
    color: #cbd5e1;
    cursor: pointer;
    transition: all 0.15s;
    margin: 1px 0;
  }

  .file-item:hover {
    background: rgba(255, 255, 255, 0.07);
    color: #ffffff;
  }

  .file-item.selected {
    background: #3b82f6;
    color: #ffffff;
    font-weight: 500;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .children.nested {
    padding-left: 10px;
    border-left: 1px solid rgba(148, 163, 184, 0.12);
    margin-left: 11px;
  }

  .icon,
  .file-icon {
    font-size: 0.9rem;
    flex-shrink: 0;
  }

  .label,
  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-grow: 1;
  }
</style>
