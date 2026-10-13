<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import type { VaultNode } from "$lib/types";
  import { AVAILABLE_ICONS, COLOR_PALETTE } from "$lib/icons";
  import Icon from "./Icon.svelte";
  import { t } from "$lib/i18n";

  interface Props {
    isOpen: boolean;
    folderNode: VaultNode | null;
    onSaved: () => void;
    onClose: () => void;
  }

  let { isOpen, folderNode, onSaved, onClose }: Props = $props();

  let title = $state("");
  let selectedIcon = $state("folder");
  let order = $state<number>(1);
  let selectedColor = $state("#3b82f6");
  let description = $state("");
  let isSaving = $state(false);
  let errorMessage = $state("");
  let iconFilter = $state("");

  let lastNodePath = $state<string | null>(null);
  let titleInput = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (isOpen && folderNode && folderNode.relative_path !== lastNodePath) {
      lastNodePath = folderNode.relative_path;
      title = folderNode.title || folderNode.name.replace(/^\d+-/, "");
      selectedIcon = folderNode.icon || "folder";
      order = folderNode.order ?? 10;
      selectedColor = folderNode.color || "#3b82f6";
      description = folderNode.description || "";
      errorMessage = "";
      setTimeout(() => {
        titleInput?.focus();
        titleInput?.select();
      }, 50);
    } else if (!isOpen) {
      lastNodePath = null;
    }
  });

  let filteredIcons = $derived.by(() => {
    if (!iconFilter.trim()) return AVAILABLE_ICONS;
    const q = iconFilter.toLowerCase();
    return AVAILABLE_ICONS.filter(
      (i) => i.id.toLowerCase().includes(q) || i.label.toLowerCase().includes(q)
    );
  });

  async function handleSave() {
    if (!folderNode) return;
    isSaving = true;
    errorMessage = "";

    try {
      await invoke("vault_save_dir_meta", {
        relativePath: folderNode.relative_path,
        meta: {
          title: title.trim() || null,
          icon: selectedIcon || null,
          order: Number(order) || 10,
          color: selectedColor || null,
          description: description.trim() || null,
        },
      });
      onSaved();
      onClose();
    } catch (err: any) {
      errorMessage = (t("common.error") || "Error") + ": " + err;
    } finally {
      isSaving = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === "Escape" || e.code === "Escape") {
      onClose();
    } else if ((e.key === "Enter" || e.code === "Enter") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen && folderNode}
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
          <Icon name="sliders" size={18} color="#60a5fa" />
          <h3>{t("folder_settings.title")}</h3>
        </div>
        <button class="close-btn" onclick={onClose} aria-label={t("common.close")}>✕</button>
      </div>

      <div class="modal-body">
        <div class="path-badge">
          {t("folder_settings.path")} <code>{folderNode.relative_path || "knowledge/"}</code>
        </div>

        <!-- 1. Title -->
        <label for="folder-title" class="input-label">{t("folder_settings.name_label")}</label>
        <input
          id="folder-title"
          bind:this={titleInput}
          type="text"
          class="text-input"
          bind:value={title}
          placeholder={t("folder_settings.name_placeholder")}
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            }
          }}
        />

        <!-- 2. Icon Picker -->
        <div class="icon-picker-section">
          <div class="section-row">
            <span class="input-label">{t("folder_settings.icon_label")}</span>
            <div class="preview-badge">
              <Icon name={selectedIcon} size={18} color={selectedColor} />
              <span class="preview-name">{selectedIcon}</span>
            </div>
          </div>

          <input
            type="text"
            class="icon-search-input"
            bind:value={iconFilter}
            placeholder={t("folder_settings.icon_search_placeholder")}
          />

          <div class="icons-grid">
            {#each filteredIcons as iconDef}
              <button
                type="button"
                class="icon-choice-btn"
                class:selected={selectedIcon === iconDef.id}
                onclick={() => (selectedIcon = iconDef.id)}
                aria-label={iconDef.label}
              >
                <Icon name={iconDef.id} size={18} />
              </button>
            {/each}
          </div>
        </div>

        <!-- 3. Color & Order -->
        <div class="two-cols">
          <div>
            <span class="input-label">{t("folder_settings.color_label")}</span>
            <div class="color-palette">
              {#each COLOR_PALETTE as colorItem}
                <button
                  type="button"
                  class="color-btn"
                  class:selected={selectedColor === colorItem.value}
                  style="background: {colorItem.value};"
                  onclick={() => (selectedColor = colorItem.value)}
                  aria-label={colorItem.name}
                ></button>
              {/each}
            </div>
          </div>

          <div>
            <label for="folder-order" class="input-label">{t("folder_settings.order_label")}</label>
            <input
              id="folder-order"
              type="number"
              class="text-input order-input"
              bind:value={order}
              min="0"
              max="999"
            />
          </div>
        </div>

        <!-- 4. Description -->
        <label for="folder-desc" class="input-label">{t("folder_settings.desc_label")}</label>
        <textarea
          id="folder-desc"
          class="text-input desc-textarea"
          bind:value={description}
          placeholder={t("folder_settings.desc_placeholder")}
          rows="2"
        ></textarea>

        {#if errorMessage}
          <div class="error-msg">{errorMessage}</div>
        {/if}
      </div>

      <div class="modal-footer">
        <button class="cancel-btn" onclick={onClose}>{t("common.cancel")}</button>
        <button class="submit-btn" onclick={handleSave} disabled={isSaving}>
          {isSaving ? t("folder_settings.saving") : t("folder_settings.save")}
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
    max-width: 500px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    -webkit-transform: translate3d(0, 0, 0);
    transform: translate3d(0, 0, 0);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 18px;
    border-bottom: 1px solid var(--cortex-border-subtle, rgba(148, 163, 184, 0.15));
    background: var(--cortex-bg-header, rgba(30, 41, 59, 0.3));
  }

  .title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 0.98rem;
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
  }

  .close-btn:hover {
    color: var(--cortex-fg-primary, #ffffff);
  }

  .modal-body {
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 75vh;
    overflow-y: auto;
    background: var(--cortex-bg-main, transparent);
  }

  .path-badge {
    font-size: 0.78rem;
    color: var(--cortex-fg-secondary, #94a3b8);
    background: var(--cortex-bg-card, rgba(30, 41, 59, 0.5));
    padding: 5px 8px;
    border-radius: 6px;
    border: 1px solid var(--cortex-border-subtle, rgba(148, 163, 184, 0.1));
  }

  .path-badge code {
    color: var(--cortex-accent, #38bdf8);
    font-family: monospace;
  }

  .input-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--cortex-fg-secondary, #cbd5e1);
    margin-top: 2px;
  }

  .text-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--cortex-bg-input, rgba(15, 23, 42, 0.8));
    border: 1px solid var(--cortex-border, rgba(148, 163, 184, 0.25));
    border-radius: 6px;
    padding: 7px 10px;
    color: var(--cortex-fg-primary, #f8fafc);
    font-family: inherit;
    font-size: 0.85rem;
    outline: none;
    transition: border-color 0.15s;
  }

  .text-input:focus {
    border-color: var(--cortex-accent, #3b82f6);
  }

  .desc-textarea {
    resize: vertical;
  }

  /* ICON PICKER */
  .icon-picker-section {
    background: var(--cortex-bg-card, rgba(30, 41, 59, 0.3));
    border: 1px solid var(--cortex-border-subtle, rgba(148, 163, 184, 0.15));
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .preview-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--cortex-bg-input, rgba(15, 23, 42, 0.7));
    padding: 3px 8px;
    border-radius: 5px;
    border: 1px solid var(--cortex-border, rgba(148, 163, 184, 0.2));
  }

  .preview-name {
    font-size: 0.75rem;
    color: var(--cortex-fg-secondary, #94a3b8);
    font-family: monospace;
  }

  .icon-search-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--cortex-bg-input, rgba(15, 23, 42, 0.6));
    border: 1px solid var(--cortex-border, rgba(148, 163, 184, 0.2));
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 0.78rem;
    color: var(--cortex-fg-primary, #f1f5f9);
    outline: none;
  }

  .icons-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
    max-height: 120px;
    overflow-y: auto;
    padding: 2px;
  }

  .icon-choice-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    background: var(--cortex-bg-input, rgba(15, 23, 42, 0.5));
    border: 1px solid transparent;
    border-radius: 5px;
    color: var(--cortex-fg-muted, #94a3b8);
    cursor: pointer;
    transition: all 0.12s;
  }

  .icon-choice-btn:hover {
    background: var(--cortex-accent-subtle, rgba(59, 130, 246, 0.2));
    color: var(--cortex-accent, #ffffff);
  }

  .icon-choice-btn.selected {
    background: var(--cortex-accent, #3b82f6);
    color: var(--cortex-accent-fg, #ffffff);
    border-color: var(--cortex-accent, #60a5fa);
  }

  /* COLOR & ORDER */
  .two-cols {
    display: grid;
    grid-template-columns: 1fr 110px;
    gap: 14px;
    align-items: flex-start;
  }

  .color-palette {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }

  .color-btn {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.15s, border-color 0.15s;
  }

  .color-btn:hover {
    transform: scale(1.15);
  }

  .color-btn.selected {
    border-color: var(--cortex-fg-primary, #ffffff);
    box-shadow: 0 0 6px var(--cortex-accent, rgba(255, 255, 255, 0.5));
  }

  .order-input {
    margin-top: 4px;
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
