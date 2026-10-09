<script lang="ts">
  import type { VaultNode } from "$lib/types";
  import VaultTree from "./VaultTree.svelte";

  interface Props {
    node: VaultNode;
    selectedPath: string | null;
    onSelectNote: (path: string) => void;
  }

  let { node, selectedPath, onSelectNote }: Props = $props();

  let isExpanded = $state(true);

  function toggleExpand(e: MouseEvent) {
    e.stopPropagation();
    isExpanded = !isExpanded;
  }

  function handleFileClick(path: string) {
    onSelectNote(path);
  }
</script>

<div class="tree-node">
  {#if node.is_dir}
    {#if node.relative_path !== ""}
      <div class="dir-item" onclick={toggleExpand} role="button" tabindex="0" onkeydown={(e) => e.key === 'Enter' && toggleExpand(e as any)}>
        <span class="icon">{isExpanded ? "📂" : "📁"}</span>
        <span class="label">{node.name}</span>
      </div>
    {/if}

    {#if isExpanded || node.relative_path === ""}
      <div class="children" class:nested={node.relative_path !== ""}>
        {#each node.children as child (child.relative_path)}
          <VaultTree
            node={child}
            {selectedPath}
            {onSelectNote}
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
      onkeydown={(e) => e.key === 'Enter' && handleFileClick(node.relative_path)}
    >
      <span class="file-icon">📄</span>
      <span class="file-name">{node.name.replace(/\.md$/, "")}</span>
    </div>
  {/if}
</div>

<style>
  .tree-node {
    font-size: 0.88rem;
    user-select: none;
  }

  .dir-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 4px;
    color: #94a3b8;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.15s, color 0.15s;
  }

  .dir-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #f1f5f9;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 4px 12px;
    border-radius: 4px;
    color: #cbd5e1;
    cursor: pointer;
    transition: all 0.15s;
  }

  .file-item:hover {
    background: rgba(255, 255, 255, 0.07);
    color: #ffffff;
  }

  .file-item.selected {
    background: #3b82f6;
    color: #ffffff;
    font-weight: 500;
  }

  .children.nested {
    padding-left: 14px;
    border-left: 1px solid rgba(148, 163, 184, 0.15);
    margin-left: 8px;
  }

  .icon, .file-icon {
    font-size: 0.9rem;
  }

  .label, .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
