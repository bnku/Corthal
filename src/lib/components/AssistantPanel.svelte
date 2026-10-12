<script lang="ts">
  import { onMount, onDestroy, mount, unmount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { Marked } from "marked";
  import type { AssistantConfig, CodexStatus, AssistantStreamChunk, ChatMessage, AssistantProvider } from "$lib/types";
  import Icon from "./Icon.svelte";
  import SecretPill from "./SecretPill.svelte";

  interface Props {
    activeNotePath: string | null;
    activeNoteContent?: string | null;
    onInsertText?: (text: string) => void;
    onVaultRefresh?: () => void;
    onOpenSettings?: (tab?: "appearance" | "security" | "assistant" | "about") => void;
    onOpenNote?: (path: string) => void;
    onPassphraseNeeded?: () => Promise<string | null>;
  }

  let {
    activeNotePath,
    activeNoteContent = null,
    onInsertText,
    onVaultRefresh,
    onOpenSettings,
    onOpenNote,
    onPassphraseNeeded,
  }: Props = $props();

  const customMarked = new Marked({
    gfm: true,
    breaks: true,
  });

  function formatMessageHtml(text: string): string {
    if (!text) return "";

    // 1. Transform [[target|title]] or [[target]] into Markdown links
    let content = text.replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_m, target, title) => {
      return `[${title ? title.trim() : target.trim()}](${target.trim()})`;
    });

    // 2. Parse Markdown
    let html = customMarked.parse(content) as string;

    // 3. Replace secret tokens `🔒[enc:v1:...]` or 🔒[enc:v1:...] (even inside code tags) with mount points
    const regex = /(?:<code>\s*)?(🔒\[enc:v1:[^\]]+\])(?:\s*<\/code>)?/g;
    return html.replace(regex, (_match, token) => {
      return `<span class="cortex-secret-mount" data-token="${token}"></span>`;
    });
  }

  function mountSecrets(node: HTMLElement, passphraseCallback?: () => Promise<string | null>) {
    let instances: any[] = [];
    let currentCallback = passphraseCallback;

    function renderWidgets() {
      for (const inst of instances) {
        unmount(inst);
      }
      instances = [];

      const placeholders = node.querySelectorAll<HTMLElement>(".cortex-secret-mount");
      for (const el of placeholders) {
        const token = el.getAttribute("data-token");
        if (token) {
          try {
            const inst = mount(SecretPill, {
              target: el,
              props: {
                token,
                autoReveal: true,
                onPassphraseNeeded: () => (currentCallback ? currentCallback() : Promise.resolve(null)),
              },
            });
            instances.push(inst);
          } catch (e) {
            console.error("Failed to mount SecretPill in assistant:", e);
          }
        }
      }
    }

    renderWidgets();

    return {
      update(newCallback?: () => Promise<string | null>) {
        currentCallback = newCallback;
      },
      destroy() {
        for (const inst of instances) {
          unmount(inst);
        }
        instances = [];
      },
    };
  }

  async function handleContentClick(e: MouseEvent) {
    const target = (e.target as HTMLElement).closest("a");
    if (!target) return;

    const href = target.getAttribute("href");
    if (!href) return;

    e.preventDefault();
    e.stopPropagation();

    if (href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) {
      try {
        await openUrl(href);
      } catch (err) {
        console.warn("Failed to open URL via plugin-opener:", err);
        window.open(href, "_blank");
      }
      return;
    }

    onOpenNote?.(href);
  }

  let inputMessage = $state("");
  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let quickSecretInput = $state("");
  let encryptedResult = $state("");
  let isEncrypting = $state(false);
  let showEncryptTool = $state(false);
  let isProviderDropdownOpen = $state(false);
  let copiedId = $state<string | null>(null);

  // User decides whether to attach the open note to the current prompt (opt-in, default false)
  let includeActiveNote = $state(false);

  let isGenerating = $state(false);
  let currentSessionId = $state<string | null>(null);

  let config = $state<AssistantConfig>({
    provider: "codex",
    codex_model: "gpt-5.6-sol",
    codex_sandbox: "read-only",
    openrouter_key: null,
    openrouter_model: "anthropic/claude-3.5-sonnet",
    openrouter_temperature: 0.7,
    openai_base_url: "http://localhost:11434/v1",
    openai_key: null,
    openai_model: "llama3",
    openai_temperature: 0.7,
    system_prompt: "Ты — встроенный AI-ассистент Cortex...",
    include_vault_context: true,
    include_active_note: true,
  });

  let codexStatus = $state<CodexStatus | null>(null);

  let messages = $state<ChatMessage[]>([
    {
      id: "initial",
      role: "assistant",
      text: "Привет! Чем могу помочь? Могу разобрать заметки, ответить на вопросы или помочь с кодом.",
      timestamp: Date.now(),
    },
  ]);

  let unlistenChunk: UnlistenFn | null = null;
  let unlistenConfig: UnlistenFn | null = null;
  let messagesContainer = $state<HTMLDivElement | null>(null);

  onMount(async () => {
    await loadConfig();
    await checkCodex();

    unlistenChunk = await listen<AssistantStreamChunk>("assistant:chunk", (event) => {
      const payload = event.payload;
      if (!currentSessionId || payload.session_id !== currentSessionId) return;

      const lastIdx = messages.length - 1;
      if (lastIdx >= 0 && messages[lastIdx].role === "assistant" && messages[lastIdx].isStreaming) {
        if (payload.full_text) {
          messages[lastIdx].text = payload.full_text;
        } else if (payload.delta) {
          messages[lastIdx].text += payload.delta;
        }

        if (payload.error) {
          messages[lastIdx].text += `\n\n⚠️ **Ошибка**: ${payload.error}`;
        }

        if (payload.done) {
          messages[lastIdx].isStreaming = false;
          isGenerating = false;
          currentSessionId = null;
          onVaultRefresh?.();
        }

        scrollToBottom();
      }
    });

    unlistenConfig = await listen<AssistantConfig>("assistant:config-changed", (event) => {
      config = event.payload;
      checkCodex();
    });

    window.addEventListener("click", handleGlobalClick);
  });

  function handleGlobalClick(e: MouseEvent) {
    if (isProviderDropdownOpen) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".provider-pill-wrap")) {
        isProviderDropdownOpen = false;
      }
    }
  }

  onDestroy(() => {
    window.removeEventListener("click", handleGlobalClick);
    if (unlistenChunk) unlistenChunk();
    if (unlistenConfig) unlistenConfig();
  });

  async function loadConfig() {
    try {
      config = await invoke<AssistantConfig>("assistant_get_config");
    } catch (e) {
      console.error("Failed to load assistant config:", e);
    }
  }

  async function checkCodex() {
    try {
      codexStatus = await invoke<CodexStatus>("assistant_check_codex_status");
    } catch (e) {
      console.error("Failed to check codex status:", e);
    }
  }

  async function handleSaveConfig(newConfig: AssistantConfig) {
    config = newConfig;
    try {
      await invoke("assistant_save_config", { config: newConfig });
    } catch (e) {
      console.error("Failed to save assistant config:", e);
    }
  }

  async function handleSwitchProvider(provider: AssistantProvider) {
    config.provider = provider;
    isProviderDropdownOpen = false;
    await handleSaveConfig(config);
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }, 10);
  }

  function adjustTextareaHeight() {
    if (!textareaEl) return;
    textareaEl.style.height = "auto";
    textareaEl.style.height = `${Math.min(Math.max(textareaEl.scrollHeight, 38), 160)}px`;
  }

  async function copyMessage(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copiedId = id;
      setTimeout(() => {
        if (copiedId === id) copiedId = null;
      }, 1800);
    } catch (e) {
      console.warn("Failed to copy message:", e);
    }
  }

  function insertMessage(text: string) {
    if (onInsertText) {
      onInsertText(text);
    }
  }

  async function handleQuickEncrypt() {
    if (!quickSecretInput.trim()) return;
    isEncrypting = true;
    try {
      const token = await invoke<string>("crypto_encrypt_secret", {
        plaintext: quickSecretInput,
        pubkeyContent: null,
      });
      encryptedResult = token;
      quickSecretInput = "";
    } catch (err: any) {
      alert("Ошибка шифрования: " + err);
    } finally {
      isEncrypting = false;
    }
  }

  async function handleSendMessage() {
    if (!inputMessage.trim() || isGenerating) return;

    let sanitized = inputMessage;

    // Optional pre-send interception if user specifically typed {{secret:...}}
    const secretRegex = /\{\{secret:(.*?)\}\}/g;
    const matches = [...inputMessage.matchAll(secretRegex)];
    if (matches.length > 0) {
      for (const match of matches) {
        const rawPlaintext = match[1];
        try {
          const token = await invoke<string>("crypto_encrypt_secret", {
            plaintext: rawPlaintext,
            pubkeyContent: null,
          });
          sanitized = sanitized.replace(match[0], token);
        } catch (err: any) {
          alert("Не удалось зашифровать секрет: " + err);
          return;
        }
      }
    }

    const userText = sanitized;
    inputMessage = "";
    if (textareaEl) {
      textareaEl.style.height = "auto";
    }

    // Add user message
    messages.push({
      id: crypto.randomUUID(),
      role: "user",
      text: userText,
      timestamp: Date.now(),
    });

    // Create session and assistant placeholder
    const sessionId = crypto.randomUUID();
    currentSessionId = sessionId;
    isGenerating = true;

    let currentModel = config.provider === "codex"
      ? config.codex_model
      : config.provider === "openrouter"
      ? config.openrouter_model
      : config.openai_model;

    messages.push({
      id: sessionId,
      role: "assistant",
      text: "",
      timestamp: Date.now(),
      model: currentModel,
      provider: config.provider,
      isStreaming: true,
    });

    scrollToBottom();

    // Prepare note context only if explicitly requested by user
    let noteContext: string | null = null;
    if (includeActiveNote && activeNotePath) {
      noteContext = `Файл: ${activeNotePath}\n`;
      if (activeNoteContent) {
        noteContext += `Содержимое:\n${activeNoteContent.slice(0, 8000)}`;
      }
    }

    // Format history for backend
    const historyPayload = messages
      .filter((m) => m.id !== sessionId && m.id !== "initial")
      .map((m) => ({ role: m.role, content: m.text }));

    try {
      await invoke("assistant_send_message", {
        sessionId,
        prompt: userText,
        messages: historyPayload,
        activeNoteContext: noteContext,
      });
    } catch (err: any) {
      const lastIdx = messages.length - 1;
      if (lastIdx >= 0 && messages[lastIdx].id === sessionId) {
        messages[lastIdx].text = `⚠️ Ошибка: ${err}`;
        messages[lastIdx].isStreaming = false;
      }
      isGenerating = false;
      currentSessionId = null;
    }
  }

  async function handleStopGeneration() {
    if (!currentSessionId) return;
    try {
      await invoke("assistant_cancel_stream", { sessionId: currentSessionId });
    } catch (e) {
      console.error("Failed to cancel stream:", e);
    }
  }

  function handleClearChat() {
    messages = [
      {
        id: "initial",
        role: "assistant",
        text: "Диалог очищен. Чем могу помочь?",
        timestamp: Date.now(),
      },
    ];
  }

  function getProviderLabel(p: AssistantProvider): string {
    switch (p) {
      case "codex":
        return "Codex";
      case "openrouter":
        return "OpenRouter";
      case "openai":
        return "OpenAI API";
    }
  }

  function getActiveModelBadge(): string {
    switch (config.provider) {
      case "codex":
        return config.codex_model || "gpt-5.6-sol";
      case "openrouter":
        return config.openrouter_model.split("/").pop() || "claude";
      case "openai":
        return config.openai_model || "llama3";
    }
  }

  let activeFileName = $derived(activeNotePath ? activeNotePath.split("/").pop() || "" : "");
</script>

<div class="assistant-container">
  <!-- Top Header with Provider, Model Pill, and Action Icons -->
  <div class="header">
    <div class="header-left">
      <div class="title-block">
        <Icon name="bot" size={16} color="var(--cortex-accent, #38bdf8)" />
        <span class="panel-heading">Ассистент</span>
      </div>

      <!-- Provider / Model Pill -->
      <div class="provider-pill-wrap">
        <button
          type="button"
          class="provider-pill"
          onclick={(e) => {
            e.stopPropagation();
            isProviderDropdownOpen = !isProviderDropdownOpen;
          }}
          title="Сменить активного провайдера"
        >
          <span
            class="provider-dot"
            class:online={config.provider === "codex" ? codexStatus?.is_logged_in : true}
          ></span>
          <span class="provider-name">{getProviderLabel(config.provider)}</span>
          <span class="model-badge">{getActiveModelBadge()}</span>
          <Icon name="chevron-down" size={11} class="chevron-icon" />
        </button>

        {#if isProviderDropdownOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="provider-dropdown" onclick={(e) => e.stopPropagation()}>
            <div class="p-drop-header">Выбор ИИ-движка</div>
            <button
              type="button"
              class="p-drop-item"
              class:active={config.provider === "codex"}
              onclick={() => handleSwitchProvider("codex")}
            >
              <div class="p-item-left">
                <span class="p-item-title">Codex CLI</span>
                <span class="p-item-sub">ChatGPT Plus/Pro • {config.codex_model}</span>
              </div>
              {#if codexStatus?.is_logged_in}
                <span class="p-tag ok">ChatGPT</span>
              {/if}
            </button>

            <button
              type="button"
              class="p-drop-item"
              class:active={config.provider === "openrouter"}
              onclick={() => handleSwitchProvider("openrouter")}
            >
              <div class="p-item-left">
                <span class="p-item-title">OpenRouter</span>
                <span class="p-item-sub">{config.openrouter_model}</span>
              </div>
              <span class="p-tag blue">API</span>
            </button>

            <button
              type="button"
              class="p-drop-item"
              class:active={config.provider === "openai"}
              onclick={() => handleSwitchProvider("openai")}
            >
              <div class="p-item-left">
                <span class="p-item-title">OpenAI / Local</span>
                <span class="p-item-sub">{config.openai_model} • {config.openai_base_url.replace(/https?:\/\//, '')}</span>
              </div>
              <span class="p-tag purple">Local</span>
            </button>

            <div class="p-drop-divider"></div>

            <button
              type="button"
              class="p-drop-settings-btn"
              onclick={() => {
                isProviderDropdownOpen = false;
                onOpenSettings?.("assistant");
              }}
            >
              <Icon name="sliders" size={13} />
              <span>Параметры ИИ-ассистента...</span>
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Header Quick Actions -->
    <div class="header-actions">
      <button
        type="button"
        class="action-icon-btn"
        class:active={showEncryptTool}
        onclick={() => (showEncryptTool = !showEncryptTool)}
        title="Шифрование секрета"
        aria-label="Шифрование"
      >
        <Icon name="lock" size={13} />
      </button>

      <button
        type="button"
        class="action-icon-btn"
        onclick={handleClearChat}
        title="Очистить диалог"
        aria-label="Очистить диалог"
      >
        <Icon name="trash" size={13} />
      </button>

      <button
        type="button"
        class="action-icon-btn"
        onclick={() => onOpenSettings?.("assistant")}
        title="Параметры"
        aria-label="Параметры"
      >
        <Icon name="settings" size={13} />
      </button>
    </div>
  </div>

  <!-- Quick Encrypt Dropdown Panel -->
  {#if showEncryptTool}
    <div class="quick-encrypt-box">
      <div class="box-title">Шифрование секрета публичным SSH-ключом:</div>
      <div class="input-row">
        <input
          type="password"
          placeholder="Введите секрет..."
          bind:value={quickSecretInput}
          onkeydown={(e) => e.key === "Enter" && handleQuickEncrypt()}
        />
        <button type="button" class="encrypt-btn" onclick={handleQuickEncrypt} disabled={isEncrypting}>
          {isEncrypting ? "..." : "Зашифровать"}
        </button>
      </div>

      {#if encryptedResult}
        <div class="result-box">
          <code class="token-code">{encryptedResult}</code>
          <div class="result-actions">
            <button type="button" class="res-btn" onclick={() => navigator.clipboard.writeText(encryptedResult)}>
              <Icon name="copy" size={11} />
              <span>Копировать</span>
            </button>
            {#if onInsertText}
              <button type="button" class="res-btn" onclick={() => onInsertText?.(encryptedResult)}>
                <Icon name="file-down" size={11} />
                <span>Вставить</span>
              </button>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Messages Scroll Area -->
  <div class="messages-area" bind:this={messagesContainer}>
    {#each messages as msg (msg.id)}
      <div class="message-row {msg.role}">
        <div class="bubble {msg.role}">
          <div class="bubble-content">
            {#if msg.role === "assistant"}
              {#if msg.isStreaming}
                <div class="streaming-text">{msg.text}<span class="streaming-cursor">▋</span></div>
              {:else}
                {#key msg.text}
                  <div
                    class="bubble-markdown"
                    use:mountSecrets={onPassphraseNeeded}
                    onclick={handleContentClick}
                  >
                    {@html formatMessageHtml(msg.text)}
                  </div>
                {/key}
              {/if}
            {:else}
              <div class="user-text">{msg.text}</div>
            {/if}
          </div>

          <!-- Subtle Hover Action Toolbar on Assistant Messages -->
          {#if msg.role === "assistant" && msg.text && !msg.isStreaming}
            <div class="hover-toolbar">
              <button
                type="button"
                class="hover-icon-btn"
                onclick={() => copyMessage(msg.id, msg.text)}
                title={copiedId === msg.id ? "Скопировано!" : "Копировать"}
              >
                <Icon
                  name={copiedId === msg.id ? "check" : "copy"}
                  size={12}
                  color={copiedId === msg.id ? "var(--cortex-accent, #38bdf8)" : "currentColor"}
                />
              </button>
              {#if onInsertText}
                <button
                  type="button"
                  class="hover-icon-btn"
                  onclick={() => insertMessage(msg.text)}
                  title="Вставить в открытую заметку"
                >
                  <Icon name="file-down" size={12} />
                </button>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Bottom Context Bar & Input Area -->
  <div class="input-container">
    <!-- Non-intrusive Context Chip: shown only when a note is open -->
    {#if activeNotePath}
      <div class="context-bar">
        {#if includeActiveNote}
          <div class="context-chip attached">
            <Icon name="file-text" size={11} color="var(--cortex-accent, #38bdf8)" />
            <span class="context-name" title={activeNotePath}>{activeFileName}</span>
            <span class="context-tag">в контексте</span>
            <button
              type="button"
              class="chip-close-btn"
              onclick={() => (includeActiveNote = false)}
              title="Исключить файл из контекста"
            >
              <Icon name="x" size={11} />
            </button>
          </div>
        {:else}
          <button
            type="button"
            class="context-attach-btn"
            onclick={() => (includeActiveNote = true)}
            title="Прикрепить содержимое открытого файла к вопросу"
          >
            <Icon name="plus" size={11} />
            <span>Прикрепить <strong>{activeFileName}</strong></span>
          </button>
        {/if}
      </div>
    {/if}

    <!-- Input Box -->
    <div class="input-card">
      <textarea
        bind:this={textareaEl}
        placeholder="Сообщение ассистенту..."
        bind:value={inputMessage}
        oninput={adjustTextareaHeight}
        onkeydown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
          }
        }}
        rows="1"
      ></textarea>

      <div class="input-footer">
        <span class="input-hint">Enter — отправить, Shift+Enter — новая строка</span>

        <div class="input-action-buttons">
          {#if isGenerating}
            <button type="button" class="stop-btn" onclick={handleStopGeneration} title="Остановить ответ">
              <Icon name="square" size={11} />
              <span>Стоп</span>
            </button>
          {:else}
            <button
              type="button"
              class="send-btn"
              onclick={handleSendMessage}
              disabled={!inputMessage.trim()}
              title="Отправить (Enter)"
            >
              <Icon name="send" size={13} />
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .assistant-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--cortex-bg-sidebar, #0a111a);
    user-select: text;
    -webkit-user-select: text;
    min-width: 0;
    overflow: hidden;
  }

  /* 1. HEADER */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 38px;
    padding: 0 10px 0 12px;
    background: var(--cortex-bg-header, #080c14);
    border-bottom: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    flex-shrink: 0;
    user-select: none;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .title-block {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .panel-heading {
    margin: 0;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--cortex-fg-primary, #ffffff);
    letter-spacing: -0.2px;
  }

  /* Provider Pill Trigger */
  .provider-pill-wrap {
    position: relative;
    min-width: 0;
  }

  .provider-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--cortex-bg-card, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    padding: 2px 8px;
    font-size: 0.72rem;
    color: var(--cortex-fg-secondary, #cbd5e1);
    cursor: pointer;
    transition: all 0.12s ease;
    max-width: 170px;
  }

  .provider-pill:hover {
    border-color: var(--cortex-accent, #38bdf8);
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--cortex-fg-primary, #ffffff);
  }

  .provider-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--cortex-fg-muted, #64748b);
    flex-shrink: 0;
  }

  .provider-dot.online {
    background: #10b981;
    box-shadow: 0 0 6px rgba(16, 185, 129, 0.4);
  }

  .provider-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .model-badge {
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.12));
    color: var(--cortex-accent, #38bdf8);
    padding: 1px 5px;
    border-radius: 6px;
    font-size: 0.65rem;
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 75px;
  }

  .provider-pill :global(.chevron-icon) {
    color: var(--cortex-fg-muted, #64748b);
    flex-shrink: 0;
  }

  /* Provider Dropdown */
  .provider-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    width: 250px;
    background: var(--cortex-bg-card, #0f172a);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 4px;
    animation: fadeIn 0.12s ease-out;
  }

  .p-drop-header {
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--cortex-fg-muted, #94a3b8);
    padding: 5px 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .p-drop-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    border-radius: 5px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s ease;
  }

  .p-drop-item:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.06));
  }

  .p-drop-item.active {
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.12));
  }

  .p-item-left {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .p-item-title {
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--cortex-fg-primary, #ffffff);
  }

  .p-item-sub {
    font-size: 0.68rem;
    color: var(--cortex-fg-muted, #94a3b8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 170px;
  }

  .p-tag {
    font-size: 0.62rem;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .p-tag.ok {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }

  .p-tag.blue {
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.15));
    color: var(--cortex-accent, #38bdf8);
  }

  .p-tag.purple {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
  }

  .p-drop-divider {
    height: 1px;
    background: var(--cortex-border-subtle, rgba(255, 255, 255, 0.08));
    margin: 4px 0;
  }

  .p-drop-settings-btn {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 8px;
    border-radius: 5px;
    background: transparent;
    border: none;
    color: var(--cortex-fg-secondary, #cbd5e1);
    font-size: 0.74rem;
    cursor: pointer;
    transition: all 0.1s ease;
  }

  .p-drop-settings-btn:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.06));
    color: var(--cortex-fg-primary, #ffffff);
  }

  /* Header action buttons */
  .header-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .action-icon-btn {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--cortex-fg-muted, #94a3b8);
    width: 26px;
    height: 26px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease;
  }

  .action-icon-btn:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--cortex-fg-primary, #ffffff);
  }

  .action-icon-btn.active {
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.15));
    color: var(--cortex-accent, #38bdf8);
    border-color: var(--cortex-accent, #38bdf8);
  }

  /* 2. QUICK ENCRYPT PANEL */
  .quick-encrypt-box {
    padding: 8px 12px;
    background: var(--cortex-bg-card, rgba(0, 0, 0, 0.2));
    border-bottom: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .box-title {
    font-size: 0.72rem;
    color: var(--cortex-fg-muted, #94a3b8);
  }

  .input-row {
    display: flex;
    gap: 6px;
  }

  .input-row input {
    flex: 1;
    background: var(--cortex-bg-input, rgba(0, 0, 0, 0.25));
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.1));
    border-radius: 5px;
    padding: 5px 8px;
    color: var(--cortex-fg-primary, #ffffff);
    font-size: 0.76rem;
    outline: none;
  }

  .input-row input:focus {
    border-color: var(--cortex-accent, #38bdf8);
  }

  .encrypt-btn {
    background: var(--cortex-accent, #38bdf8);
    border: none;
    border-radius: 5px;
    color: #ffffff;
    font-size: 0.72rem;
    font-weight: 500;
    padding: 0 10px;
    cursor: pointer;
  }

  .result-box {
    background: rgba(0, 0, 0, 0.25);
    padding: 6px 8px;
    border-radius: 5px;
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .token-code {
    font-size: 0.68rem;
    word-break: break-all;
    color: var(--cortex-accent, #38bdf8);
    user-select: all;
  }

  .result-actions {
    display: flex;
    gap: 6px;
  }

  .res-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--cortex-bg-card, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.1));
    border-radius: 4px;
    color: var(--cortex-fg-secondary, #cbd5e1);
    font-size: 0.68rem;
    padding: 2px 7px;
    cursor: pointer;
  }

  .res-btn:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.12));
    color: var(--cortex-fg-primary, #ffffff);
  }

  /* 3. MESSAGES AREA */
  .messages-area {
    flex: 1;
    padding: 12px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .message-row {
    display: flex;
    flex-direction: column;
    width: 100%;
  }

  .message-row.user {
    align-items: flex-end;
  }

  .message-row.assistant {
    align-items: flex-start;
  }

  .bubble {
    position: relative;
    max-width: 88%;
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 0.82rem;
    line-height: 1.5;
    word-break: break-word;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  }

  .bubble.user {
    background: var(--cortex-accent, #38bdf8);
    color: #ffffff;
    border-bottom-right-radius: 2px;
  }

  .bubble.assistant {
    background: var(--cortex-bg-card, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.09));
    color: var(--cortex-fg-primary, #ffffff);
    border-bottom-left-radius: 2px;
  }

  .user-text {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .streaming-text {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .streaming-cursor {
    display: inline-block;
    color: var(--cortex-accent, #38bdf8);
    animation: blink 0.8s infinite;
    margin-left: 2px;
  }

  /* Hover Action Toolbar on Assistant Messages */
  .hover-toolbar {
    position: absolute;
    bottom: -10px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 3px;
    background: var(--cortex-bg-header, #080c14);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.12));
    border-radius: 6px;
    padding: 2px 4px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease, transform 0.12s ease;
    transform: translateY(2px);
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.35);
    z-index: 10;
  }

  .message-row:hover .hover-toolbar {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }

  .hover-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    background: transparent;
    border: none;
    color: var(--cortex-fg-muted, #94a3b8);
    cursor: pointer;
    transition: all 0.1s ease;
  }

  .hover-icon-btn:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.1));
    color: var(--cortex-fg-primary, #ffffff);
  }

  /* Markdown Typography inside Assistant Messages */
  .bubble-markdown {
    line-height: 1.5;
    font-size: 0.82rem;
  }

  .bubble-markdown :global(p) {
    margin: 0 0 6px 0;
  }

  .bubble-markdown :global(p:last-child) {
    margin-bottom: 0;
  }

  .bubble-markdown :global(h1) {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 8px 0 4px;
    color: var(--cortex-fg-primary, #ffffff);
  }

  .bubble-markdown :global(h2) {
    font-size: 0.88rem;
    font-weight: 600;
    margin: 6px 0 3px;
    color: var(--cortex-fg-primary, #ffffff);
  }

  .bubble-markdown :global(h3) {
    font-size: 0.82rem;
    font-weight: 600;
    margin: 5px 0 2px;
    color: var(--cortex-fg-primary, #ffffff);
  }

  .bubble-markdown :global(a) {
    color: var(--cortex-accent, #38bdf8);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .bubble-markdown :global(a:hover) {
    filter: brightness(1.15);
  }

  .bubble-markdown :global(code) {
    background: rgba(255, 255, 255, 0.08);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: monospace;
    font-size: 0.84em;
    color: var(--cortex-accent, #38bdf8);
  }

  .bubble-markdown :global(pre) {
    background: var(--cortex-bg-main, #090d16);
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    overflow-x: auto;
    margin: 6px 0;
  }

  .bubble-markdown :global(pre code) {
    background: transparent;
    padding: 0;
    color: var(--cortex-fg-primary, #e2e8f0);
    font-size: 0.78rem;
  }

  .bubble-markdown :global(ul),
  .bubble-markdown :global(ol) {
    margin: 4px 0 6px 0;
    padding-left: 18px;
  }

  .bubble-markdown :global(li) {
    margin-bottom: 2px;
  }

  .bubble-markdown :global(blockquote) {
    margin: 6px 0;
    padding: 4px 10px;
    border-left: 2px solid var(--cortex-accent, #38bdf8);
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.06));
    color: var(--cortex-fg-secondary, #cbd5e1);
  }

  .bubble-markdown :global(.cortex-secret-mount) {
    display: inline-flex;
    vertical-align: middle;
  }

  /* 4. INPUT AREA & CONTEXT CHIP */
  .input-container {
    padding: 8px 10px 10px;
    background: var(--cortex-bg-header, #080c14);
    border-top: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  .context-bar {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .context-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.12));
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    padding: 2px 7px;
    font-size: 0.68rem;
    color: var(--cortex-fg-primary, #ffffff);
  }

  .context-name {
    font-weight: 500;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .context-tag {
    font-size: 0.6rem;
    color: var(--cortex-accent, #38bdf8);
    background: rgba(56, 189, 248, 0.15);
    padding: 0 4px;
    border-radius: 3px;
  }

  .chip-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--cortex-fg-muted, #94a3b8);
    cursor: pointer;
    padding: 1px;
    border-radius: 50%;
  }

  .chip-close-btn:hover {
    color: #ef4444;
  }

  .context-attach-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: 1px dashed var(--cortex-border, rgba(255, 255, 255, 0.15));
    border-radius: 12px;
    padding: 2px 8px;
    font-size: 0.68rem;
    color: var(--cortex-fg-muted, #94a3b8);
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .context-attach-btn:hover {
    border-color: var(--cortex-accent, #38bdf8);
    color: var(--cortex-accent, #38bdf8);
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.08));
  }

  .context-attach-btn strong {
    font-weight: 500;
    color: var(--cortex-fg-primary, #ffffff);
  }

  /* Input Card */
  .input-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--cortex-bg-input, rgba(0, 0, 0, 0.25));
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    padding: 7px 9px 6px;
    transition: border-color 0.12s ease, box-shadow 0.12s ease;
  }

  .input-card:focus-within {
    border-color: var(--cortex-accent, #38bdf8);
    box-shadow: 0 0 0 1px var(--cortex-accent-subtle, rgba(56, 189, 248, 0.2));
  }

  .input-card textarea {
    width: 100%;
    background: transparent;
    border: none;
    color: var(--cortex-fg-primary, #ffffff);
    font-size: 0.82rem;
    line-height: 1.45;
    resize: none;
    outline: none;
    box-sizing: border-box;
    font-family: inherit;
    min-height: 36px;
    max-height: 160px;
  }

  .input-card textarea::placeholder {
    color: var(--cortex-fg-muted, #64748b);
  }

  .input-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 2px;
  }

  .input-hint {
    font-size: 0.65rem;
    color: var(--cortex-fg-muted, #64748b);
    user-select: none;
  }

  .input-action-buttons {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    background: var(--cortex-accent, #38bdf8);
    border: none;
    border-radius: 6px;
    color: #ffffff;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .send-btn:hover:not(:disabled) {
    filter: brightness(1.12);
    transform: translateY(-1px);
  }

  .send-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    background: var(--cortex-fg-muted, #64748b);
  }

  .stop-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #ef4444;
    border: none;
    border-radius: 6px;
    color: #ffffff;
    font-size: 0.7rem;
    font-weight: 500;
    padding: 3px 8px;
    cursor: pointer;
    animation: pulse 1.5s infinite;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.75; }
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
