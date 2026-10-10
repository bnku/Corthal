<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";

  interface Props {
    token: string;
    autoReveal?: boolean;
    onPassphraseNeeded?: () => Promise<string | null>;
  }

  let { token, autoReveal = false, onPassphraseNeeded }: Props = $props();

  let isRevealed = $state(false);
  let decryptedValue = $state<string | null>(null);
  let isLoading = $state(false);
  let copyFeedback = $state(false);
  let errorMessage = $state<string | null>(null);

  let unlistenUnlocked: UnlistenFn | null = null;
  let unlistenLocked: UnlistenFn | null = null;

  onMount(async () => {
    // Check if session is already unlocked, and if so or if autoReveal requested, decrypt silently
    try {
      const isUnlocked = await invoke<boolean>("crypto_is_session_unlocked");
      if (isUnlocked || autoReveal) {
        const plain = await invoke<string>("crypto_decrypt_secret", {
          token,
          passphrase: null,
        });
        if (plain) {
          decryptedValue = plain;
          if (isUnlocked || autoReveal) {
            isRevealed = true;
          }
        }
      }
    } catch {
      // Session not yet unlocked, will prompt on manual reveal click
    }

    // Listen for session unlock events across the app
    try {
      unlistenUnlocked = await listen("crypto:session-unlocked", async () => {
        if (!decryptedValue) {
          try {
            const plain = await invoke<string>("crypto_decrypt_secret", {
              token,
              passphrase: null,
            });
            if (plain) {
              decryptedValue = plain;
              if (autoReveal) {
                isRevealed = true;
              }
            }
          } catch {}
        }
      });

      unlistenLocked = await listen("crypto:session-locked", () => {
        decryptedValue = null;
        isRevealed = false;
      });
    } catch (e) {
      console.warn("Failed to register crypto event listener:", e);
    }
  });

  onDestroy(() => {
    if (unlistenUnlocked) unlistenUnlocked();
    if (unlistenLocked) unlistenLocked();
  });

  async function getDecrypted(): Promise<string | null> {
    if (decryptedValue) return decryptedValue;

    isLoading = true;
    errorMessage = null;

    try {
      // First try with no passphrase (or cached session passphrase)
      let plain = await invoke<string>("crypto_decrypt_secret", {
        token,
        passphrase: null,
      });
      decryptedValue = plain;
      return plain;
    } catch (err: any) {
      // If cached passphrase not available, ask user via passphrase modal
      let passphrase: string | null = null;
      if (onPassphraseNeeded) {
        passphrase = await onPassphraseNeeded();
      } else {
        passphrase = prompt("Введите пасс-фразу от SSH ключа (~/.ssh/id_ed25519):");
      }

      if (passphrase === null) {
        isLoading = false;
        return null;
      }

      try {
        let plain = await invoke<string>("crypto_decrypt_secret", {
          token,
          passphrase,
        });
        decryptedValue = plain;
        return plain;
      } catch (retryErr: any) {
        errorMessage = retryErr?.toString() || "Ошибка расшифровки";
        return null;
      }
    } finally {
      isLoading = false;
    }
  }

  async function toggleReveal() {
    if (isRevealed) {
      isRevealed = false;
      return;
    }
    const val = await getDecrypted();
    if (val !== null) {
      isRevealed = true;
    }
  }

  async function copyToClipboard() {
    const val = await getDecrypted();
    if (val !== null) {
      await navigator.clipboard.writeText(val);
      copyFeedback = true;
      setTimeout(() => {
        copyFeedback = false;
      }, 2000);
    }
  }
</script>

<span class="secret-pill" class:revealed={isRevealed}>
  <span class="badge">🔒 SSH Age</span>
  
  {#if isRevealed && decryptedValue}
    <span class="value revealed-text">{decryptedValue}</span>
  {:else}
    <span class="value masked-text">••••••••••••</span>
  {/if}

  <div class="actions">
    <button
      class="action-btn"
      onclick={toggleReveal}
      aria-label={isRevealed ? "Скрыть" : "Показать (расшифровать SSH-ключом)"}
      disabled={isLoading}
    >
      {#if isLoading}
        ⏳
      {:else if isRevealed}
        👁️‍🗨️
      {:else}
        👁️
      {/if}
    </button>

    <button
      class="action-btn copy-btn"
      onclick={copyToClipboard}
      aria-label="Скопировать в буфер обмена"
      disabled={isLoading}
    >
      {#if copyFeedback}
        ✅
      {:else}
        📋
      {/if}
    </button>
  </div>

  {#if errorMessage}
    <span class="error-tooltip">{errorMessage}</span>
  {/if}
</span>

<style>
  .secret-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--cortex-bg-card, rgba(30, 41, 59, 0.85));
    border: 1px solid var(--cortex-border, rgba(148, 163, 184, 0.25));
    border-radius: 6px;
    padding: 2px 8px;
    font-size: 0.85rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    vertical-align: middle;
    transition: all 0.2s ease;
    user-select: none;
  }

  .secret-pill.revealed {
    border-color: rgba(34, 197, 94, 0.6);
    background: rgba(20, 83, 45, 0.25);
  }

  .badge {
    background: var(--cortex-accent-subtle, #475569);
    color: var(--cortex-accent, #f8fafc);
    border: 1px solid var(--cortex-accent-border, transparent);
    font-size: 0.7rem;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 4px;
    letter-spacing: 0.02em;
  }

  .value {
    color: var(--cortex-fg-primary, #cbd5e1);
    font-weight: 500;
    padding: 0 4px;
  }

  .revealed-text {
    color: #4ade80;
    user-select: all;
  }

  .actions {
    display: inline-flex;
    gap: 3px;
  }

  .action-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 1px 4px;
    border-radius: 4px;
    transition: background 0.15s, color 0.15s;
  }

  .action-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: #f8fafc;
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-tooltip {
    color: #f87171;
    font-size: 0.75rem;
    margin-left: 4px;
  }
</style>
