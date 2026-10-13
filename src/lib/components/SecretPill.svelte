<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import Icon from "./Icon.svelte";
  import { t } from "$lib/i18n";

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
        passphrase = prompt(t("secret_pill.prompt_passphrase"));
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
        errorMessage = retryErr?.toString() || t("secret_pill.decrypt_error");
        return null;
      }
    } finally {
      isLoading = false;
    }
  }

  async function toggleReveal(e?: MouseEvent) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isRevealed) {
      isRevealed = false;
      return;
    }
    const val = await getDecrypted();
    if (val !== null) {
      isRevealed = true;
    }
  }

  async function copyToClipboard(e?: MouseEvent) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
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
  <span class="badge" title={t("secret_pill.badge_title")}>
    <Icon name={isRevealed ? "unlock" : "lock"} size={11} />
  </span>
  
  {#if isRevealed && decryptedValue}
    <span class="value revealed-text">{decryptedValue}</span>
  {:else}
    <span class="value masked-text">••••••••••••</span>
  {/if}

  <div class="actions">
    <button
      type="button"
      class="action-btn"
      onmousedown={(e) => e.stopPropagation()}
      onclick={toggleReveal}
      title={isRevealed ? t("secret_pill.hide") : t("secret_pill.reveal")}
      aria-label={isRevealed ? t("secret_pill.hide") : t("secret_pill.reveal_aria")}
      disabled={isLoading}
    >
      {#if isLoading}
        <Icon name="refresh-cw" size={11} class="spin" />
      {:else if isRevealed}
        <Icon name="eye-off" size={11} />
      {:else}
        <Icon name="eye" size={11} />
      {/if}
    </button>

    <button
      type="button"
      class="action-btn copy-btn"
      onmousedown={(e) => e.stopPropagation()}
      onclick={copyToClipboard}
      title={copyFeedback ? t("secret_pill.copied") : t("secret_pill.copy")}
      aria-label={t("secret_pill.copy_aria")}
      disabled={isLoading}
    >
      {#if copyFeedback}
        <Icon name="check" size={11} color="var(--cortex-accent, #38bdf8)" />
      {:else}
        <Icon name="copy" size={11} />
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
    gap: 5px;
    background: var(--cortex-bg-card, rgba(30, 41, 59, 0.85));
    border: 1px solid var(--cortex-border, rgba(148, 163, 184, 0.25));
    border-radius: 6px;
    padding: 2px 5px 2px 4px;
    font-size: 0.82rem;
    font-family: var(--cortex-font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
    vertical-align: middle;
    transition: all 0.2s ease;
    user-select: none;
    max-width: 100%;
    box-sizing: border-box;
  }

  .secret-pill.revealed {
    border-color: rgba(34, 197, 94, 0.45);
    background: rgba(20, 83, 45, 0.22);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.12));
    color: var(--cortex-accent, #38bdf8);
    border: 1px solid var(--cortex-accent-border, rgba(56, 189, 248, 0.25));
    width: 18px;
    height: 18px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .secret-pill.revealed .badge {
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.35);
    color: #4ade80;
  }

  .value {
    color: var(--cortex-fg-primary, #cbd5e1);
    font-weight: 500;
    padding: 0 4px;
    font-size: 0.82rem;
    line-height: 1.3;
    word-break: break-all;
  }

  .masked-text {
    letter-spacing: 0.1em;
    color: var(--cortex-fg-muted, #94a3b8);
  }

  .revealed-text {
    color: #4ade80;
    user-select: all;
  }

  .actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    background: transparent;
    border: none;
    color: var(--cortex-fg-muted, #94a3b8);
    cursor: pointer;
    padding: 0;
    border-radius: 4px;
    transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.1));
    color: var(--cortex-fg-primary, #ffffff);
  }

  .action-btn:active:not(:disabled) {
    transform: scale(0.92);
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

  :global(.spin) {
    animation: cortex-spin 1s linear infinite;
  }

  @keyframes cortex-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
