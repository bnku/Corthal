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

  let richInputEl = $state<HTMLDivElement | null>(null);
  let hasInputContent = $state(false);
  let showEncryptTooltip = $state(false);
  let tooltipTimeout: any = null;
  let isModelDropdownOpen = $state(false);
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

  const EFFORT_LEVELS = ["auto", "low", "medium", "high", "xhigh"] as const;

  let currentEffort = $derived(
    (config.provider === "codex"
      ? config.codex_reasoning_effort
      : config.provider === "openrouter"
      ? config.openrouter_reasoning_effort
      : config.openai_reasoning_effort) || "auto"
  );

  let effortIndex = $derived(
    Math.max(0, EFFORT_LEVELS.indexOf(currentEffort as any))
  );

  async function handleEffortChange(newIndex: number) {
    const level = EFFORT_LEVELS[newIndex] || "auto";
    if (config.provider === "codex") {
      config.codex_reasoning_effort = level;
    } else if (config.provider === "openrouter") {
      config.openrouter_reasoning_effort = level;
    } else {
      config.openai_reasoning_effort = level;
    }
    await handleSaveConfig(config);
  }

  let availableModels = $derived.by<string[]>(() => {
    let list: string[] = [];
    if (config.provider === "codex") {
      list = codexStatus?.available_models && codexStatus.available_models.length > 0
        ? codexStatus.available_models
        : ["gpt-6.1-sol", "gpt-6-astra", "gpt-5.6-sol", "gpt-5.5", "o3-mini", "o1", "gpt-4o"];
      if (config.codex_model && !list.includes(config.codex_model)) {
        list = [config.codex_model, ...list];
      }
    } else if (config.provider === "openrouter") {
      list = [
        "anthropic/claude-3.7-sonnet",
        "openai/gpt-4o",
        "google/gemini-2.5-pro",
        "deepseek/deepseek-r1",
        "meta-llama/llama-3.3-70b-instruct",
      ];
      if (config.openrouter_model && !list.includes(config.openrouter_model)) {
        list = [config.openrouter_model, ...list];
      }
    } else {
      list = ["llama3", "mistral", "qwen2.5", "deepseek-coder"];
      if (config.openai_model && !list.includes(config.openai_model)) {
        list = [config.openai_model, ...list];
      }
    }
    return Array.from(new Set(list));
  });

  function handleWindowClick() {
    if (isModelDropdownOpen) {
      isModelDropdownOpen = false;
    }
  }

  let currentModel = $derived(
    config.provider === "codex"
      ? config.codex_model
      : config.provider === "openrouter"
      ? config.openrouter_model
      : config.openai_model
  );

  async function handleSelectModel(modelName: string) {
    if (config.provider === "codex") {
      config.codex_model = modelName;
    } else if (config.provider === "openrouter") {
      config.openrouter_model = modelName;
    } else {
      config.openai_model = modelName;
    }
    isModelDropdownOpen = false;
    await handleSaveConfig(config);
  }

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
    if (isModelDropdownOpen) {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".model-pill-wrap")) {
        isModelDropdownOpen = false;
      }
    }
  }

  onDestroy(() => {
    window.removeEventListener("click", handleGlobalClick);
    if (unlistenChunk) unlistenChunk();
    if (unlistenConfig) unlistenConfig();
    if (tooltipTimeout) clearTimeout(tooltipTimeout);
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

  function scrollToBottom() {
    setTimeout(() => {
      if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    }, 10);
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

  function extractPrompt(node: Node): string {
    let result = "";
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        result += child.textContent || "";
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (el.classList.contains("cortex-secret-mount") || el.hasAttribute("data-token")) {
          const token = el.getAttribute("data-token");
          result += `🔒[${token}]`;
        } else if (el.tagName === "BR") {
          result += "\n";
        } else if (el.tagName === "DIV" || el.tagName === "P") {
          result += (result.length > 0 && !result.endsWith("\n") ? "\n" : "") + extractPrompt(el);
        } else {
          result += extractPrompt(el);
        }
      }
    }
    return result;
  }

  function updateInputState() {
    if (!richInputEl) {
      hasInputContent = false;
      return;
    }
    const prompt = extractPrompt(richInputEl).trim();
    hasInputContent = prompt.length > 0;
  }

  let savedInputRange: Range | null = null;

  function saveCurrentRange() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const r = sel.getRangeAt(0);
      if (richInputEl && richInputEl.contains(r.commonAncestorContainer)) {
        savedInputRange = r.cloneRange();
      }
    }
  }

  $effect(() => {
    const handleSelectionChange = () => {
      saveCurrentRange();
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  });

  async function handleEncryptInputSelection() {
    let range: Range | null = null;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const r = sel.getRangeAt(0);
      if (richInputEl && richInputEl.contains(r.commonAncestorContainer)) {
        range = r;
      }
    }

    if (!range && savedInputRange) {
      range = savedInputRange;
    }

    if (!range) {
      showEncryptTooltip = true;
      if (tooltipTimeout) clearTimeout(tooltipTimeout);
      tooltipTimeout = setTimeout(() => {
        showEncryptTooltip = false;
      }, 2000);
      return;
    }

    const rawText = range.toString().trim();
    if (!rawText) {
      showEncryptTooltip = true;
      if (tooltipTimeout) clearTimeout(tooltipTimeout);
      tooltipTimeout = setTimeout(() => {
        showEncryptTooltip = false;
      }, 2000);
      return;
    }

    try {
      const token = await invoke<string>("crypto_encrypt_secret", {
        plaintext: rawText,
        pubkeyContent: null,
      });

      const mountSpan = document.createElement("span");
      mountSpan.className = "cortex-secret-mount input-secret-badge";
      mountSpan.contentEditable = "false";
      mountSpan.setAttribute("data-token", token);

      mount(SecretPill, {
        target: mountSpan,
        props: {
          token,
          autoReveal: true,
          onPassphraseNeeded: () => (onPassphraseNeeded ? onPassphraseNeeded() : Promise.resolve(null)),
        },
      });

      range.deleteContents();
      range.insertNode(mountSpan);

      const spaceNode = document.createTextNode("\u00A0");
      if (mountSpan.nextSibling) {
        mountSpan.parentNode?.insertBefore(spaceNode, mountSpan.nextSibling);
      } else {
        mountSpan.parentNode?.appendChild(spaceNode);
      }

      if (sel) {
        const newRange = document.createRange();
        newRange.setStartAfter(spaceNode);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }

      savedInputRange = null;
      updateInputState();
      richInputEl?.focus();
    } catch (err: any) {
      alert("Не удалось зашифровать секрет: " + err);
    }
  }

  function handleInputPaste(e: ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") || "";
    if (!text) return;

    const secretRegex = /`?🔒\[(enc:v1:[^\]]+)\]`?/g;
    if (!secretRegex.test(text)) {
      document.execCommand("insertText", false, text);
      updateInputState();
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();

    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    secretRegex.lastIndex = 0;
    let match;

    while ((match = secretRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
      }
      const token = match[1];
      const mountSpan = document.createElement("span");
      mountSpan.className = "cortex-secret-mount input-secret-badge";
      mountSpan.contentEditable = "false";
      mountSpan.setAttribute("data-token", token);
      mount(SecretPill, {
        target: mountSpan,
        props: {
          token,
          autoReveal: true,
          onPassphraseNeeded: () => (onPassphraseNeeded ? onPassphraseNeeded() : Promise.resolve(null)),
        },
      });
      frag.appendChild(mountSpan);
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    range.insertNode(frag);
    updateInputState();
  }

  function handleInputKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    } else if ((e.ctrlKey || e.metaKey) && (e.code === "KeyE" || e.key.toLowerCase() === "e")) {
      e.preventDefault();
      handleEncryptInputSelection();
    }
  }

  async function handleSendMessage() {
    if (!richInputEl || isGenerating) return;

    let userText = extractPrompt(richInputEl).trim();
    if (!userText) return;

    // Optional pre-send interception if user specifically typed {{secret:...}}
    const secretRegex = /\{\{secret:(.*?)\}\}/g;
    const matches = [...userText.matchAll(secretRegex)];
    if (matches.length > 0) {
      for (const match of matches) {
        const rawPlaintext = match[1];
        try {
          const token = await invoke<string>("crypto_encrypt_secret", {
            plaintext: rawPlaintext,
            pubkeyContent: null,
          });
          userText = userText.replace(match[0], token);
        } catch (err: any) {
          alert("Не удалось зашифровать секрет: " + err);
          return;
        }
      }
    }

    richInputEl.innerHTML = "";
    hasInputContent = false;

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

<svelte:window onclick={handleWindowClick} />

<div class="assistant-container">
  <!-- Top Header with Model Pill & Actions -->
  <div class="header">
    <div class="header-left">
      <div class="title-block">
        <Icon name="bot" size={16} color="var(--cortex-accent, #38bdf8)" />
        <span class="panel-heading">Ассистент</span>
      </div>

      <!-- Model & Effort Popover Pill -->
      <div class="model-pill-wrap">
        <button
          type="button"
          class="model-pill"
          onclick={(e) => {
            e.stopPropagation();
            isModelDropdownOpen = !isModelDropdownOpen;
          }}
          title="Выбор модели и рассуждений"
        >
          <span
            class="provider-dot"
            class:online={config.provider === "codex" ? codexStatus?.is_logged_in : true}
          ></span>
          <span class="model-badge">{getActiveModelBadge()}</span>
          <Icon name="chevron-down" size={11} class="chevron-icon" />
        </button>

        {#if isModelDropdownOpen}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="model-popover" onclick={(e) => e.stopPropagation()}>
            <div class="popover-header">
              <span class="popover-title">Модель ({getProviderLabel(config.provider)})</span>
            </div>

            <div class="model-scroll-list">
              {#each availableModels as modelName}
                <button
                  type="button"
                  class="model-item-btn"
                  class:active={currentModel === modelName}
                  onclick={() => handleSelectModel(modelName)}
                >
                  <span class="model-item-name">{modelName}</span>
                  {#if currentModel === modelName}
                    <Icon name="check" size={13} color="var(--cortex-accent, #38bdf8)" />
                  {/if}
                </button>
              {/each}
            </div>

            <div class="popover-divider"></div>

            <div class="popover-effort-box">
              <div class="effort-header">
                <span class="effort-title">Рассуждения (Reasoning):</span>
                <span class="effort-badge">{currentEffort}</span>
              </div>
              <div class="slider-wrap">
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="1"
                  value={effortIndex}
                  oninput={(e) => handleEffortChange(parseInt(e.currentTarget.value, 10))}
                  class="cortex-slider"
                />
                <div class="slider-ticks">
                  <span class:active={effortIndex === 0}>auto</span>
                  <span class:active={effortIndex === 1}>low</span>
                  <span class:active={effortIndex === 2}>med</span>
                  <span class:active={effortIndex === 3}>high</span>
                  <span class:active={effortIndex === 4}>max</span>
                </div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Header Actions: ONLY Clear Chat! -->
    <div class="header-actions">
      <button
        type="button"
        class="action-icon-btn"
        onclick={handleClearChat}
        title="Очистить диалог"
        aria-label="Очистить диалог"
      >
        <Icon name="trash" size={13} />
      </button>
    </div>
  </div>

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

    <!-- Input Box with standard Secret Block support -->
    <div class="input-card">
      <div
        bind:this={richInputEl}
        class="rich-input-box"
        class:is-empty={!hasInputContent}
        contenteditable="true"
        role="textbox"
        tabindex="0"
        aria-multiline="true"
        aria-label="Сообщение ассистенту"
        oninput={updateInputState}
        onkeydown={handleInputKeydown}
        onpaste={handleInputPaste}
        onmouseup={saveCurrentRange}
        onkeyup={saveCurrentRange}
      ></div>

      <div class="input-footer">
        <span class="input-hint">Enter — отправить, Shift+Enter — перенос</span>

        <div class="input-action-buttons">
          <div class="encrypt-btn-wrapper">
            <button
              type="button"
              class="encrypt-action-btn"
              onmousedown={(e) => e.preventDefault()}
              onclick={handleEncryptInputSelection}
              title="Зашифровать выделенный текст (Ctrl+E)"
              aria-label="Зашифровать выделенный текст"
              disabled={isGenerating}
            >
              <Icon name="lock" size={13} />
            </button>
            {#if showEncryptTooltip}
              <div class="encrypt-tooltip">
                Выделите текст для шифрования
              </div>
            {/if}
          </div>

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
              disabled={!hasInputContent}
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
    container-type: inline-size;
    container-name: assistant;
  }

  @container assistant (max-width: 320px) {
    .panel-heading {
      display: none;
    }
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
    gap: 8px;
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
    white-space: nowrap;
  }

  /* Model Pill Trigger */
  .model-pill-wrap {
    position: relative;
    min-width: 0;
  }

  .model-pill {
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

  .model-pill:hover {
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
    max-width: 85px;
  }

  .model-pill :global(.chevron-icon) {
    color: var(--cortex-fg-muted, #64748b);
    flex-shrink: 0;
  }

  /* Model & Effort Popover */
  .model-popover {
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
    padding: 6px;
    animation: fadeIn 0.12s ease-out;
  }

  .popover-header {
    padding: 4px 6px 6px;
  }

  .popover-title {
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--cortex-fg-muted, #94a3b8);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .model-scroll-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 180px;
    overflow-y: auto;
  }

  .model-item-btn {
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

  .model-item-btn:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.06));
  }

  .model-item-btn.active {
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.12));
  }

  .model-item-name {
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--cortex-fg-primary, #ffffff);
    font-family: monospace;
  }

  .popover-divider {
    height: 1px;
    background: var(--cortex-border-subtle, rgba(255, 255, 255, 0.08));
    margin: 8px 0;
  }

  .popover-effort-box {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 2px 6px 4px;
  }

  .effort-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .effort-title {
    font-size: 0.7rem;
    color: var(--cortex-fg-secondary, #cbd5e1);
  }

  .effort-badge {
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--cortex-accent, #38bdf8);
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.12));
    padding: 1px 6px;
    border-radius: 4px;
    font-family: monospace;
    text-transform: uppercase;
  }

  .slider-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .cortex-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: var(--cortex-border, rgba(255, 255, 255, 0.15));
    outline: none;
    cursor: pointer;
  }

  .cortex-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--cortex-accent, #38bdf8);
    cursor: pointer;
    box-shadow: 0 0 6px rgba(56, 189, 248, 0.5);
    transition: transform 0.1s ease;
  }

  .cortex-slider::-webkit-slider-thumb:hover {
    transform: scale(1.15);
  }

  .slider-ticks {
    display: flex;
    justify-content: space-between;
    font-size: 0.6rem;
    color: var(--cortex-fg-muted, #64748b);
    user-select: none;
  }

  .slider-ticks span.active {
    color: var(--cortex-accent, #38bdf8);
    font-weight: 600;
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

  .rich-input-box {
    width: 100%;
    background: transparent;
    border: none;
    color: var(--cortex-fg-primary, #ffffff);
    font-size: 0.82rem;
    line-height: 1.45;
    outline: none;
    box-sizing: border-box;
    font-family: inherit;
    min-height: 36px;
    max-height: 160px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    position: relative;
    user-select: text;
    -webkit-user-select: text;
  }

  .rich-input-box.is-empty::before {
    content: "Спросите ассистента...";
    position: absolute;
    left: 0;
    top: 0;
    color: var(--cortex-fg-muted, #64748b);
    pointer-events: none;
    user-select: none;
  }

  .rich-input-box :global(.cortex-secret-mount.input-secret-badge) {
    display: inline-flex;
    vertical-align: middle;
    margin: 0 2px;
    user-select: all;
  }

  .encrypt-btn-wrapper {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .encrypt-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--cortex-fg-muted, #94a3b8);
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .encrypt-action-btn:hover:not(:disabled) {
    background: var(--cortex-accent-subtle, rgba(56, 189, 248, 0.12));
    border-color: var(--cortex-accent, #38bdf8);
    color: var(--cortex-accent, #38bdf8);
  }

  .encrypt-action-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .encrypt-tooltip {
    position: absolute;
    bottom: calc(100% + 6px);
    right: 0;
    background: var(--cortex-bg-header, #080c14);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.15));
    border-radius: 5px;
    padding: 4px 8px;
    font-size: 0.68rem;
    color: var(--cortex-fg-primary, #ffffff);
    white-space: nowrap;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
    z-index: 100;
    pointer-events: none;
    animation: fadeIn 0.12s ease-out;
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
