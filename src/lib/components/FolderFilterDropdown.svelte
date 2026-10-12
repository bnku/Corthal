<script lang="ts">
  import type { HubItem } from "$lib/types";
  import Icon from "./Icon.svelte";

  interface Props {
    hubs: HubItem[];
    selectedHubIds: string[];
    onSelectionChange: (selectedIds: string[]) => void;
  }

  let { hubs, selectedHubIds, onSelectionChange }: Props = $props();

  let isOpen = $state(false);
  let filterText = $state("");

  // Only consider folder hubs (excluding "all" entry if present in list)
  let realHubs = $derived(hubs.filter((h) => h.id !== "all"));

  // Check if all are selected
  let isAllSelected = $derived(
    selectedHubIds.includes("all") || (realHubs.length > 0 && selectedHubIds.length === realHubs.length)
  );

  let filteredHubs = $derived.by(() => {
    if (!filterText.trim()) return realHubs;
    const q = filterText.toLowerCase();
    return realHubs.filter(
      (h) => h.name.toLowerCase().includes(q) || h.id.toLowerCase().includes(q)
    );
  });

  let buttonLabel = $derived.by(() => {
    if (isAllSelected) {
      return `Все разделы (${realHubs.length})`;
    }
    if (selectedHubIds.length === 0) {
      return `Разделы не выбраны (0)`;
    }
    if (selectedHubIds.length === 1) {
      const match = realHubs.find((h) => h.id === selectedHubIds[0]);
      return match ? match.name : selectedHubIds[0];
    }
    const first = realHubs.find((h) => h.id === selectedHubIds[0]);
    const firstName = first ? first.name : selectedHubIds[0];
    return `${firstName} (+${selectedHubIds.length - 1})`;
  });

  function closeDropdown() {
    if (isOpen) {
      isOpen = false;
      // If user closed popover with no sections selected, restore all to prevent impossible state
      if (selectedHubIds.length === 0) {
        onSelectionChange(["all"]);
      }
    }
  }

  function toggleDropdown(e: MouseEvent) {
    e.stopPropagation();
    if (isOpen) {
      closeDropdown();
    } else {
      isOpen = true;
      filterText = "";
    }
  }

  function handleSelectAll() {
    onSelectionChange(["all"]);
  }

  function handleClearAll() {
    onSelectionChange([]);
  }

  function toggleAllHubs() {
    if (isAllSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(["all"]);
    }
  }

  function toggleHub(id: string) {
    if (isAllSelected) {
      // If was "all", clicking one unchecks it and leaves the rest checked
      const remaining = realHubs.map((h) => h.id).filter((item) => item !== id);
      onSelectionChange(remaining);
      return;
    }

    if (selectedHubIds.includes(id)) {
      const next = selectedHubIds.filter((item) => item !== id);
      onSelectionChange(next);
    } else {
      const next = [...selectedHubIds, id];
      if (next.length === realHubs.length) {
        onSelectionChange(["all"]);
      } else {
        onSelectionChange(next);
      }
    }
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (target && !target.closest(".hub-filter-container")) {
      closeDropdown();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen) {
      closeDropdown();
    }
  }

  $effect(() => {
    if (isOpen) {
      window.addEventListener("click", handleClickOutside);
      window.addEventListener("keydown", handleKeydown);
      return () => {
        window.removeEventListener("click", handleClickOutside);
        window.removeEventListener("keydown", handleKeydown);
      };
    }
  });
</script>

<div class="hub-filter-container">
  <button
    class="filter-trigger-btn"
    class:active={isOpen}
    class:filtered={!isAllSelected}
    onclick={toggleDropdown}
    aria-label="Фильтр разделов базы знаний"
  >
    <Icon name="list-filter" size={13} color="var(--cortex-accent, #38bdf8)" />
    <span class="trigger-label">{buttonLabel}</span>
    <span class="chevron-icon" class:open={isOpen}>
      <Icon name="chevron-down" size={12} />
    </span>
  </button>

  {#if isOpen}
    <div class="filter-popover" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <div class="popover-header">
        <div class="popover-title">
          <Icon name="folder" size={14} color="var(--cortex-accent)" />
          <span>Корневые разделы</span>
          <span class="count-badge">{realHubs.length}</span>
        </div>
        <div class="header-actions">
          <button class="text-action-btn" onclick={handleSelectAll}>Все</button>
          <span class="sep">/</span>
          <button class="text-action-btn" onclick={handleClearAll}>Сброс</button>
        </div>
      </div>

      {#if realHubs.length > 6}
        <div class="filter-search-box">
          <Icon name="search" size={12} color="var(--cortex-fg-muted)" />
          <input
            type="text"
            placeholder="Найти раздел..."
            bind:value={filterText}
            class="filter-search-input"
          />
        </div>
      {/if}

      <div class="hubs-list">
        <!-- Option: All -->
        <button
          class="hub-row"
          class:checked={isAllSelected}
          onclick={toggleAllHubs}
        >
          <span class="checkbox-box" class:checked={isAllSelected}>
            {#if isAllSelected}
              <Icon name="check" size={11} color="#ffffff" />
            {/if}
          </span>
          <span class="hub-row-icon">
            <Icon name="globe" size={14} color="var(--cortex-accent)" />
          </span>
          <span class="hub-row-name">Все разделы</span>
          <span class="hub-row-badge">{realHubs.length}</span>
        </button>

        <div class="divider"></div>

        <!-- List of specific hubs -->
        {#each filteredHubs as hub}
          {@const isChecked = isAllSelected || selectedHubIds.includes(hub.id)}
          <button
            class="hub-row"
            class:checked={isChecked}
            onclick={() => toggleHub(hub.id)}
          >
            <span class="checkbox-box" class:checked={isChecked}>
              {#if isChecked}
                <Icon name="check" size={11} color="#ffffff" />
              {/if}
            </span>
            <span class="hub-row-icon">
              <Icon name={hub.icon || "folder"} size={14} color={hub.color || "var(--cortex-fg-muted)"} />
            </span>
            <span class="hub-row-name">{hub.name}</span>
            <span class="hub-row-id">{hub.id}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .hub-filter-container {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .filter-trigger-btn {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 4px 10px;
    background: var(--cortex-bg-card, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--cortex-fg-primary, #e2e8f0);
    font-size: 0.78rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    height: 28px;
    white-space: nowrap;
  }

  .filter-trigger-btn:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.1));
    border-color: var(--cortex-accent, #38bdf8);
  }

  .filter-trigger-btn.active {
    border-color: var(--cortex-accent, #38bdf8);
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.12));
  }

  .filter-trigger-btn.filtered {
    border-color: var(--cortex-accent, #38bdf8);
  }

  .trigger-label {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron-icon {
    display: flex;
    align-items: center;
    color: var(--cortex-fg-muted, #94a3b8);
    transition: transform 0.2s ease;
  }

  .chevron-icon.open {
    transform: rotate(180deg);
  }

  /* POPOVER */
  .filter-popover {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    width: 260px;
    background: var(--cortex-bg-sidebar, #0d1117);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
    z-index: 10000;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: fadeIn 0.15s ease-out;
    -webkit-transform: translate3d(0, 0, 0);
    transform: translate3d(0, 0, 0);
    isolation: isolate;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 12px;
    background: var(--cortex-bg-header, rgba(255, 255, 255, 0.03));
    border-bottom: 1px solid var(--cortex-border-subtle, rgba(255, 255, 255, 0.06));
  }

  .popover-title {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--cortex-fg-primary, #ffffff);
  }

  .count-badge {
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.15));
    color: var(--cortex-accent, #38bdf8);
    font-size: 0.65rem;
    padding: 1px 5px;
    border-radius: 4px;
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
  }

  .text-action-btn {
    background: none;
    border: none;
    color: var(--cortex-accent, #38bdf8);
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 0.72rem;
  }

  .text-action-btn:hover {
    text-decoration: underline;
  }

  .sep {
    color: var(--cortex-fg-muted, #64748b);
  }

  .filter-search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--cortex-border-subtle, rgba(255, 255, 255, 0.06));
    background: var(--cortex-bg-input, rgba(0, 0, 0, 0.2));
  }

  .filter-search-input {
    width: 100%;
    background: none;
    border: none;
    color: var(--cortex-fg-primary, #e2e8f0);
    font-size: 0.75rem;
    outline: none;
  }

  .hubs-list {
    max-height: 260px;
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .hub-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: transparent;
    border: none;
    border-radius: 5px;
    color: var(--cortex-fg-secondary, #cbd5e1);
    font-size: 0.78rem;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: background 0.12s;
  }

  .hub-row:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.06));
    color: var(--cortex-fg-primary, #ffffff);
  }

  .checkbox-box {
    width: 14px;
    height: 14px;
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.2));
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--cortex-bg-input, rgba(0, 0, 0, 0.2));
    flex-shrink: 0;
    transition: all 0.12s;
  }

  .checkbox-box.checked {
    background: var(--cortex-accent, #38bdf8);
    border-color: var(--cortex-accent, #38bdf8);
  }

  .hub-row-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .hub-row-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .hub-row-id {
    font-size: 0.65rem;
    color: var(--cortex-fg-muted, #64748b);
    font-family: monospace;
  }

  .hub-row-badge {
    font-size: 0.68rem;
    color: var(--cortex-fg-muted, #94a3b8);
  }

  .divider {
    height: 1px;
    background: var(--cortex-border-subtle, rgba(255, 255, 255, 0.06));
    margin: 4px 6px;
  }
</style>
