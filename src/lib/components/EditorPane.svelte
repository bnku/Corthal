<script lang="ts">
  import { marked } from "marked";
  import { parseFrontmatter } from "$lib/frontmatter";
  import Icon from "./Icon.svelte";
  import SecretPill from "./SecretPill.svelte";
  import PropertiesBlock from "./PropertiesBlock.svelte";

  interface TabInfo {
    path: string;
    title: string;
    isDirty?: boolean;
  }

  interface Props {
    paneId: "left" | "right";
    isFocused: boolean;
    tabs: TabInfo[];
    activePath: string | null;
    content: string;
    isEditing: boolean;
    isSaving: boolean;
    saveFeedback: boolean;
    isSplit: boolean;
    canCloseSplit?: boolean;
    onFocusPane: () => void;
    onSelectTab: (path: string) => void;
    onCloseTab: (path: string) => void;
    onToggleEditing: (isEditing: boolean) => void;
    onSaveNote: () => void;
    onSplitToggle: () => void;
    onCloseSplit?: () => void;
    onOpenSecretModal: () => void;
    onContentChange: (newContent: string) => void;
    onTagClick?: (tag: string) => void;
    onOpenCreateNote?: () => void;
  }

  let {
    paneId,
    isFocused,
    tabs,
    activePath,
    content,
    isEditing,
    isSaving,
    saveFeedback,
    isSplit,
    canCloseSplit = false,
    onFocusPane,
    onSelectTab,
    onCloseTab,
    onToggleEditing,
    onSaveNote,
    onSplitToggle,
    onCloseSplit,
    onOpenSecretModal,
    onContentChange,
    onTagClick,
    onOpenCreateNote,
  }: Props = $props();

  // Parse YAML Frontmatter & Body
  let parsedDoc = $derived(parseFrontmatter(content));

  interface ContentSlice {
    type: "text" | "secret";
    content: string;
  }

  let contentSlices = $derived.by<ContentSlice[]>(() => {
    const raw = parsedDoc.body;
    const slices: ContentSlice[] = [];
    const regex = /(`?🔒\[enc:v1:[A-Za-z0-9+/=]+\]`?)/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(raw)) !== null) {
      if (match.index > lastIndex) {
        slices.push({
          type: "text",
          content: raw.slice(lastIndex, match.index),
        });
      }
      slices.push({
        type: "secret",
        content: match[1],
      });
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < raw.length) {
      slices.push({
        type: "text",
        content: raw.slice(lastIndex),
      });
    }

    return slices;
  });

  function handleTabClick(path: string, e: MouseEvent) {
    e.stopPropagation();
    onFocusPane();
    onSelectTab(path);
  }

  function handleCloseTab(path: string, e: MouseEvent) {
    e.stopPropagation();
    onCloseTab(path);
  }

  function handleTextareaInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    onContentChange(target.value);
  }

  function handleTabsWheel(e: WheelEvent) {
    const container = e.currentTarget as HTMLElement;
    if (e.deltaY !== 0 || e.deltaX !== 0) {
      e.preventDefault();
      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        container.scrollLeft += e.deltaY;
      } else {
        container.scrollLeft += e.deltaX;
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      onSaveNote();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "w" && activePath) {
      e.preventDefault();
      onCloseTab(activePath);
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
  class="editor-pane"
  class:focused={isFocused}
  onclick={onFocusPane}
  onkeydown={handleKeydown}
  role="region"
  aria-label={`Панель редактора ${paneId === "left" ? "1" : "2"}`}
  tabindex="0"
>
  <!-- TAB BAR -->
  <div class="tabs-header-bar">
    <div class="tabs-scroll-area" onwheel={handleTabsWheel}>
      {#each tabs as tab (tab.path)}
        {@const isActive = tab.path === activePath}
        <div
          class="editor-tab"
          class:active={isActive}
          onclick={(e) => handleTabClick(tab.path, e)}
          onauxclick={(e) => e.button === 1 && handleCloseTab(tab.path, e)}
          role="tab"
          tabindex="0"
          aria-selected={isActive}
          title={tab.path}
          onkeydown={(e) => e.key === "Enter" && handleTabClick(tab.path, e as any)}
        >
          <span class="tab-icon">
            <Icon name="file-text" size={13} color={isActive ? "var(--cortex-accent)" : "var(--cortex-fg-muted)"} />
          </span>
          <span class="tab-title">{tab.title}</span>

          {#if tab.isDirty}
            <span class="dirty-indicator" title="Несохранённые изменения">●</span>
          {/if}

          <button
            class="tab-close-btn"
            aria-label="Закрыть вкладку"
            onclick={(e) => handleCloseTab(tab.path, e)}
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      {/each}
    </div>

    <!-- PANE TOOLBAR ACTIONS (Right side of tab bar) -->
    <div class="pane-actions">
      {#if activePath}
        <!-- Insert Secret Button (visible when editing) -->
        {#if isEditing}
          <button
            class="pane-action-btn secret-btn"
            title="Зашифровать и вставить секрет"
            onclick={onOpenSecretModal}
          >
            <Icon name="lock" size={12} color="#f59e0b" />
            <span class="btn-text">Секрет</span>
          </button>
        {/if}

        <!-- Mode Toggle: View / Edit -->
        <div class="mode-toggle-group">
          <button
            class="mode-btn"
            class:active={!isEditing}
            onclick={() => onToggleEditing(false)}
            title="Режим просмотра Markdown"
          >
            <Icon name="eye" size={12} />
            <span class="btn-text">Просмотр</span>
          </button>
          <button
            class="mode-btn"
            class:active={isEditing}
            onclick={() => onToggleEditing(true)}
            title="Режим правки"
          >
            <Icon name="file-edit" size={12} />
            <span class="btn-text">Правка</span>
          </button>
        </div>
      {/if}

      <!-- Close Right Pane Button (if split and this is the right pane) -->
      {#if canCloseSplit && onCloseSplit}
        <button
          class="pane-action-btn close-pane-btn"
          onclick={onCloseSplit}
          title="Закрыть эту панель"
        >
          <Icon name="x" size={13} />
        </button>
      {/if}
    </div>
  </div>

  <!-- PANE BODY -->
  <div class="pane-content-body">
    {#if activePath}
      {#if isEditing}
        <textarea
          class="editor-area"
          value={content}
          oninput={handleTextareaInput}
          placeholder="Пишите в формате Markdown..."
          spellcheck="false"
        ></textarea>
      {:else}
        <div class="markdown-preview">
          <!-- Properties Block -->
          {#if parsedDoc.frontmatter && Object.keys(parsedDoc.frontmatter).length > 0}
            <PropertiesBlock
              properties={parsedDoc.frontmatter}
              onTagClick={(tag) => onTagClick?.(tag)}
            />
          {/if}

          <!-- Note Content Body -->
          {#each contentSlices as slice}
            {#if slice.type === "secret"}
              <SecretPill token={slice.content} />
            {:else}
              {@html marked.parse(slice.content)}
            {/if}
          {/each}
        </div>
      {/if}
    {:else}
      <!-- Empty Pane State -->
      <div class="empty-pane">
        <Icon name="book-open" size={40} color="var(--cortex-fg-muted, #64748b)" />
        <p class="empty-title">Нет открытых вкладок</p>
        <p class="empty-desc">Выберите заметку в проводнике слева или создайте новую</p>
        {#if onOpenCreateNote}
          <button class="empty-create-btn" onclick={onOpenCreateNote}>
            <Icon name="plus" size={13} />
            <span>Создать заметку</span>
          </button>
        {/if}
      </div>
    {/if}
  </div>
</section>

<style>
  .editor-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    flex: 1;
    background: var(--cortex-bg-main, #0f172a);
    position: relative;
    outline: none;
  }

  .editor-pane.focused {
    /* Subtle focus border cue */
  }

  /* TABS HEADER BAR */
  .tabs-header-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--cortex-bg-header, #0b1120);
    border-bottom: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    height: 36px;
    user-select: none;
    flex-shrink: 0;
  }

  .tabs-scroll-area {
    display: flex;
    align-items: flex-end;
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    flex: 1;
    min-width: 0;
  }

  .tabs-scroll-area::-webkit-scrollbar {
    display: none;
  }

  /* SINGLE TAB */
  .editor-tab {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 35px;
    padding: 0 11px;
    background: transparent;
    border-right: 1px solid var(--cortex-border-subtle, rgba(255, 255, 255, 0.05));
    border-bottom: 2px solid transparent;
    color: var(--cortex-fg-muted, #94a3b8);
    font-size: 0.78rem;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.12s ease;
    max-width: 220px;
    outline: none;
  }

  .editor-tab:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.04));
    color: var(--cortex-fg-primary, #ffffff);
  }

  .editor-tab.active {
    background: var(--cortex-bg-main, #0f172a);
    color: var(--cortex-fg-primary, #ffffff);
    border-bottom: 2px solid var(--cortex-accent, #38bdf8);
    font-weight: 600;
  }

  .tab-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .tab-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dirty-indicator {
    color: var(--cortex-accent, #38bdf8);
    font-size: 0.75rem;
    line-height: 1;
  }

  .tab-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 17px;
    height: 17px;
    border-radius: 3px;
    background: transparent;
    border: none;
    color: var(--cortex-fg-muted, #94a3b8);
    cursor: pointer;
    opacity: 0.6;
    transition: all 0.12s;
    margin-left: 2px;
  }

  .editor-tab:hover .tab-close-btn,
  .editor-tab.active .tab-close-btn {
    opacity: 1;
  }

  .tab-close-btn:hover {
    background: rgba(255, 255, 255, 0.15);
    color: #ffffff;
  }

  /* PANE ACTIONS */
  .pane-actions {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 8px;
    flex-shrink: 0;
    height: 100%;
  }

  .pane-action-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 7px;
    height: 24px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--cortex-fg-secondary, #94a3b8);
    font-size: 0.72rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .pane-action-btn:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--cortex-fg-primary, #ffffff);
    border-color: var(--cortex-border-subtle, rgba(255, 255, 255, 0.1));
  }

  .pane-action-btn.active {
    color: var(--cortex-accent, #38bdf8);
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.12));
    border-color: var(--cortex-accent-border, rgba(56, 189, 248, 0.3));
  }

  .pane-action-btn.secret-btn {
    color: #f59e0b;
    border-color: rgba(245, 158, 11, 0.25);
    background: rgba(245, 158, 11, 0.06);
  }

  .pane-action-btn.secret-btn:hover {
    background: rgba(245, 158, 11, 0.15);
  }

  /* MODE TOGGLE (View / Edit) */
  .mode-toggle-group {
    display: inline-flex;
    background: var(--cortex-bg-input, rgba(0, 0, 0, 0.25));
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    border-radius: 4px;
    padding: 1px;
    height: 24px;
  }

  .mode-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--cortex-fg-muted, #94a3b8);
    font-size: 0.7rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s;
  }

  .mode-btn:hover {
    color: var(--cortex-fg-primary, #ffffff);
  }

  .mode-btn.active {
    background: var(--cortex-bg-card, rgba(255, 255, 255, 0.12));
    color: var(--cortex-fg-primary, #ffffff);
    font-weight: 600;
  }

  .btn-text {
    font-size: 0.72rem;
  }

  /* PANE CONTENT BODY */
  .pane-content-body {
    flex: 1;
    overflow-y: auto;
    position: relative;
    min-height: 0;
  }

  .editor-area {
    width: 100%;
    height: 100%;
    padding: 20px 24px;
    box-sizing: border-box;
    background: transparent;
    border: none;
    color: var(--cortex-fg-primary, #f1f5f9);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.88rem;
    line-height: 1.6;
    resize: none;
    outline: none;
    user-select: text;
    -webkit-user-select: text;
  }

  .markdown-preview {
    padding: 24px 28px;
    color: var(--cortex-fg-primary, #cbd5e1);
    line-height: 1.65;
    font-size: 0.92rem;
    max-width: 860px;
    margin: 0 auto;
    user-select: text;
    -webkit-user-select: text;
  }

  .markdown-preview :global(*) {
    user-select: text;
    -webkit-user-select: text;
  }

  .markdown-preview :global(h1) {
    font-size: 1.7rem;
    color: var(--cortex-fg-primary, #ffffff);
    margin-top: 0;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--cortex-border-subtle, rgba(255, 255, 255, 0.1));
    padding-bottom: 8px;
  }

  .markdown-preview :global(h2) {
    font-size: 1.3rem;
    color: var(--cortex-fg-primary, #ffffff);
    margin-top: 1.6rem;
    margin-bottom: 0.7rem;
  }

  .markdown-preview :global(h3) {
    font-size: 1.05rem;
    color: var(--cortex-fg-primary, #ffffff);
    margin-top: 1.3rem;
    margin-bottom: 0.5rem;
  }

  .markdown-preview :global(p) {
    margin-top: 0;
    margin-bottom: 0.9rem;
  }

  .markdown-preview :global(ul),
  .markdown-preview :global(ol) {
    margin-top: 0;
    margin-bottom: 0.9rem;
    padding-left: 20px;
  }

  .markdown-preview :global(li) {
    margin-bottom: 0.35rem;
  }

  .markdown-preview :global(code) {
    background: var(--cortex-bg-card, rgba(255, 255, 255, 0.08));
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 0.84rem;
    color: var(--cortex-accent, #38bdf8);
  }

  .markdown-preview :global(pre) {
    background: var(--cortex-bg-card, #091823);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
    padding: 12px 16px;
    overflow-x: auto;
    margin-bottom: 1.2rem;
  }

  .markdown-preview :global(pre code) {
    background: none;
    padding: 0;
    color: var(--cortex-fg-primary, #e2e8f0);
  }

  .markdown-preview :global(blockquote) {
    border-left: 3px solid var(--cortex-accent, #38bdf8);
    margin: 0 0 1rem 0;
    padding: 4px 14px;
    color: var(--cortex-fg-secondary, #94a3b8);
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.05));
    border-radius: 0 4px 4px 0;
  }

  /* EMPTY PANE */
  .empty-pane {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 30px;
    text-align: center;
  }

  .empty-title {
    margin-top: 14px;
    margin-bottom: 6px;
    font-size: 1rem;
    font-weight: 600;
    color: var(--cortex-fg-primary, #ffffff);
  }

  .empty-desc {
    margin: 0 0 16px 0;
    font-size: 0.82rem;
    color: var(--cortex-fg-muted, #94a3b8);
    max-width: 320px;
  }

  .empty-create-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: var(--cortex-accent, #38bdf8);
    color: #ffffff;
    border: none;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .empty-create-btn:hover {
    opacity: 0.9;
  }
</style>
