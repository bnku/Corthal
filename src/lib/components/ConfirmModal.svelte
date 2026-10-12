<script lang="ts">
  import Icon from "./Icon.svelte";

  interface Props {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
    showCheckbox?: boolean;
    checkboxLabel?: string;
    checkboxChecked?: boolean;
    onCheckboxChange?: (checked: boolean) => void;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    isOpen,
    title,
    message,
    confirmText = "Подтвердить",
    cancelText = "Отмена",
    danger = true,
    showCheckbox = false,
    checkboxLabel = "Больше не спрашивать в этой сессии",
    checkboxChecked = $bindable(false),
    onCheckboxChange,
    onConfirm,
    onCancel,
  }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === "Escape" || e.code === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter" || e.code === "Enter") {
      e.preventDefault();
      onConfirm();
    }
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
        <div class="header-icon" class:danger>
          <Icon name={danger ? "shield" : "lightbulb"} size={20} color={danger ? "#f43f5e" : "#0284c7"} />
        </div>
        <div class="header-title">{title}</div>
        <button class="close-btn" onclick={onCancel} aria-label="Закрыть">
          <Icon name="x" size={16} />
        </button>
      </div>

      <div class="modal-body">
        <p class="message-text">{message}</p>
        {#if showCheckbox}
          <label class="modal-checkbox-row">
            <input
              type="checkbox"
              bind:checked={checkboxChecked}
              onchange={(e) => onCheckboxChange?.(e.currentTarget.checked)}
              class="modal-checkbox"
            />
            <span class="checkbox-label">{checkboxLabel}</span>
          </label>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="btn btn-cancel" onclick={onCancel}>
          {cancelText}
        </button>
        <button
          class="btn"
          class:btn-danger={danger}
          class:btn-primary={!danger}
          onclick={onConfirm}
        >
          {confirmText}
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
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    animation: fadeIn 0.15s ease-out;
    -webkit-transform: translate3d(0, 0, 0);
    transform: translate3d(0, 0, 0);
    isolation: isolate;
  }

  .modal-card {
    width: 100%;
    max-width: 440px;
    background: var(--bg-card, #1e293b);
    border: 1px solid var(--border-color, #334155);
    border-radius: 10px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    -webkit-transform: translate3d(0, 0, 0);
    transform: translate3d(0, 0, 0);
    animation: scaleIn 0.15s ease-out;
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color, #334155);
  }

  .header-icon {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: rgba(2, 132, 199, 0.12);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .header-icon.danger {
    background: rgba(244, 63, 94, 0.15);
  }

  .header-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-main, #f8fafc);
    flex: 1;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.15s ease;
  }

  .close-btn:hover {
    color: var(--text-main, #f8fafc);
    background: var(--bg-hover, rgba(255, 255, 255, 0.08));
  }

  .modal-body {
    padding: 20px;
  }

  .message-text {
    font-size: 13.5px;
    line-height: 1.55;
    color: var(--text-main, #cbd5e1);
    margin: 0;
  }

  .modal-checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 16px;
    cursor: pointer;
    user-select: none;
  }

  .modal-checkbox {
    accent-color: var(--cortex-accent, #38bdf8);
    cursor: pointer;
    width: 15px;
    height: 15px;
  }

  .checkbox-label {
    font-size: 13px;
    color: var(--text-muted, #94a3b8);
    transition: color 0.12s ease;
  }

  .modal-checkbox-row:hover .checkbox-label {
    color: var(--text-main, #f8fafc);
  }

  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 20px;
    background: var(--bg-sidebar, rgba(0, 0, 0, 0.15));
    border-top: 1px solid var(--border-color, #334155);
  }

  .btn {
    padding: 7px 16px;
    font-size: 13px;
    font-weight: 500;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-cancel {
    background: transparent;
    color: var(--text-muted, #94a3b8);
    border: 1px solid var(--border-color, #334155);
  }

  .btn-cancel:hover {
    background: var(--bg-hover, rgba(255, 255, 255, 0.05));
    color: var(--text-main, #f8fafc);
  }

  .btn-danger {
    background: #e11d48;
    color: #ffffff;
  }

  .btn-danger:hover {
    background: #be123c;
  }

  .btn-primary {
    background: var(--accent-color, #0284c7);
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
    from { transform: scale(0.96); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
</style>
