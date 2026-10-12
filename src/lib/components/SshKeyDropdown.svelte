<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import type { SshKeyInfo, SessionStatus } from "$lib/types";
  import Icon from "./Icon.svelte";

  interface Props {
    isOpen: boolean;
    activeKey: SshKeyInfo | null;
    keys: SshKeyInfo[];
    vaultName: string;
    onClose: () => void;
    onRequestChangeKey: (key: SshKeyInfo) => void;
    onOpenSettings: () => void;
  }

  let {
    isOpen,
    activeKey,
    keys,
    vaultName,
    onClose,
    onRequestChangeKey,
    onOpenSettings,
  }: Props = $props();

  let sessionStatus = $state<SessionStatus | null>(null);

  $effect(() => {
    if (isOpen) {
      invoke<SessionStatus>("crypto_get_session_status")
        .then((status) => {
          sessionStatus = status;
        })
        .catch(() => {
          sessionStatus = null;
        });

      function handleClickOutside() {
        onClose();
      }
      function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape" || e.code === "Escape") {
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
  <div class="ssh-dropdown" onclick={(e) => e.stopPropagation()}>
    <div class="dropdown-header">
      <div class="header-text">
        <span class="header-title">SSH-ключ базы</span>
        <span class="header-sub">Привязан к «{vaultName}» (.meta.json)</span>
      </div>
      <span class="key-count">{keys.length}</span>
    </div>

    <div class="key-list custom-scroll">
      {#each keys as item}
        {@const isActive = activeKey?.path === item.path || item.is_active}
        <button
          type="button"
          class="key-item"
          class:active={isActive}
          onclick={() => {
            if (!isActive) {
              onRequestChangeKey(item);
            }
            onClose();
          }}
        >
          <div class="key-icon">
            <Icon name="key" size={15} color={isActive ? "var(--accent-color, #0284c7)" : "#94a3b8"} />
          </div>

          <div class="key-details">
            <div class="key-name-row">
              <span class="key-name">{item.filename}</span>
              <span class="key-type-badge">{item.key_type}</span>
            </div>
            <div class="key-comment" aria-label={item.path}>
              {item.comment || item.fingerprint}
            </div>
          </div>

          <div class="key-actions">
            {#if isActive}
              <span class="check-icon">
                <Icon name="check" size={15} color="var(--accent-color, #0284c7)" />
              </span>
            {/if}
          </div>
        </button>
      {/each}

      {#if keys.length === 0}
        <div class="empty-list">В ~/.ssh/ не найдено публичных ключей</div>
      {/if}
    </div>

    {#if sessionStatus?.is_unlocked}
      <button
        class="action-btn lock-btn"
        onclick={async () => {
          await invoke("crypto_clear_session_passphrase");
          sessionStatus = null;
          onClose();
        }}
        title="Очистить пароль из памяти сессии"
      >
        <Icon name="lock" size={14} color="#f87171" />
        <span style="color: #f87171;">
          Заблокировать (сбросить пароль из памяти)
          {#if sessionStatus.remaining_seconds != null}
            ({Math.ceil(sessionStatus.remaining_seconds / 60)} мин)
          {/if}
        </span>
      </button>
      <div class="dropdown-divider"></div>
    {/if}

    <button
      class="action-btn"
      onclick={() => {
        onClose();
        onOpenSettings();
      }}
    >
      <Icon name="settings" size={14} color="var(--text-muted, #94a3b8)" />
      <span>Все настройки шифрования...</span>
    </button>
  </div>
{/if}

<style>
  .ssh-dropdown {
    position: fixed;
    bottom: 28px;
    left: 110px;
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

  .header-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .header-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, #94a3b8);
  }

  .header-sub {
    font-size: 11px;
    color: var(--text-muted, #64748b);
  }

  .key-count {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--border-color, #334155);
    color: var(--text-muted, #cbd5e1);
  }

  .key-list {
    display: flex;
    flex-direction: column;
    padding: 6px;
    max-height: 280px;
    overflow-y: auto;
    gap: 3px;
  }

  .key-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
    background: transparent;
    border: none;
    text-align: left;
    width: 100%;
    font-family: inherit;
  }

  .key-item:hover {
    background: var(--bg-hover, rgba(255, 255, 255, 0.06));
  }

  .key-item.active {
    background: var(--bg-active, rgba(2, 132, 199, 0.12));
  }

  .key-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
  }

  .key-details {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .key-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .key-name {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-main, #f8fafc);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .key-type-badge {
    font-size: 9.5px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-muted, #94a3b8);
  }

  .key-comment {
    font-size: 11px;
    color: var(--text-muted, #94a3b8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: monospace;
  }

  .key-actions {
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
    font-size: 12px;
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
