<script lang="ts">
  import Icon from "./Icon.svelte";

  interface Props {
    isOpen: boolean;
    keyPath: string;
    onSubmit: (passphrase: string) => void;
    onCancel: () => void;
  }

  let { isOpen, keyPath, onSubmit, onCancel }: Props = $props();

  let passphrase = $state("");
  let inputEl = $state<HTMLInputElement | null>(null);

  // Anti-shoulder-surfing: generate a randomized decoy mask so length cannot be counted
  let decoyLength = $state(12);
  let pulseTrigger = $state(false);

  $effect(() => {
    if (isOpen) {
      passphrase = "";
      decoyLength = Math.floor(Math.random() * 6) + 10; // 10 to 15 decoy bullets
      setTimeout(() => {
        inputEl?.focus();
      }, 50);
    }
  });

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    passphrase = target.value;
    
    // On each keystroke, randomize the decoy display count slightly (between 9 and 16)
    // so an observer behind cannot determine password length from dots!
    if (passphrase.length > 0) {
      decoyLength = Math.floor(Math.random() * 8) + 9;
      pulseTrigger = true;
      setTimeout(() => {
        pulseTrigger = false;
      }, 150);
    } else {
      decoyLength = 0;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSubmit() {
    onSubmit(passphrase);
    passphrase = "";
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={onCancel}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal-card" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <div class="header-left">
          <div class="shield-badge" class:pulse={pulseTrigger}>
            <Icon name="lock" size={18} color="var(--cortex-accent, #38bdf8)" />
          </div>
          <div>
            <h3 class="modal-title">Пасс-фраза SSH-ключа</h3>
            <span class="modal-subtitle">Локальное дешифрование секрета (AGE)</span>
          </div>
        </div>
        <button class="close-btn" onclick={onCancel} aria-label="Закрыть">
          <Icon name="x" size={16} />
        </button>
      </div>

      <div class="modal-body">
        <div class="key-path-info">
          <span class="info-label">Ключ:</span>
          <code class="key-path">{keyPath}</code>
        </div>

        <div class="input-container">
          <label for="passphrase-input" class="input-label">
            Введите пароль / пасс-фразу ключа:
          </label>

          <!-- Stealth Input Field with Anti-Shoulder-Surfing Display -->
          <div class="stealth-input-wrap" class:has-focus={true}>
            <!-- Real input hidden behind stylized disguised display -->
            <input
              id="passphrase-input"
              bind:this={inputEl}
              type="password"
              class="real-password-input"
              value={passphrase}
              oninput={handleInput}
              autocomplete="off"
              spellcheck="false"
            />

            <!-- Disguised Mask: Visual bullets randomized in count to protect against shoulder surfing -->
            <div class="disguised-display">
              {#if passphrase.length === 0}
                <span class="placeholder-text">Введите пароль...</span>
              {:else}
                <div class="decoy-bullets" class:keystroke-pulse={pulseTrigger}>
                  {#each Array(decoyLength) as _}
                    <span class="decoy-dot">●</span>
                  {/each}
                </div>
              {/if}
            </div>

            {#if passphrase.length > 0}
              <button
                type="button"
                class="clear-input-btn"
                onclick={() => {
                  passphrase = "";
                  decoyLength = 0;
                  inputEl?.focus();
                }}
                title="Очистить"
              >
                <Icon name="x" size={12} />
              </button>
            {/if}
          </div>

          <!-- Shoulder-Surfing Security Notice -->
          <div class="security-guard-banner">
            <span class="guard-icon">🛡️</span>
            <div class="guard-text">
              <strong>Shoulder-surfing guard активен:</strong>
              <span>Количество точек на экране рандомизировано — наблюдатель из-за спины не сможет определить длину пароля.</span>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" onclick={onCancel}>
          Отмена
        </button>
        <button class="btn btn-primary" onclick={handleSubmit}>
          <span>Расшифровать</span>
          <Icon name="unlock" size={14} />
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
    animation: fadeIn 0.15s ease;
    -webkit-transform: translate3d(0, 0, 0);
    transform: translate3d(0, 0, 0);
    isolation: isolate;
  }

  .modal-card {
    width: 480px;
    max-width: 92vw;
    background: var(--cortex-bg-card, #131b26);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.12));
    border-radius: 12px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    animation: scaleIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    -webkit-transform: translate3d(0, 0, 0);
    transform: translate3d(0, 0, 0);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    background: rgba(0, 0, 0, 0.15);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .shield-badge {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.12));
    border: 1px solid var(--cortex-accent, rgba(56, 189, 248, 0.3));
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s ease, background 0.15s ease;
  }

  .shield-badge.pulse {
    transform: scale(1.08);
    background: rgba(56, 189, 248, 0.25);
  }

  .modal-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--cortex-fg-primary, #f8fafc);
  }

  .modal-subtitle {
    font-size: 0.75rem;
    color: var(--cortex-fg-muted, #94a3b8);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--cortex-fg-muted, #94a3b8);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s;
  }

  .close-btn:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--cortex-fg-primary, #ffffff);
  }

  .modal-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .key-path-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.78rem;
    background: rgba(0, 0, 0, 0.2);
    padding: 8px 12px;
    border-radius: 6px;
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.06));
  }

  .info-label {
    color: var(--cortex-fg-muted, #94a3b8);
  }

  .key-path {
    color: var(--cortex-accent, #38bdf8);
    font-family: ui-monospace, monospace;
    font-size: 0.75rem;
  }

  .input-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .input-label {
    font-size: 0.82rem;
    color: var(--cortex-fg-primary, #cbd5e1);
    font-weight: 500;
  }

  .stealth-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
    height: 44px;
    background: var(--cortex-bg-input, #0b1118);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    padding: 0 12px;
    cursor: text;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .stealth-input-wrap:focus-within {
    border-color: var(--cortex-accent, #38bdf8);
    box-shadow: 0 0 0 2px var(--cortex-accent-subtle, rgba(56, 189, 248, 0.15));
  }

  .real-password-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: text;
    z-index: 2;
  }

  .disguised-display {
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
  }

  .placeholder-text {
    font-size: 0.85rem;
    color: var(--cortex-fg-muted, #64748b);
  }

  .decoy-bullets {
    display: flex;
    align-items: center;
    gap: 5px;
    letter-spacing: 2px;
    color: var(--cortex-accent, #38bdf8);
    transition: transform 0.1s ease;
  }

  .decoy-bullets.keystroke-pulse {
    transform: scale(1.02);
  }

  .decoy-dot {
    font-size: 0.8rem;
    line-height: 1;
    filter: drop-shadow(0 0 2px var(--cortex-accent, rgba(56, 189, 248, 0.4)));
  }

  .clear-input-btn {
    position: relative;
    z-index: 3;
    background: rgba(255, 255, 255, 0.08);
    border: none;
    color: var(--cortex-fg-muted, #94a3b8);
    border-radius: 50%;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.12s;
  }

  .clear-input-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #ffffff;
  }

  .security-guard-banner {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 6px;
    background: rgba(56, 189, 248, 0.06);
    border: 1px solid rgba(56, 189, 248, 0.18);
  }

  .guard-icon {
    font-size: 0.95rem;
    line-height: 1.2;
  }

  .guard-text {
    font-size: 0.72rem;
    color: var(--cortex-fg-muted, #94a3b8);
    line-height: 1.35;
  }

  .guard-text strong {
    color: var(--cortex-fg-primary, #cbd5e1);
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 20px;
    border-top: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    background: rgba(0, 0, 0, 0.15);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .btn-secondary {
    background: transparent;
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.12));
    color: var(--cortex-fg-primary, #cbd5e1);
  }

  .btn-secondary:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.08));
    color: #ffffff;
  }

  .btn-primary {
    background: var(--cortex-accent, #0284c7);
    border: none;
    color: #ffffff;
  }

  .btn-primary:hover {
    filter: brightness(1.1);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.96); }
    to { opacity: 1; transform: scale(1); }
  }
</style>
