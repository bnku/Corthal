<script lang="ts">
  import { THEME_PRESETS } from "$lib/theme/presets";
  import Icon from "./Icon.svelte";
  import { t } from "$lib/i18n";

  interface Props {
    isOpen: boolean;
    activeThemeId: string;
    onClose: () => void;
    onSelectTheme: (themeId: string) => void;
    onOpenSettings: () => void;
  }

  let {
    isOpen,
    activeThemeId,
    onClose,
    onSelectTheme,
    onOpenSettings,
  }: Props = $props();

  $effect(() => {
    if (isOpen) {
      function handleClickOutside() {
        onClose();
      }
      function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape" || e.code === "Escape") {
          onClose();
        }
      }
      window.addEventListener("click", handleClickOutside);
      window.addEventListener("keydown", handleKeydown);
      return () => {
        window.removeEventListener("click", handleClickOutside);
        window.removeEventListener("keydown", handleKeydown);
      };
    }
  });
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="theme-dropdown" onclick={(e) => e.stopPropagation()}>
    <div class="dropdown-header">
      <div class="header-left">
        <Icon name="palette" size={14} color="var(--accent-color, #0284c7)" />
        <span class="header-title">{t("theme_dropdown.title")}</span>
      </div>
      <span class="theme-count">{THEME_PRESETS.length}</span>
    </div>

    <div class="theme-list custom-scroll">
      {#each THEME_PRESETS as preset}
        {@const isActive = activeThemeId === preset.id}
        <button
          type="button"
          class="theme-item"
          class:active={isActive}
          onclick={() => {
            onSelectTheme(preset.id);
            onClose();
          }}
        >
          <!-- Color preview swatches -->
          <div class="swatches" style:background={preset.colors.bgMain}>
            <div class="swatch-half" style:background={preset.colors.bgCard}></div>
            <div class="swatch-dot" style:background={preset.colors.fgPrimary}></div>
          </div>

          <div class="theme-details">
            <div class="theme-name-row">
              <span class="theme-name">{preset.name}</span>
              {#if preset.category === "light"}
                <span class="category-badge">{t("theme_dropdown.light_category")}</span>
              {/if}
            </div>
            <div class="theme-desc">{preset.description}</div>
          </div>

          <div class="theme-actions">
            {#if isActive}
              <span class="check-icon">
                <Icon name="check" size={15} color="var(--accent-color, #0284c7)" />
              </span>
            {/if}
          </div>
        </button>
      {/each}
    </div>

    <div class="dropdown-divider"></div>

    <button
      class="action-btn"
      onclick={() => {
        onClose();
        onOpenSettings();
      }}
    >
      <Icon name="sliders" size={14} color="var(--text-muted, #94a3b8)" />
      <span>{t("theme_dropdown.all_settings")}</span>
    </button>
  </div>
{/if}

<style>
  .theme-dropdown {
    position: fixed;
    bottom: 28px;
    right: 12px;
    width: 320px;
    max-height: 420px;
    background: var(--bg-card, #1e293b);
    border: 1px solid var(--border-color, #334155);
    border-radius: 8px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.45), 0 8px 10px -6px rgba(0, 0, 0, 0.35);
    z-index: 9500;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slideUp 0.15s ease-out;
  }

  .dropdown-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--bg-sidebar, rgba(0, 0, 0, 0.15));
    border-bottom: 1px solid var(--border-color, #334155);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted, #94a3b8);
  }

  .theme-count {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--border-color, #334155);
    color: var(--text-muted, #cbd5e1);
  }

  .theme-list {
    display: flex;
    flex-direction: column;
    padding: 6px;
    max-height: 290px;
    overflow-y: auto;
    gap: 3px;
  }

  .theme-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
    background: transparent;
    border: none;
    text-align: left;
    width: 100%;
    font-family: inherit;
  }

  .theme-item:hover {
    background: var(--bg-hover, rgba(255, 255, 255, 0.06));
  }

  .theme-item.active {
    background: var(--bg-active, rgba(2, 132, 199, 0.12));
  }

  .swatches {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .swatch-half {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 14px;
    height: 14px;
    border-top-left-radius: 4px;
  }

  .swatch-dot {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }

  .theme-details {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .theme-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .theme-name {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-main, #f8fafc);
  }

  .category-badge {
    font-size: 9.5px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 4px;
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }

  .theme-desc {
    font-size: 11px;
    color: var(--text-muted, #94a3b8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .theme-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    flex-shrink: 0;
  }

  .check-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dropdown-divider {
    height: 1px;
    background: var(--border-color, #334155);
    margin: 2px 0;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: none;
    border: none;
    color: var(--text-main, #f8fafc);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    width: 100%;
  }

  .action-btn:hover {
    background: var(--bg-hover, rgba(255, 255, 255, 0.06));
    color: var(--accent-color, #38bdf8);
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
