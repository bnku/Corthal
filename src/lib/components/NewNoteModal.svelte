<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";

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
      errorMessage = "Ошибка создания заметки: " + err;
    } finally {
      isCreating = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter") {
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
          <h3>Создать новую заметку</h3>
        </div>
        <button class="close-btn" onclick={onClose}>✕</button>
      </div>

      <div class="modal-body">
        <div class="folder-badge">
          Папка: <code>{targetFolder || "Корень базы (knowledge/)"}</code>
        </div>

        <label for="note-title-input" class="input-label">Заголовок заметки:</label>
        <input
          id="note-title-input"
          type="text"
          class="text-input"
          bind:value={noteTitle}
          placeholder="Например: Настройка AmneziaVPN"
        />

        <label for="note-filename-input" class="input-label">Имя файла (.md):</label>
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
        <button class="cancel-btn" onclick={onClose}>Отмена</button>
        <button
          class="submit-btn"
          onclick={handleCreate}
          disabled={!fileName.trim() || isCreating}
        >
          {isCreating ? "Создание..." : "Создать заметку"}
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
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-window {
    background: #0f172a;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 12px;
    width: 90%;
    max-width: 460px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.15);
    background: rgba(30, 41, 59, 0.3);
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
    color: #f1f5f9;
  }

  .close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 1rem;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    transition: color 0.15s;
  }

  .close-btn:hover {
    color: #ffffff;
  }

  .modal-body {
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .folder-badge {
    font-size: 0.8rem;
    color: #94a3b8;
    background: rgba(30, 41, 59, 0.5);
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid rgba(148, 163, 184, 0.1);
  }

  .folder-badge code {
    color: #38bdf8;
    font-family: monospace;
  }

  .input-label {
    font-size: 0.82rem;
    font-weight: 500;
    color: #cbd5e1;
    margin-top: 4px;
  }

  .text-input {
    width: 100%;
    box-sizing: border-box;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 6px;
    padding: 8px 10px;
    color: #f8fafc;
    font-family: inherit;
    font-size: 0.88rem;
    outline: none;
    transition: border-color 0.15s;
  }

  .text-input:focus {
    border-color: #3b82f6;
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
    color: #64748b;
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
    background: rgba(30, 41, 59, 0.2);
    border-top: 1px solid rgba(148, 163, 184, 0.12);
  }

  .cancel-btn {
    background: transparent;
    border: 1px solid rgba(148, 163, 184, 0.25);
    color: #94a3b8;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 0.84rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .cancel-btn:hover {
    color: #f1f5f9;
  }

  .submit-btn {
    background: #3b82f6;
    border: none;
    color: #ffffff;
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 0.84rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .submit-btn:hover:not(:disabled) {
    background: #2563eb;
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
