<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import type { AssistantConfig, CodexStatus, AssistantStreamChunk, ChatMessage, AssistantProvider } from "$lib/types";
  import Icon from "./Icon.svelte";
  import AssistantSettingsModal from "./AssistantSettingsModal.svelte";

  interface Props {
    activeNotePath: string | null;
    activeNoteContent?: string | null;
    onInsertText?: (text: string) => void;
    onVaultRefresh?: () => void;
  }

  let { activeNotePath, activeNoteContent = null, onInsertText, onVaultRefresh }: Props = $props();

  let inputMessage = $state("");
  let quickSecretInput = $state("");
  let encryptedResult = $state("");
  let isEncrypting = $state(false);
  let showEncryptTool = $state(false);
  let isSettingsOpen = $state(false);
  let isProviderDropdownOpen = $state(false);

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
      text: "Привет! Я твой ассистент Cortex. Я могу анализировать заметки, структурировать информацию и помогать с архитектурой.\n\nЛюбые пароли и конфиденциальные данные, оформленные как `{{secret:пароль}}`, будут локально зашифрованы твоим SSH-ключом до отправки в ИИ!",
      timestamp: Date.now(),
    },
  ]);

  let unlistenChunk: UnlistenFn | null = null;
  let messagesContainer: HTMLDivElement | null = null;

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
  });

  onDestroy(() => {
    if (unlistenChunk) {
      unlistenChunk();
    }
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

    // Pre-send interception: match {{secret:...}} and encrypt with user's vault SSH key
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

    // Prepare note context
    let noteContext: string | null = null;
    if (config.include_active_note && activeNotePath) {
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
        text: "Диалог очищен. Чем я могу помочь?",
        timestamp: Date.now(),
      },
    ];
  }

  function getProviderLabel(p: AssistantProvider): string {
    switch (p) {
      case "codex":
        return "Codex (ChatGPT)";
      case "openrouter":
        return "OpenRouter";
      case "openai":
        return "OpenAI / Local";
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
</script>

<div class="assistant-container">
  <!-- Header with Provider Selector, Encrypt Tool, Clear Chat & Settings -->
  <div class="header">
    <div class="header-main">
      <div class="title-block">
        <span class="bot-icon">🤖</span>
        <h3 class="panel-heading">Ассистент</h3>
      </div>

      <!-- Quick Provider Selector Dropdown Trigger -->
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
          <span class="provider-dot" class:online={config.provider === 'codex' ? codexStatus?.is_logged_in : true}></span>
          <span class="provider-name">{getProviderLabel(config.provider)}</span>
          <span class="model-badge">{getActiveModelBadge()}</span>
          <Icon name="chevron-down" size={11} />
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
                isSettingsOpen = true;
              }}
            >
              <Icon name="sliders" size={13} />
              <span>Все настройки провайдеров...</span>
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Header Actions -->
    <div class="header-actions">
      <button
        class="action-icon-btn"
        class:active={showEncryptTool}
        onclick={() => (showEncryptTool = !showEncryptTool)}
        title="Шифрование секрета в токен Age"
        aria-label="Шифрование"
      >
        <Icon name="lock" size={14} />
      </button>

      <button
        class="action-icon-btn"
        onclick={handleClearChat}
        title="Очистить диалог"
        aria-label="Очистить диалог"
      >
        <Icon name="trash" size={14} />
      </button>

      <button
        class="action-icon-btn"
        onclick={() => (isSettingsOpen = true)}
        title="Настройки моделей и API"
        aria-label="Настройки"
      >
        <Icon name="settings" size={14} />
      </button>
    </div>
  </div>

  <!-- Quick Encrypt Dropdown Panel -->
  {#if showEncryptTool}
    <div class="quick-encrypt-box">
      <div class="box-title">Шифрование через SSH-ключ базы данных</div>
      <div class="input-row">
        <input
          type="password"
          placeholder="Введите секрет/пароль..."
          bind:value={quickSecretInput}
          onkeydown={(e) => e.key === "Enter" && handleQuickEncrypt()}
        />
        <button class="encrypt-btn" onclick={handleQuickEncrypt} disabled={isEncrypting}>
          {isEncrypting ? "..." : "Зашифровать"}
        </button>
      </div>

      {#if encryptedResult}
        <div class="result-box">
          <code class="token-code">{encryptedResult}</code>
          <div class="result-actions">
            <button class="res-btn" onclick={() => navigator.clipboard.writeText(encryptedResult)}>
              📋 Копировать
            </button>
            {#if onInsertText}
              <button class="res-btn" onclick={() => onInsertText?.(encryptedResult)}>
                ✍️ В заметку
              </button>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Active Note Context Ribbon -->
  {#if activeNotePath && config.include_active_note}
    <div class="context-ribbon">
      <Icon name="file-text" size={12} color="var(--accent-color, #0284c7)" />
      <span class="context-label">Контекст:</span>
      <span class="context-path">{activeNotePath.split('/').pop()}</span>
      <span class="context-active-badge">В запросе</span>
    </div>
  {/if}

  <!-- Messages Scroll Area -->
  <div class="messages-area custom-scroll" bind:this={messagesContainer}>
    {#each messages as msg (msg.id)}
      <div class="message {msg.role}">
        <div class="bubble">
          <div class="bubble-header">
            <span class="bubble-author">{msg.role === "user" ? "Вы" : "Cortex"}</span>
            {#if msg.model}
              <span class="bubble-model-tag">{msg.model}</span>
            {/if}
          </div>

          <div class="bubble-content">
            {msg.text}
            {#if msg.isStreaming}
              <span class="streaming-cursor">▋</span>
            {/if}
          </div>

          {#if msg.role === "assistant" && msg.text && !msg.isStreaming}
            <div class="message-footer-actions">
              <button
                class="msg-action-btn"
                onclick={() => navigator.clipboard.writeText(msg.text)}
                title="Скопировать ответ"
              >
                📋 Копировать
              </button>
              {#if onInsertText}
                <button
                  class="msg-action-btn"
                  onclick={() => onInsertText?.(msg.text)}
                  title="Вставить ответ в заметку"
                >
                  ✍️ Вставить в заметку
                </button>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Input Area -->
  <div class="input-area">
    <div class="input-wrapper">
      <textarea
        placeholder="Напишите задачу... (секреты пишите как &#123;&#123;secret:пароль&#125;&#125;)"
        bind:value={inputMessage}
        onkeydown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
          }
        }}
        rows="2"
      ></textarea>

      <div class="input-actions-bar">
        <span class="input-hint">Enter — отправить, Shift+Enter — перенос строки</span>

        <div class="input-buttons">
          {#if isGenerating}
            <button class="btn-stop" onclick={handleStopGeneration} title="Остановить генерацию">
              <Icon name="x-circle" size={14} />
              <span>Стоп</span>
            </button>
          {:else}
            <button
              class="btn-send"
              onclick={handleSendMessage}
              disabled={!inputMessage.trim()}
              title="Отправить запрос"
            >
              <span>Отправить</span>
              <Icon name="send" size={13} />
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<!-- Assistant Settings Modal -->
<AssistantSettingsModal
  isOpen={isSettingsOpen}
  {config}
  {codexStatus}
  onClose={() => (isSettingsOpen = false)}
  onSave={handleSaveConfig}
/>

<style>
  .assistant-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-sidebar, #0f172a);
    border-left: 1px solid var(--border-color, #334155);
    user-select: text;
    -webkit-user-select: text;
  }

  .header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 14px;
    background: var(--bg-card, #1e293b);
    border-bottom: 1px solid var(--border-color, #334155);
  }

  .header-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .title-block {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .panel-heading {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary, #f8fafc);
  }

  .provider-pill-wrap {
    position: relative;
  }

  .provider-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-color, #334155);
    border-radius: 20px;
    padding: 3px 10px;
    font-size: 0.75rem;
    color: var(--text-secondary, #cbd5e1);
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .provider-pill:hover {
    border-color: var(--accent-color, #0284c7);
    color: var(--text-primary, #f8fafc);
    background: rgba(255, 255, 255, 0.08);
  }

  .provider-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #64748b;
  }

  .provider-dot.online {
    background: #10b981;
    box-shadow: 0 0 5px #10b981;
  }

  .model-badge {
    background: rgba(2, 132, 199, 0.2);
    color: var(--accent-color, #38bdf8);
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 0.65rem;
    font-family: monospace;
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .provider-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    width: 260px;
    background: var(--bg-card, #1e293b);
    border: 1px solid var(--border-color, #334155);
    border-radius: 8px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 4px;
    animation: fadeIn 0.12s ease-out;
  }

  .p-drop-header {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-muted, #94a3b8);
    padding: 6px 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .p-drop-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-radius: 6px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: all 0.12s ease;
  }

  .p-drop-item:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .p-drop-item.active {
    background: rgba(2, 132, 199, 0.12);
  }

  .p-item-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .p-item-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-primary, #f8fafc);
  }

  .p-item-sub {
    font-size: 0.7rem;
    color: var(--text-muted, #94a3b8);
    max-width: 170px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .p-tag {
    font-size: 0.65rem;
    padding: 1px 5px;
    border-radius: 4px;
    font-weight: 500;
  }

  .p-tag.ok {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
  }

  .p-tag.blue {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
  }

  .p-tag.purple {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
  }

  .p-drop-divider {
    height: 1px;
    background: var(--border-color, #334155);
    margin: 4px 0;
  }

  .p-drop-settings-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 6px;
    background: transparent;
    border: none;
    color: var(--text-secondary, #cbd5e1);
    font-size: 0.75rem;
    cursor: pointer;
  }

  .p-drop-settings-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-primary, #f8fafc);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }

  .action-icon-btn {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    color: var(--text-muted, #94a3b8);
    padding: 5px 7px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.12s ease;
  }

  .action-icon-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-primary, #f8fafc);
  }

  .action-icon-btn.active {
    background: rgba(2, 132, 199, 0.15);
    color: var(--accent-color, #38bdf8);
    border-color: rgba(2, 132, 199, 0.35);
  }

  .context-ribbon {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: rgba(2, 132, 199, 0.07);
    border-bottom: 1px solid rgba(2, 132, 199, 0.15);
    font-size: 0.72rem;
  }

  .context-label {
    color: var(--text-muted, #94a3b8);
  }

  .context-path {
    color: var(--text-primary, #f8fafc);
    font-weight: 500;
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .context-active-badge {
    margin-left: auto;
    font-size: 0.65rem;
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.12);
    padding: 1px 5px;
    border-radius: 4px;
  }

  .quick-encrypt-box {
    padding: 10px 14px;
    background: rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid var(--border-color, #334155);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .box-title {
    font-size: 0.75rem;
    color: var(--text-muted, #94a3b8);
  }

  .input-row {
    display: flex;
    gap: 8px;
  }

  .input-row input {
    flex: 1;
    background: var(--bg-input, #0f172a);
    border: 1px solid var(--border-color, #334155);
    border-radius: 5px;
    padding: 6px 10px;
    color: var(--text-primary, #f8fafc);
    font-size: 0.8rem;
    outline: none;
  }

  .encrypt-btn {
    background: var(--accent-color, #0284c7);
    border: none;
    border-radius: 5px;
    color: #ffffff;
    font-size: 0.75rem;
    padding: 0 12px;
    cursor: pointer;
  }

  .result-box {
    background: rgba(0, 0, 0, 0.3);
    padding: 8px;
    border-radius: 5px;
    border: 1px solid var(--border-color, #334155);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .token-code {
    font-size: 0.7rem;
    word-break: break-all;
    color: #38bdf8;
    user-select: all;
  }

  .result-actions {
    display: flex;
    gap: 8px;
  }

  .res-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-color, #334155);
    border-radius: 4px;
    color: var(--text-secondary, #cbd5e1);
    font-size: 0.7rem;
    padding: 3px 8px;
    cursor: pointer;
  }

  .messages-area {
    flex: 1;
    padding: 14px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .message {
    display: flex;
    flex-direction: column;
    max-width: 92%;
  }

  .message.user {
    align-self: flex-end;
  }

  .message.assistant {
    align-self: flex-start;
  }

  .bubble {
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .message.user .bubble {
    background: var(--accent-color, #0284c7);
    color: #ffffff;
    border-bottom-right-radius: 2px;
  }

  .message.assistant .bubble {
    background: var(--bg-card, #1e293b);
    color: var(--text-primary, #f8fafc);
    border: 1px solid var(--border-color, #334155);
    border-bottom-left-radius: 2px;
  }

  .bubble-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }

  .bubble-author {
    font-size: 0.7rem;
    font-weight: 600;
    opacity: 0.8;
  }

  .bubble-model-tag {
    font-size: 0.65rem;
    padding: 0 4px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    opacity: 0.7;
    font-family: monospace;
  }

  .bubble-content {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .streaming-cursor {
    display: inline-block;
    color: var(--accent-color, #38bdf8);
    animation: blink 0.8s infinite;
  }

  .message-footer-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .msg-action-btn {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-color, #334155);
    border-radius: 4px;
    color: var(--text-muted, #94a3b8);
    font-size: 0.7rem;
    padding: 2px 7px;
    cursor: pointer;
  }

  .msg-action-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--text-primary, #f8fafc);
  }

  .input-area {
    padding: 12px;
    background: var(--bg-card, #1e293b);
    border-top: 1px solid var(--border-color, #334155);
  }

  .input-wrapper {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--bg-input, #0f172a);
    border: 1px solid var(--border-color, #334155);
    border-radius: 8px;
    padding: 8px 10px;
    transition: border-color 0.12s ease;
  }

  .input-wrapper:focus-within {
    border-color: var(--accent-color, #0284c7);
  }

  .input-wrapper textarea {
    width: 100%;
    background: transparent;
    border: none;
    color: var(--text-primary, #f8fafc);
    font-size: 0.85rem;
    line-height: 1.4;
    resize: none;
    outline: none;
    box-sizing: border-box;
  }

  .input-actions-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 4px;
  }

  .input-hint {
    font-size: 0.68rem;
    color: var(--text-muted, #64748b);
  }

  .btn-send {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--accent-color, #0284c7);
    border: none;
    border-radius: 6px;
    color: #ffffff;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 5px 12px;
    cursor: pointer;
    transition: filter 0.12s ease;
  }

  .btn-send:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .btn-send:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-stop {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #ef4444;
    border: none;
    border-radius: 6px;
    color: #ffffff;
    font-size: 0.75rem;
    font-weight: 500;
    padding: 5px 12px;
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
