<script lang="ts">
  import Icon from "./Icon.svelte";

  export interface SelectOption {
    value: string | number;
    label: string;
    description?: string;
    badge?: string;
    icon?: string;
  }

  interface Props {
    value?: string | number;
    options: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    class?: string;
    id?: string;
    maxMenuHeight?: string;
    dropdownWidth?: string;
    onchange?: (value: any) => void;
  }

  let {
    value = $bindable(""),
    options = [],
    placeholder = "Выберите вариант...",
    disabled = false,
    class: className = "",
    id,
    maxMenuHeight = "240px",
    dropdownWidth,
    onchange,
  }: Props = $props();

  let isOpen = $state(false);
  let containerEl = $state<HTMLDivElement | null>(null);

  // Selected option lookup
  let selectedOption = $derived(options.find((opt) => opt.value === value));

  function toggleOpen(e: MouseEvent) {
    e.stopPropagation();
    if (disabled) return;
    isOpen = !isOpen;
  }

  function handleSelect(optValue: string | number, e: MouseEvent) {
    e.stopPropagation();
    value = optValue;
    isOpen = false;
    onchange?.(optValue);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (disabled) return;
    if (e.key === "Escape") {
      if (isOpen) {
        e.stopPropagation();
        isOpen = false;
      }
    } else if (e.key === "Enter" || e.key === " ") {
      if (!isOpen) {
        e.preventDefault();
        isOpen = true;
      }
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!isOpen) {
        e.preventDefault();
        isOpen = true;
        return;
      }
      e.preventDefault();
      const currentIndex = options.findIndex((opt) => opt.value === value);
      let nextIndex = 0;
      if (e.key === "ArrowDown") {
        nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
      }
      if (options[nextIndex]) {
        value = options[nextIndex].value;
        onchange?.(options[nextIndex].value);
      }
    }
  }

  $effect(() => {
    if (isOpen) {
      function handleClickOutside(e: MouseEvent) {
        if (containerEl && !containerEl.contains(e.target as Node)) {
          isOpen = false;
        }
      }
      window.addEventListener("click", handleClickOutside, true);
      return () => {
        window.removeEventListener("click", handleClickOutside, true);
      };
    }
  });
</script>

<div
  bind:this={containerEl}
  {id}
  class="cortex-custom-select {className}"
  class:is-open={isOpen}
  class:is-disabled={disabled}
>
  <button
    type="button"
    class="select-trigger"
    onclick={toggleOpen}
    onkeydown={handleKeydown}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    {disabled}
  >
    <div class="trigger-label-group">
      {#if selectedOption}
        {#if selectedOption.badge}
          <span class="trigger-badge">{selectedOption.badge}</span>
        {/if}
        <span class="trigger-text" title={selectedOption.label}>
          {selectedOption.label}
        </span>
      {:else}
        <span class="trigger-placeholder">{placeholder}</span>
      {/if}
    </div>

    <div class="trigger-chevron" class:flipped={isOpen}>
      <Icon name="chevron-down" size={14} color="var(--cortex-fg-muted, #94a3b8)" />
    </div>
  </button>

  {#if isOpen}
    <div
      class="select-dropdown-menu custom-scroll"
      style:max-height={maxMenuHeight}
      style:width={dropdownWidth || "100%"}
      role="listbox"
    >
      {#if options.length === 0}
        <div class="select-empty">Нет доступных вариантов</div>
      {:else}
        {#each options as opt}
          {@const isSelected = opt.value === value}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div
            class="select-option-item"
            class:is-selected={isSelected}
            onclick={(e) => handleSelect(opt.value, e)}
            role="option"
            aria-selected={isSelected}
            tabindex="0"
          >
            <div class="option-content">
              <div class="option-label-row">
                {#if opt.badge}
                  <span class="option-badge">{opt.badge}</span>
                {/if}
                <span class="option-label" title={opt.label}>{opt.label}</span>
              </div>
              {#if opt.description}
                <span class="option-desc">{opt.description}</span>
              {/if}
            </div>

            {#if isSelected}
              <div class="option-check">
                <Icon name="check" size={14} color="var(--cortex-accent, #38bdf8)" />
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .cortex-custom-select {
    position: relative;
    width: 100%;
    min-width: 0;
    user-select: none;
    font-family: inherit;
  }

  .select-trigger {
    width: 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 11px;
    background: var(--cortex-bg-main, #13161c);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.12));
    border-radius: 6px;
    color: var(--cortex-fg-primary, #ffffff);
    font-size: 0.82rem;
    text-align: left;
    cursor: pointer;
    outline: none;
    transition: all 0.15s ease;
    box-sizing: border-box;
  }

  .select-trigger:hover:not(:disabled) {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.04));
    border-color: var(--cortex-border-hover, rgba(255, 255, 255, 0.22));
  }

  .cortex-custom-select.is-open .select-trigger {
    border-color: var(--cortex-accent, #3b82f6);
    box-shadow: 0 0 0 1px var(--cortex-accent, #3b82f6);
  }

  .cortex-custom-select.is-disabled .select-trigger {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .trigger-label-group {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }

  .trigger-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 450;
    color: var(--cortex-fg-primary, #ffffff);
  }

  .trigger-placeholder {
    color: var(--cortex-fg-muted, #64748b);
    font-style: italic;
  }

  .trigger-badge {
    background: rgba(59, 130, 246, 0.15);
    color: var(--cortex-accent, #38bdf8);
    font-size: 0.68rem;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .trigger-chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: transform 0.2s ease;
  }

  .trigger-chevron.flipped {
    transform: rotate(180deg);
  }

  /* DROPDOWN MENU */
  .select-dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 1000;
    background: var(--cortex-bg-card, #1a1d26);
    border: 1px solid var(--cortex-border-hover, rgba(255, 255, 255, 0.16));
    border-radius: 8px;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.05);
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px;
    box-sizing: border-box;
    animation: dropIn 0.12s ease-out;
  }

  @keyframes dropIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .select-empty {
    padding: 10px;
    text-align: center;
    font-size: 0.78rem;
    color: var(--cortex-fg-muted, #64748b);
  }

  .select-option-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.12s ease;
    outline: none;
    box-sizing: border-box;
  }

  .select-option-item:hover,
  .select-option-item:focus {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.06));
  }

  .select-option-item.is-selected {
    background: rgba(59, 130, 246, 0.12);
  }

  .select-option-item.is-selected .option-label {
    color: var(--cortex-accent, #38bdf8);
    font-weight: 550;
  }

  .option-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .option-label-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .option-badge {
    background: rgba(59, 130, 246, 0.15);
    color: var(--cortex-accent, #38bdf8);
    font-size: 0.65rem;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .option-label {
    font-size: 0.8rem;
    color: var(--cortex-fg-primary, #ffffff);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .option-desc {
    font-size: 0.7rem;
    color: var(--cortex-fg-muted, #94a3b8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .option-check {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* Custom scrollbar */
  .custom-scroll::-webkit-scrollbar {
    width: 6px;
  }
  .custom-scroll::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scroll::-webkit-scrollbar-thumb {
    background: var(--cortex-border, rgba(255, 255, 255, 0.15));
    border-radius: 3px;
  }
  .custom-scroll::-webkit-scrollbar-thumb:hover {
    background: var(--cortex-border-hover, rgba(255, 255, 255, 0.25));
  }
</style>
