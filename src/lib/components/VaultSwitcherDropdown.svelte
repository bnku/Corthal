<script lang="ts">
  import type { VaultSummary, VaultInfo } from "$lib/types";
  import Icon from "./Icon.svelte";

  interface Props {
    isOpen: boolean;
    activeVault: VaultInfo | null;
    recents: VaultSummary[];
    onClose: () => void;
    onSelectVault: (path: string) => void;
    onRemoveRecent: (path: string) => void;
    onOpenOther: () => void;
  }

  let {
    isOpen,
    activeVault,
    recents,
    onClose,
    onSelectVault,
    onRemoveRecent,
    onOpenOther,
  }: Props = $props();

  $effect(() => {
    if (isOpen) {
      function handleClickOutside() {
        onClose();
      }
      function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
          onClose();
        }
      }
      window.addEventListener("click", handleClickOutside);
      window.addEventListener("keydown", handleKeydown);
      return () => {
        window.removeEventListener("click", handleClickOutside);
        window.removeEventListener("keydown", handleKeydown);
      };
    }
  });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="vault-dropdown" onclick={(e) => e.stopPropagation()}>
    <div class="dropdown-header">
      <span class="header-title">Базы знаний</span>
      <span class="vault-count">{recents.length}</span>
    </div>

    <div class="vault-list custom-scroll">
      {#each recents as item}
        {@const isActive = activeVault?.path === item.path}
        <div class="vault-item" class:active={isActive}>
          <button
            type="button"
            class="vault-main-btn"
            onclick={() => {
              if (!isActive) onSelectVault(item.path);
              onClose();
            }}
          >
            <div class="vault-icon">
              <Icon name={isActive ? "folder-open" : "folder"} size={16} color={isActive ? "var(--accent-color, #0284c7)" : "#94a3b8"} />
            </div>

            <div class="vault-details">
              <div class="vault-name">
                {item.name}
                {#if isActive}
                  <span class="active-badge">Текущая</span>
                {/if}
              </div>
              <div class="vault-path" aria-label={item.path}>{item.display_path}</div>
            </div>
          </button>

          <div class="vault-actions">
            {#if isActive}
              <span class="check-icon">
                <Icon name="check" size={15} color="var(--accent-color, #0284c7)" />
              </span>
            {:else}
              <button
                type="button"
                class="remove-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  onRemoveRecent(item.path);
                }}
                aria-label="Убрать из недавних"
              >
                <Icon name="trash" size={13} />
              </button>
            {/if}
          </div>
        </div>
      {/each}

      {#if recents.length === 0}
        <div class="empty-list">Нет недавних баз знаний</div>
      {/if}
    </div>

    <div class="dropdown-divider"></div>

    <button
      class="action-btn"
      onclick={() => {
        onClose();
        onOpenOther();
      }}
    >
      <Icon name="folder-plus" size={15} color="var(--accent-color, #0284c7)" />
      <span>Открыть другую базу знаний...</span>
    </button>
  </div>
{/if}

<style>
  .vault-dropdown {
    position: fixed;
    bottom: 28px;
    left: 10px;
    width: 320px;
    max-height: 420px;
    background: var(--bg-card, #1e293b);
    border: 1px solid var(--border-color, #334155);
    border-radius: 8px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.45), 0 8px 10px -6px rgba(0, 0, 0, 0.35);
    z-index: 9500;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideUp 0.15s ease-out;
  }

  .dropdown-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--bg-sidebar, rgba(0, 0, 0, 0.15));
    border-bottom: 1px solid var(--border-color, #334155);
  }

  .header-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, #94a3b8);
  }

  .vault-count {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--border-color, #334155);
    color: var(--text-muted, #cbd5e1);
  }

  .vault-list {
    display: flex;
    flex-direction: column;
    padding: 6px;
    max-height: 280px;
    overflow-y: auto;
    gap: 3px;
  }

  .vault-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-radius: 6px;
    transition: all 0.15s ease;
    user-select: none;
    overflow: hidden;
  }

  .vault-item:hover {
    background: var(--bg-hover, rgba(255, 255, 255, 0.06));
  }

  .vault-item.active {
    background: var(--bg-active, rgba(2, 132, 199, 0.12));
  }

  .vault-main-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    background: transparent;
    border: none;
    text-align: left;
    flex: 1;
    min-width: 0;
    cursor: pointer;
    font-family: inherit;
    color: inherit;
  }

  .vault-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
  }

  .vault-details {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .vault-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-main, #f8fafc);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .active-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(2, 132, 199, 0.2);
    color: var(--accent-color, #38bdf8);
  }

  .vault-path {
    font-size: 11px;
    color: var(--text-muted, #94a3b8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: monospace;
  }

  .vault-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }

  .check-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .remove-btn {
    background: none;
    border: none;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    padding: 3px;
    border-radius: 4px;
    display: none;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .vault-item:hover .remove-btn {
    display: flex;
  }

  .remove-btn:hover {
    color: #f43f5e;
    background: rgba(244, 63, 94, 0.1);
  }

  .empty-list {
    padding: 16px;
    text-align: center;
    font-size: 12px;
    color: var(--text-muted, #64748b);
  }

  .dropdown-divider {
    height: 1px;
    background: var(--border-color, #334155);
    margin: 2px 0;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: none;
    border: none;
    color: var(--text-main, #f8fafc);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    width: 100%;
  }

  .action-btn:hover {
    background: var(--bg-hover, rgba(255, 255, 255, 0.06));
    color: var(--accent-color, #38bdf8);
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
