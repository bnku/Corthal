<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import Icon from "./Icon.svelte";
  import { t } from "$lib/i18n";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onVaultSelected: (path: string) => void;
  }

  let { isOpen, onClose, onVaultSelected }: Props = $props();

  let inputPath = $state("");
  let errorMessage = $state("");
  let isBrowsing = $state(false);

  let quickSuggestions = $derived([
    { label: t("settings.about.developer_notes").includes("Arch") ? "Основная база знаний" : "Knowledge Base", path: "~/knowledge" },
    { label: "Dotfile Vault (~/.knowledge)", path: "~/.knowledge" },
    { label: "Corthal Project (~/dev/cortex)", path: "~/dev/cortex" },
  ]);

  $effect(() => {
    if (isOpen) {
      inputPath = "";
      errorMessage = "";
    }
  });

  async function handleBrowse() {
    try {
      isBrowsing = true;
      errorMessage = "";
      const selected = await invoke<string | null>("vault_pick_directory");
      if (selected) {
        inputPath = selected;
      }
    } catch (e: any) {
      errorMessage = e?.toString() || "Error opening folder picker";
    } finally {
      isBrowsing = false;
    }
  }

  function handleSelectSuggestion(path: string) {
    inputPath = path;
  }

  function handleSubmit() {
    const trimmed = inputPath.trim();
    if (!trimmed) {
      errorMessage = t("modals.vault_path_placeholder");
      return;
    }
    errorMessage = "";
    onVaultSelected(trimmed);
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" || e.code === "Escape") {
      onClose();
    } else if ((e.key === "Enter" || e.code === "Enter") && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={onClose}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal-card" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <div class="header-icon">
          <Icon name="folder-plus" size={18} color="var(--accent-color, #0284c7)" />
        </div>
        <div class="header-title">{t("modals.vault_open_title")}</div>
        <button class="close-btn" onclick={onClose} aria-label={t("common.close")}>
          <Icon name="x" size={16} />
        </button>
      </div>

      <div class="modal-body">
        <div class="field-label">{t("modals.vault_path_label")}</div>
        <div class="input-row">
          <div class="input-wrap">
            <span class="folder-prefix">📁</span>
            <input
              type="text"
              class="path-input"
              placeholder={t("modals.vault_path_placeholder")}
              bind:value={inputPath}
            />
          </div>
          <button class="btn btn-browse" onclick={handleBrowse} disabled={isBrowsing}>
            <Icon name="folder-open" size={14} />
            <span>{t("modals.browse")}</span>
          </button>
        </div>

        {#if errorMessage}
          <div class="error-msg">{errorMessage}</div>
        {/if}

        <div class="suggestions-section">
          <div class="suggestions-label">{t("modals.quick_select")}</div>
          <div class="suggestions-list">
            {#each quickSuggestions as item}
              <button
                type="button"
                class="suggestion-pill"
                class:active={inputPath === item.path}
                onclick={() => handleSelectSuggestion(item.path)}
              >
                <span class="pill-name">{item.label}</span>
                <span class="pill-path">{item.path}</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="note-box">
          <Icon name="lightbulb" size={15} color="var(--accent-color, #0284c7)" />
          <span>{t("modals.vault_auto_create_note")}</span>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-cancel" onclick={onClose}>{t("common.cancel")}</button>
        <button class="btn btn-primary" onclick={handleSubmit} disabled={!inputPath.trim()}>
          {t("common.open")}
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
    max-width: 520px;
    background: var(--bg-card, #1e293b);
    border: 1px solid var(--border-color, #334155);
    border-radius: 10px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    -webkit-transform: translate3d(0, 0, 0);
    transform: translate3d(0, 0, 0);
    overflow: hidden;
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
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field-label {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-muted, #94a3b8);
  }

  .input-row {
    display: flex;
    gap: 8px;
  }

  .input-wrap {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  }

  .folder-prefix {
    position: absolute;
    left: 10px;
    font-size: 14px;
    pointer-events: none;
  }

  .path-input {
    width: 100%;
    padding: 8px 12px 8px 32px;
    font-size: 13px;
    font-family: monospace;
    background: var(--bg-input, #0f172a);
    border: 1px solid var(--border-color, #334155);
    border-radius: 6px;
    color: var(--text-main, #f8fafc);
    outline: none;
    transition: border-color 0.15s ease;
  }

  .path-input:focus {
    border-color: var(--accent-color, #0284c7);
  }

  .error-msg {
    font-size: 12px;
    color: #f43f5e;
  }

  .suggestions-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
  }

  .suggestions-label {
    font-size: 11.5px;
    color: var(--text-muted, #64748b);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 600;
  }

  .suggestions-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .suggestion-pill {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 12px;
    border-radius: 6px;
    background: var(--bg-input, rgba(15, 23, 42, 0.6));
    border: 1px solid var(--border-color, #334155);
    color: var(--text-main, #cbd5e1);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .suggestion-pill:hover,
  .suggestion-pill.active {
    background: var(--bg-hover, rgba(2, 132, 199, 0.1));
    border-color: var(--accent-color, #0284c7);
  }

  .pill-name {
    font-size: 12.5px;
    font-weight: 500;
  }

  .pill-path {
    font-size: 11.5px;
    font-family: monospace;
    color: var(--text-muted, #94a3b8);
  }

  .note-box {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-muted, #94a3b8);
    background: rgba(2, 132, 199, 0.06);
    border: 1px solid rgba(2, 132, 199, 0.2);
    border-radius: 6px;
    padding: 9px 12px;
  }

  .note-box code {
    background: rgba(0, 0, 0, 0.2);
    padding: 1px 4px;
    border-radius: 3px;
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
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .btn-browse {
    background: var(--bg-card, #1e293b);
    color: var(--text-main, #cbd5e1);
    border: 1px solid var(--border-color, #334155);
    white-space: nowrap;
  }

  .btn-browse:hover:not(:disabled) {
    background: var(--bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--text-main, #f8fafc);
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

  .btn-primary {
    background: var(--accent-color, #0284c7);
    color: #ffffff;
  }

  .btn-primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
