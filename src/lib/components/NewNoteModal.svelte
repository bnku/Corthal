<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { t } from "$lib/i18n";

  interface Props {
    isOpen: boolean;
    targetFolder: string;
    onCreated: (newPath: string) => void;
    onClose: () => void;
  }

  let { isOpen, targetFolder, onCreated, onClose }: Props = $props();

  let noteTitle = $state("");
  let fileName = $state("");
  let isCreating = $state(false);
  let errorMessage = $state("");

  // Auto-slugify filename from title
  $effect(() => {
    if (noteTitle) {
      fileName = noteTitle
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/[^a-z0-9а-яё\-]/gi, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
    }
  });

  async function handleCreate() {
    if (!fileName.trim()) return;
    isCreating = true;
    errorMessage = "";

    const folderPrefix = targetFolder.trim() ? targetFolder.trim().replace(/\/$/, "") + "/" : "";
    const relativePath = `${folderPrefix}${fileName.trim()}.md`;

    try {
      const createdPath = await invoke<string>("vault_create_note", {
        relativePath,
        title: noteTitle.trim() || null,
      });
      onCreated(createdPath);
      noteTitle = "";
      fileName = "";
      onClose();
    } catch (err: any) {
      errorMessage = t("modals.new_note_error") + err;
    } finally {
      isCreating = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === "Escape" || e.code === "Escape") {
      onClose();
    } else if (e.key === "Enter" || e.code === "Enter") {
      e.preventDefault();
      handleCreate();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

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
          <span class="file-icon">📝</span>
          <h3>{t("modals.new_note_title")}</h3>
        </div>
        <button class="close-btn" onclick={onClose}>✕</button>
      </div>

      <div class="modal-body">
        <div class="folder-badge">
          {t("modals.new_note_folder")} <code>{targetFolder || "knowledge/"}</code>
        </div>

        <label for="note-title-input" class="input-label">{t("modals.new_note_name")}:</label>
        <input
          id="note-title-input"
          type="text"
          class="text-input"
          bind:value={noteTitle}
          placeholder={t("modals.new_note_placeholder")}
          autofocus
        />

        <label for="note-filename-input" class="input-label">{t("modals.new_note_filename")}</label>
        <div class="filename-input-wrap">
          <input
            id="note-filename-input"
            type="text"
            class="text-input"
            bind:value={fileName}
            placeholder="amnezia-setup"
          />
          <span class="ext-badge">.md</span>
        </div>

        {#if errorMessage}
          <div class="error-msg">{errorMessage}</div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="cancel-btn" onclick={onClose}>{t("common.cancel")}</button>
        <button
          class="submit-btn"
          onclick={handleCreate}
          disabled={!fileName.trim() || isCreating}
        >
          {isCreating ? t("common.loading") : t("common.create")}
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
    background: var(--corthal-bg-card, #0f172a);
    border: 1px solid var(--corthal-border, rgba(148, 163, 184, 0.25));
    border-radius: 12px;
    width: 90%;
    max-width: 460px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    -webkit-transform: translate3d(0, 0, 0);
    transform: translate3d(0, 0, 0);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--corthal-border-subtle, rgba(148, 163, 184, 0.15));
    background: var(--corthal-bg-header, rgba(30, 41, 59, 0.3));
  }

  .title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .file-icon {
    font-size: 1.1rem;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--corthal-fg-primary, #f1f5f9);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--corthal-fg-muted, #94a3b8);
    font-size: 1rem;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: color 0.15s;
  }

  .close-btn:hover {
    color: var(--corthal-fg-primary, #ffffff);
  }

  .modal-body {
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--corthal-bg-main, transparent);
  }

  .folder-badge {
    font-size: 0.8rem;
    color: var(--corthal-fg-secondary, #94a3b8);
    background: var(--corthal-bg-card, rgba(30, 41, 59, 0.5));
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid var(--corthal-border-subtle, rgba(148, 163, 184, 0.1));
  }

  .folder-badge code {
    color: var(--corthal-accent, #38bdf8);
    font-family: monospace;
  }

  .input-label {
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--corthal-fg-secondary, #cbd5e1);
    margin-top: 4px;
  }

  .text-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--corthal-bg-input, rgba(15, 23, 42, 0.8));
    border: 1px solid var(--corthal-border, rgba(148, 163, 184, 0.25));
    border-radius: 6px;
    padding: 8px 10px;
    color: var(--corthal-fg-primary, #f8fafc);
    font-family: inherit;
    font-size: 0.88rem;
    outline: none;
    transition: border-color 0.15s;
  }

  .text-input:focus {
    border-color: var(--corthal-accent, #3b82f6);
  }

  .filename-input-wrap {
    display: flex;
    align-items: center;
    position: relative;
  }

  .filename-input-wrap .text-input {
    padding-right: 44px;
    font-family: monospace;
  }

  .ext-badge {
    position: absolute;
    right: 10px;
    color: var(--corthal-fg-muted, #64748b);
    font-family: monospace;
    font-size: 0.82rem;
    pointer-events: none;
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
    background: var(--corthal-bg-header, rgba(30, 41, 59, 0.2));
    border-top: 1px solid var(--corthal-border-subtle, rgba(148, 163, 184, 0.12));
  }

  .cancel-btn {
    background: transparent;
    border: 1px solid var(--corthal-border, rgba(148, 163, 184, 0.25));
    color: var(--corthal-fg-secondary, #94a3b8);
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 0.84rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .cancel-btn:hover {
    color: var(--corthal-fg-primary, #f1f5f9);
    background: var(--corthal-bg-hover, rgba(255, 255, 255, 0.05));
  }

  .submit-btn {
    background: var(--corthal-accent, #3b82f6);
    border: none;
    color: var(--corthal-accent-fg, #ffffff);
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
