<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

  interface Props {
    isOpen: boolean;
    onInsert: (encryptedToken: string) => void;
    onClose: () => void;
  }

  let { isOpen, onInsert, onClose }: Props = $props();

  let secretText = $state("");
  let isEncrypting = $state(false);
  let errorMessage = $state("");

  async function handleEncryptAndInsert() {
    if (!secretText.trim()) return;
    isEncrypting = true;
    errorMessage = "";

    try {
      const encrypted = await invoke<string>("crypto_encrypt_secret", {
        plaintext: secretText,
        pubkeyContent: null, // Use default ~/.ssh/id_ed25519.pub
      });
      onInsert(encrypted);
      secretText = "";
      onClose();
    } catch (err: any) {
      errorMessage = "Ошибка шифрования: " + err;
    } finally {
      isEncrypting = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" || e.code === "Escape") {
      onClose();
    } else if ((e.key === "Enter" || e.code === "Enter") && !e.shiftKey) {
      e.preventDefault();
      handleEncryptAndInsert();
    }
  }
</script>

{#if isOpen}
  <div class="modal-backdrop" onclick={onClose} role="presentation">
    <div
      class="modal-window"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
      onkeydown={handleKeydown}
    >
      <div class="modal-header">
        <div class="title-wrap">
          <span class="lock-icon">🔒</span>
          <h3>Зашифровать и вставить секрет</h3>
        </div>
        <button class="close-btn" onclick={onClose}>✕</button>
      </div>

      <div class="modal-body">
        <p class="desc">
          Введенное значение будет локально зашифровано вашим публичным SSH-ключом
          (<code>~/.ssh/id_ed25519.pub</code>) и вставлено как Zero-Knowledge токен.
        </p>

        <label for="secret-input" class="input-label">Значение секрета (пароль, токен, ключ API):</label>
        <textarea
          id="secret-input"
          class="secret-textarea"
          bind:value={secretText}
          placeholder="Вставьте сюда конфиденциальные данные..."
          rows="3"
        ></textarea>

        {#if errorMessage}
          <div class="error-msg">{errorMessage}</div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="cancel-btn" onclick={onClose}>Отмена</button>
        <button
          class="submit-btn"
          onclick={handleEncryptAndInsert}
          disabled={!secretText.trim() || isEncrypting}
        >
          {isEncrypting ? "Шифрование..." : "Зашифровать и вставить"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    -webkit-transform: translate3d(0, 0, 0);
    transform: translate3d(0, 0, 0);
    isolation: isolate;
  }

  .modal-window {
    background: var(--cortex-bg-card, #0f172a);
    border: 1px solid var(--cortex-border, rgba(148, 163, 184, 0.25));
    border-radius: 12px;
    width: 90%;
    max-width: 480px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    -webkit-transform: translate3d(0, 0, 0);
    transform: translate3d(0, 0, 0);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--cortex-border-subtle, rgba(148, 163, 184, 0.15));
    background: var(--cortex-bg-header, rgba(30, 41, 59, 0.3));
  }

  .title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .lock-icon {
    font-size: 1.1rem;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--cortex-fg-primary, #f1f5f9);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--cortex-fg-muted, #94a3b8);
    font-size: 1rem;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: color 0.15s;
  }

  .close-btn:hover {
    color: var(--cortex-fg-primary, #ffffff);
  }

  .modal-body {
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--cortex-bg-main, transparent);
  }

  .desc {
    margin: 0;
    font-size: 0.82rem;
    color: var(--cortex-fg-secondary, #94a3b8);
    line-height: 1.4;
  }

  .desc code {
    background: var(--cortex-bg-card, rgba(30, 41, 59, 0.7));
    padding: 1px 4px;
    border-radius: 3px;
    font-size: 0.8rem;
    color: var(--cortex-accent, #38bdf8);
  }

  .input-label {
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--cortex-fg-secondary, #cbd5e1);
    margin-top: 4px;
  }

  .secret-textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--cortex-bg-input, rgba(15, 23, 42, 0.8));
    border: 1px solid var(--cortex-border, rgba(148, 163, 184, 0.25));
    border-radius: 6px;
    padding: 10px;
    color: var(--cortex-fg-primary, #f8fafc);
    font-family: inherit;
    font-size: 0.88rem;
    resize: vertical;
    outline: none;
    transition: border-color 0.15s;
  }

  .secret-textarea:focus {
    border-color: var(--cortex-accent, #3b82f6);
  }

  .error-msg {
    font-size: 0.8rem;
    color: #f87171;
    background: rgba(239, 68, 68, 0.1);
    padding: 6px 10px;
    border-radius: 4px;
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 12px 18px;
    background: var(--cortex-bg-header, rgba(30, 41, 59, 0.2));
    border-top: 1px solid var(--cortex-border-subtle, rgba(148, 163, 184, 0.12));
  }

  .cancel-btn {
    background: transparent;
    border: 1px solid var(--cortex-border, rgba(148, 163, 184, 0.25));
    color: var(--cortex-fg-secondary, #94a3b8);
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 0.84rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .cancel-btn:hover {
    color: var(--cortex-fg-primary, #f1f5f9);
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.05));
  }

  .submit-btn {
    background: var(--cortex-accent, #3b82f6);
    border: none;
    color: var(--cortex-accent-fg, #ffffff);
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 0.84rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .submit-btn:hover:not(:disabled) {
    opacity: 0.9;
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
