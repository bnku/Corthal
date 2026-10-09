<script lang="ts">
  import type { NoteFrontmatter } from "$lib/types";
  import Icon from "./Icon.svelte";

  interface Props {
    properties: NoteFrontmatter;
    onTagClick?: (tag: string) => void;
  }

  let { properties, onTagClick }: Props = $props();

  let isCollapsed = $state(false);

  // Filter out properties that are rendered in dedicated slots
  let extraEntries = $derived(() => {
    const specialKeys = new Set(["title", "status", "tags", "date"]);
    return Object.entries(properties).filter(([k, v]) => !specialKeys.has(k) && v !== undefined && v !== "");
  });

  function getStatusClass(status?: string): string {
    const s = (status || "").toLowerCase();
    if (s === "active" || s === "verified") return "status-active";
    if (s === "draft" || s === "experimental") return "status-draft";
    if (s === "deprecated") return "status-deprecated";
    return "status-neutral";
  }

  function getStatusLabel(status?: string): string {
    const s = (status || "").toLowerCase();
    if (s === "active") return "Активно";
    if (s === "verified") return "Проверено";
    if (s === "draft") return "Черновик";
    if (s === "deprecated") return "Устарело";
    return status || "";
  }
</script>

<div class="properties-card" class:collapsed={isCollapsed}>
  <div
    class="properties-header"
    onclick={() => (isCollapsed = !isCollapsed)}
    role="button"
    tabindex="0"
    onkeydown={(e) => e.key === "Enter" && (isCollapsed = !isCollapsed)}
  >
    <div class="header-left">
      <span class="chevron">
        <Icon name={isCollapsed ? "chevron-right" : "chevron-down"} size={13} color="#64748b" />
      </span>
      <span class="header-title">Свойства</span>
      {#if properties.tags && properties.tags.length > 0}
        <span class="tag-counter">({properties.tags.length})</span>
      {/if}
    </div>
    {#if isCollapsed}
      <div class="header-summary">
        {#if properties.status}
          <span class="status-pill {getStatusClass(properties.status)}">
            {getStatusLabel(properties.status)}
          </span>
        {/if}
        {#if properties.tags && properties.tags.length > 0}
          <span class="summary-tag">#{properties.tags[0]}</span>
          {#if properties.tags.length > 1}
            <span class="summary-more">+{properties.tags.length - 1}</span>
          {/if}
        {/if}
      </div>
    {/if}
  </div>

  {#if !isCollapsed}
    <div class="properties-body">
      <!-- 1. Title -->
      {#if properties.title}
        <div class="prop-row">
          <div class="prop-key">
            <Icon name="pin" size={14} color="#94a3b8" />
            <span>Название</span>
          </div>
          <div class="prop-value strong">{properties.title}</div>
        </div>
      {/if}

      <!-- 2. Status -->
      {#if properties.status}
        <div class="prop-row">
          <div class="prop-key">
            <Icon name="check-circle" size={14} color="#94a3b8" />
            <span>Статус</span>
          </div>
          <div class="prop-value">
            <span class="status-pill {getStatusClass(properties.status)}">
              <span class="status-dot"></span>
              {getStatusLabel(properties.status)}
            </span>
          </div>
        </div>
      {/if}

      <!-- 3. Date -->
      {#if properties.date}
        <div class="prop-row">
          <div class="prop-key">
            <Icon name="calendar" size={14} color="#94a3b8" />
            <span>Дата</span>
          </div>
          <div class="prop-value date-val">{properties.date}</div>
        </div>
      {/if}

      <!-- 4. Tags -->
      {#if properties.tags && properties.tags.length > 0}
        <div class="prop-row">
          <div class="prop-key">
            <Icon name="tag" size={14} color="#94a3b8" />
            <span>Теги</span>
          </div>
          <div class="prop-value tags-container">
            {#each properties.tags as tag}
              <button
                class="tag-pill"
                onclick={(e) => {
                  e.stopPropagation();
                  onTagClick?.(tag);
                }}
              >
                #{tag}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- 5. Additional custom frontmatter fields -->
      {#each extraEntries() as [key, value]}
        <div class="prop-row">
          <div class="prop-key">
            <Icon name="settings" size={14} color="#94a3b8" />
            <span>{key}</span>
          </div>
          <div class="prop-value extra-val">
            {#if Array.isArray(value)}
              {value.join(", ")}
            {:else}
              {value}
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .properties-card {
    background: rgba(15, 23, 42, 0.65);
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 8px;
    margin-bottom: 24px;
    font-size: 0.85rem;
    overflow: hidden;
    transition: all 0.2s ease;
  }

  .properties-card:hover {
    border-color: rgba(148, 163, 184, 0.28);
  }

  .properties-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    cursor: pointer;
    user-select: none;
    background: rgba(30, 41, 59, 0.4);
    transition: background 0.15s;
  }

  .properties-header:hover {
    background: rgba(30, 41, 59, 0.7);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #94a3b8;
    font-weight: 600;
  }

  .chevron {
    font-size: 0.75rem;
    color: #64748b;
  }

  .tag-counter {
    font-size: 0.75rem;
    color: #64748b;
  }

  .header-summary {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .summary-tag {
    color: #818cf8;
    font-size: 0.78rem;
  }

  .summary-more {
    font-size: 0.75rem;
    color: #64748b;
  }

  .properties-body {
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .prop-row {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 4px 0;
  }

  .prop-key {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #94a3b8;
    font-size: 0.82rem;
    width: 100px;
    flex-shrink: 0;
  }

  .prop-icon {
    font-size: 0.85rem;
    opacity: 0.8;
  }

  .prop-value {
    color: #e2e8f0;
    font-size: 0.85rem;
    flex-grow: 1;
    min-width: 0;
    word-break: break-word;
  }

  .prop-value.strong {
    font-weight: 600;
    color: #f8fafc;
  }

  .date-val {
    color: #cbd5e1;
    font-family: monospace;
    font-size: 0.82rem;
  }

  .extra-val {
    color: #cbd5e1;
  }

  /* TAGS */
  .tags-container {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tag-pill {
    background: rgba(99, 102, 241, 0.15);
    color: #a5b4fc;
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 9999px;
    padding: 2px 9px;
    font-size: 0.78rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tag-pill:hover {
    background: rgba(99, 102, 241, 0.3);
    border-color: #818cf8;
    color: #ffffff;
  }

  /* STATUS BADGE */
  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 9999px;
    font-size: 0.76rem;
    font-weight: 500;
    border: 1px solid transparent;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .status-active {
    background: rgba(16, 185, 129, 0.15);
    border-color: rgba(16, 185, 129, 0.35);
    color: #34d399;
  }
  .status-active .status-dot {
    background: #10b981;
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
  }

  .status-draft {
    background: rgba(245, 158, 11, 0.15);
    border-color: rgba(245, 158, 11, 0.35);
    color: #fbbf24;
  }
  .status-draft .status-dot {
    background: #f59e0b;
  }

  .status-deprecated {
    background: rgba(100, 116, 139, 0.15);
    border-color: rgba(100, 116, 139, 0.3);
    color: #94a3b8;
  }
  .status-deprecated .status-dot {
    background: #64748b;
  }

  .status-neutral {
    background: rgba(59, 130, 246, 0.15);
    border-color: rgba(59, 130, 246, 0.35);
    color: #60a5fa;
  }
  .status-neutral .status-dot {
    background: #3b82f6;
  }
</style>
