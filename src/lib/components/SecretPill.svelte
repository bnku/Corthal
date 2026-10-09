<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

  interface Props {
    token: string;
    onPassphraseNeeded?: () => Promise<string | null>;
  }

  let { token, onPassphraseNeeded }: Props = $props();

  let isRevealed = $state(false);
  let decryptedValue = $state<string | null>(null);
  let isLoading = $state(false);
  let copyFeedback = $state(false);
  let errorMessage = $state<string | null>(null);

  async function getDecrypted(): Promise<string | null> {
    if (decryptedValue) return decryptedValue;

    isLoading = true;
    errorMessage = null;

    try {
      // First try with no passphrase
      let plain = await invoke<string>("crypto_decrypt_secret", {
        token,
        passphrase: null,
      });
      decryptedValue = plain;
      return plain;
    } catch (err: any) {
      // If error mentions passphrase, ask user for passphrase
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
      title={isRevealed ? "Скрыть" : "Показать (расшифровать SSH-ключом)"}
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
      title="Скопировать в буфер обмена"
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
    background: rgba(30, 41, 59, 0.85);
    border: 1px solid rgba(148, 163, 184, 0.25);
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
    background: #475569;
    color: #f8fafc;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 4px;
    letter-spacing: 0.02em;
  }

  .value {
    color: #cbd5e1;
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
