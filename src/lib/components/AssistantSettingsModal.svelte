<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import type { AssistantConfig, CodexStatus, AssistantProvider } from "$lib/types";
  import Icon from "./Icon.svelte";

  interface Props {
    isOpen: boolean;
    config: AssistantConfig;
    codexStatus: CodexStatus | null;
    onClose: () => void;
    onSave: (config: AssistantConfig) => void;
  }

  let { isOpen, config, codexStatus, onClose, onSave }: Props = $props();

  let activeTab = $state<"general" | "codex" | "openrouter" | "openai" | "context">("general");

  // Local editable draft
  let draftConfig = $state<AssistantConfig>({ ...config });
  let showOpenrouterKey = $state(false);
  let showOpenaiKey = $state(false);

  // Sync draft when opened
  $effect(() => {
    if (isOpen) {
      draftConfig = { ...config };
    }
  });

  const openrouterPresets = [
    { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic" },
    { id: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet (Hybrid)", provider: "Anthropic" },
    { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", provider: "Google" },
    { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI" },
    { id: "deepseek/deepseek-chat", name: "DeepSeek V3", provider: "DeepSeek" },
  ];

  const codexPresets = [
    { id: "gpt-5.6-sol", name: "GPT-5.6 Sol (Codex Default)" },
    { id: "o3-mini", name: "o3-mini (High reasoning)" },
    { id: "o1", name: "o1 (Deep thought)" },
    { id: "gpt-4o", name: "GPT-4o" },
  ];

  function handleSelectProvider(p: AssistantProvider) {
    draftConfig.provider = p;
  }

  function handleSave() {
    onSave({ ...draftConfig });
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" onclick={onClose}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal-card" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <div class="header-left">
          <div class="header-icon">
            <Icon name="sparkles" size={18} color="var(--accent-color, #0284c7)" />
          </div>
          <div class="header-title">Настройки ИИ-ассистента Cortex</div>
        </div>
        <button class="close-btn" onclick={onClose} aria-label="Закрыть">
          <Icon name="x" size={16} />
        </button>
      </div>

      <div class="modal-layout">
        <!-- Sidebar Navigation -->
        <nav class="modal-nav">
          <button
            class="nav-item"
            class:active={activeTab === "general"}
            onclick={() => (activeTab = "general")}
          >
            <Icon name="activity" size={15} />
            <span>Провайдер</span>
          </button>

          <button
            class="nav-item"
            class:active={activeTab === "codex"}
            onclick={() => (activeTab = "codex")}
          >
            <Icon name="terminal" size={15} />
            <span>Codex CLI (ChatGPT)</span>
            {#if codexStatus?.is_logged_in}
              <span class="status-dot green" title="Авторизован в ChatGPT"></span>
            {/if}
          </button>

          <button
            class="nav-item"
            class:active={activeTab === "openrouter"}
            onclick={() => (activeTab = "openrouter")}
          >
            <Icon name="cpu" size={15} />
            <span>OpenRouter</span>
          </button>

          <button
            class="nav-item"
            class:active={activeTab === "openai"}
            onclick={() => (activeTab = "openai")}
          >
            <Icon name="server" size={15} />
            <span>OpenAI API / Local</span>
          </button>

          <button
            class="nav-item"
            class:active={activeTab === "context"}
            onclick={() => (activeTab = "context")}
          >
            <Icon name="sliders" size={15} />
            <span>Контекст и промпт</span>
          </button>
        </nav>

        <!-- Main Content Area -->
        <main class="modal-content custom-scroll">
          {#if activeTab === "general"}
            <section class="section">
              <h3 class="section-title">Активный ИИ-движок</h3>
              <p class="section-desc">
                Выберите, какой бэкенд будет обрабатывать ваши запросы, помогать со структурированием заметок и поиском знаний.
              </p>

              <div class="provider-cards">
                <!-- Codex CLI -->
                <button
                  type="button"
                  class="provider-card"
                  class:selected={draftConfig.provider === "codex"}
                  onclick={() => handleSelectProvider("codex")}
                >
                  <div class="card-radio">
                    <span class="radio-circle"></span>
                  </div>
                  <div class="card-info">
                    <div class="card-header">
                      <span class="card-name">Codex CLI (ChatGPT Подписка)</span>
                      <span class="card-tag sub">Подписка Plus/Pro</span>
                    </div>
                    <p class="card-text">
                      Использует ваш существующий вход в ChatGPT через локальную консольную утилиту Codex без необходимости оплачивать API-токены.
                    </p>
                    <div class="card-meta">
                      {#if codexStatus?.is_logged_in}
                        <span class="meta-status ok">✓ Авторизован в ChatGPT</span>
                      {:else if codexStatus?.installed}
                        <span class="meta-status warn">⚠ Требуется вход (codex login)</span>
                      {:else}
                        <span class="meta-status err">✕ Утилита codex не найдена</span>
                      {/if}
                    </div>
                  </div>
                </button>

                <!-- OpenRouter -->
                <button
                  type="button"
                  class="provider-card"
                  class:selected={draftConfig.provider === "openrouter"}
                  onclick={() => handleSelectProvider("openrouter")}
                >
                  <div class="card-radio">
                    <span class="radio-circle"></span>
                  </div>
                  <div class="card-info">
                    <div class="card-header">
                      <span class="card-name">OpenRouter API</span>
                      <span class="card-tag multi">Claude, Gemini, DeepSeek</span>
                    </div>
                    <p class="card-text">
                      Прямой доступ к Claude 3.5/3.7 Sonnet, Gemini 2.0 Flash, DeepSeek V3 и десяткам других моделей через единый ключ OpenRouter.
                    </p>
                    <div class="card-meta">
                      <span class="meta-model">Модель: {draftConfig.openrouter_model}</span>
                    </div>
                  </div>
                </button>

                <!-- Custom OpenAI-compatible -->
                <button
                  type="button"
                  class="provider-card"
                  class:selected={draftConfig.provider === "openai"}
                  onclick={() => handleSelectProvider("openai")}
                >
                  <div class="card-radio">
                    <span class="radio-circle"></span>
                  </div>
                  <div class="card-info">
                    <div class="card-header">
                      <span class="card-name">Кастомный OpenAI-совместимый API</span>
                      <span class="card-tag local">Ollama / vLLM / LM Studio / Proxy</span>
                    </div>
                    <p class="card-text">
                      Подключение к локальным серверам (Ollama, vLLM, LM Studio) или кастомным шлюзам и прокси по стандартному протоколу OpenAI.
                    </p>
                    <div class="card-meta">
                      <span class="meta-model">URL: {draftConfig.openai_base_url}</span>
                    </div>
                  </div>
                </button>
              </div>
            </section>

          {:else if activeTab === "codex"}
            <section class="section">
              <h3 class="section-title">Codex CLI — Интеграция подписки ChatGPT</h3>
              <p class="section-desc">
                Прямое выполнение запросов через CLI-агента с использованием авторизации вашей подписки ChatGPT Plus или Pro.
              </p>

              <div class="form-group">
                <label class="form-label" for="codex-status-row">Статус локальной среды:</label>
                <div class="status-box" id="codex-status-row">
                  <div class="status-line">
                    <span class="status-key">Бинарник:</span>
                    <code>{codexStatus?.binary_path || "codex"}</code>
                    <span class="badge" class:badge-ok={codexStatus?.installed} class:badge-err={!codexStatus?.installed}>
                      {codexStatus?.installed ? "Установлен" : "Не найден"}
                    </span>
                  </div>
                  <div class="status-line">
                    <span class="status-key">Авторизация:</span>
                    <span class="status-val">{codexStatus?.login_status || "Неизвестно"}</span>
                  </div>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="codex-model-select">Модель Codex:</label>
                <select id="codex-model-select" class="form-select" bind:value={draftConfig.codex_model}>
                  {#each codexPresets as m}
                    <option value={m.id}>{m.name}</option>
                  {/each}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="codex-sandbox-select">Режим песочницы (Sandbox Policy):</label>
                <select id="codex-sandbox-select" class="form-select" bind:value={draftConfig.codex_sandbox}>
                  <option value="read-only">read-only (Безопасный: только чтение базы знаний)</option>
                  <option value="workspace-write">workspace-write (Агент может создавать и изменять заметки)</option>
                </select>
                <span class="field-hint">
                  В режиме <code>read-only</code> агент имеет доступ к чтению базы, но не изменяет файлы без явного подтверждения.
                </span>
              </div>
            </section>

          {:else if activeTab === "openrouter"}
            <section class="section">
              <h3 class="section-title">OpenRouter API</h3>
              <p class="section-desc">
                Агрегатор моделей мирового класса. Поддерживает Claude 3.5/3.7, Gemini 2.0 Flash, DeepSeek и другие.
              </p>

              <div class="form-group">
                <label class="form-label" for="openrouter-api-key">API-ключ OpenRouter:</label>
                <div class="key-input-row">
                  {#if showOpenrouterKey}
                    <input
                      id="openrouter-api-key"
                      type="text"
                      class="form-input"
                      placeholder="sk-or-v1-..."
                      bind:value={draftConfig.openrouter_key}
                    />
                  {:else}
                    <input
                      id="openrouter-api-key"
                      type="password"
                      class="form-input"
                      placeholder="sk-or-v1-..."
                      bind:value={draftConfig.openrouter_key}
                    />
                  {/if}
                  <button
                    type="button"
                    class="btn-toggle-eye"
                    onclick={() => (showOpenrouterKey = !showOpenrouterKey)}
                  >
                    <Icon name={showOpenrouterKey ? "eye-off" : "eye"} size={16} />
                  </button>
                </div>
                <span class="field-hint">Ключ сохраняется в локальной конфигурации <code>~/.config/cortex/assistant_config.json</code>.</span>
              </div>

              <div class="form-group">
                <label class="form-label" for="openrouter-model-select">Модель:</label>
                <div class="model-select-wrap">
                  <select id="openrouter-model-select" class="form-select" bind:value={draftConfig.openrouter_model}>
                    {#each openrouterPresets as p}
                      <option value={p.id}>{p.name} ({p.id})</option>
                    {/each}
                  </select>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="openrouter-custom-model">Или укажите кастомный идентификатор модели OpenRouter:</label>
                <input
                  id="openrouter-custom-model"
                  type="text"
                  class="form-input"
                  placeholder="например: meta-llama/llama-3.3-70b-instruct"
                  bind:value={draftConfig.openrouter_model}
                />
              </div>

              <div class="form-group">
                <div class="slider-header">
                  <label class="form-label" for="openrouter-temp">Температура (Креативность):</label>
                  <span class="slider-val">{draftConfig.openrouter_temperature}</span>
                </div>
                <input
                  id="openrouter-temp"
                  type="range"
                  min="0.0"
                  max="1.5"
                  step="0.05"
                  class="form-slider"
                  bind:value={draftConfig.openrouter_temperature}
                />
              </div>
            </section>

          {:else if activeTab === "openai"}
            <section class="section">
              <h3 class="section-title">Кастомный OpenAI-совместимый API</h3>
              <p class="section-desc">
                Любой локальный или удаленный сервис с поддержкой стандартного эндпоинта <code>/chat/completions</code>.
              </p>

              <div class="form-group">
                <label class="form-label" for="openai-base-url">Базовый URL (Base URL):</label>
                <input
                  id="openai-base-url"
                  type="text"
                  class="form-input"
                  placeholder="http://localhost:11434/v1"
                  bind:value={draftConfig.openai_base_url}
                />
                <span class="field-hint">Примеры: <code>http://localhost:11434/v1</code> (Ollama), <code>http://localhost:1234/v1</code> (LM Studio), <code>https://api.openai.com/v1</code>.</span>
              </div>

              <div class="form-group">
                <label class="form-label" for="openai-api-key">API-ключ (если требуется):</label>
                <div class="key-input-row">
                  {#if showOpenaiKey}
                    <input
                      id="openai-api-key"
                      type="text"
                      class="form-input"
                      placeholder="sk-..."
                      bind:value={draftConfig.openai_key}
                    />
                  {:else}
                    <input
                      id="openai-api-key"
                      type="password"
                      class="form-input"
                      placeholder="sk-..."
                      bind:value={draftConfig.openai_key}
                    />
                  {/if}
                  <button
                    type="button"
                    class="btn-toggle-eye"
                    onclick={() => (showOpenaiKey = !showOpenaiKey)}
                  >
                    <Icon name={showOpenaiKey ? "eye-off" : "eye"} size={16} />
                  </button>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="openai-model-input">Название модели:</label>
                <input
                  id="openai-model-input"
                  type="text"
                  class="form-input"
                  placeholder="llama3, deepseek-r1, qwen2.5-coder, gpt-4o..."
                  bind:value={draftConfig.openai_model}
                />
              </div>

              <div class="form-group">
                <div class="slider-header">
                  <label class="form-label" for="openai-temp">Температура:</label>
                  <span class="slider-val">{draftConfig.openai_temperature}</span>
                </div>
                <input
                  id="openai-temp"
                  type="range"
                  min="0.0"
                  max="1.5"
                  step="0.05"
                  class="form-slider"
                  bind:value={draftConfig.openai_temperature}
                />
              </div>
            </section>

          {:else if activeTab === "context"}
            <section class="section">
              <h3 class="section-title">Контекст и системные инструкции</h3>
              <p class="section-desc">
                Настройте поведение ИИ и автоматическую передачу контекста вашей базы знаний.
              </p>

              <div class="form-group">
                <label class="form-label" for="system-prompt-input">Системный промпт:</label>
                <textarea
                  id="system-prompt-input"
                  class="form-textarea"
                  rows="4"
                  bind:value={draftConfig.system_prompt}
                ></textarea>
              </div>

              <div class="checkbox-group">
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    bind:checked={draftConfig.include_vault_context}
                  />
                  <div class="check-text">
                    <span class="check-title">Передавать путь активной базы знаний</span>
                    <span class="check-sub">Сообщает ассистенту корневой путь и структуру текущего хранилища.</span>
                  </div>
                </label>

                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    bind:checked={draftConfig.include_active_note}
                  />
                  <div class="check-text">
                    <span class="check-title">Передавать открытую заметку</span>
                    <span class="check-sub">Автоматически прикрепляет имя и текст активной заметки в начало контекста запроса.</span>
                  </div>
                </label>
              </div>

              <div class="security-note">
                <Icon name="shield-check" size={16} color="var(--accent-color, #0284c7)" />
                <span>Все пароли и токены в формате <code>&#123;&#123;secret:...&#125;&#125;</code> шифруются вашим SSH-ключом перед отправкой любому провайдеру!</span>
              </div>
            </section>
          {/if}
        </main>
      </div>

      <!-- Footer Actions -->
      <div class="modal-footer">
        <button class="btn btn-cancel" onclick={onClose}>Отмена</button>
        <button class="btn btn-primary" onclick={handleSave}>Сохранить настройки</button>
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
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fadeIn 0.15s ease-out;
  }

  .modal-card {
    background: var(--bg-card, #1e293b);
    border: 1px solid var(--border-color, #334155);
    border-radius: 12px;
    width: 100%;
    max-width: 820px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    background: var(--bg-sidebar, rgba(0, 0, 0, 0.15));
    border-bottom: 1px solid var(--border-color, #334155);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-title {
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text-primary, #f8fafc);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary, #f8fafc);
  }

  .modal-layout {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 480px;
  }

  .modal-nav {
    width: 220px;
    background: rgba(0, 0, 0, 0.1);
    border-right: 1px solid var(--border-color, #334155);
    padding: 12px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 6px;
    background: transparent;
    border: none;
    color: var(--text-secondary, #cbd5e1);
    font-size: 0.85rem;
    cursor: pointer;
    text-align: left;
    transition: all 0.12s ease;
    position: relative;
  }

  .nav-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-primary, #f8fafc);
  }

  .nav-item.active {
    background: var(--accent-color, #0284c7);
    color: #ffffff;
    font-weight: 500;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-left: auto;
  }

  .status-dot.green {
    background: #10b981;
    box-shadow: 0 0 6px #10b981;
  }

  .modal-content {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
  }

  .section-title {
    margin: 0 0 6px 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary, #f8fafc);
  }

  .section-desc {
    margin: 0 0 18px 0;
    font-size: 0.85rem;
    color: var(--text-muted, #94a3b8);
    line-height: 1.45;
  }

  .provider-cards {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .provider-card {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 14px 16px;
    border-radius: 8px;
    background: var(--bg-hover, rgba(255, 255, 255, 0.02));
    border: 1px solid var(--border-color, #334155);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s ease;
  }

  .provider-card:hover {
    border-color: rgba(56, 189, 248, 0.4);
    background: rgba(255, 255, 255, 0.04);
  }

  .provider-card.selected {
    border-color: var(--accent-color, #0284c7);
    background: rgba(2, 132, 199, 0.08);
  }

  .card-radio {
    margin-top: 3px;
  }

  .radio-circle {
    display: block;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid var(--text-muted, #64748b);
    position: relative;
    transition: all 0.15s ease;
  }

  .provider-card.selected .radio-circle {
    border-color: var(--accent-color, #0284c7);
  }

  .provider-card.selected .radio-circle::after {
    content: "";
    position: absolute;
    inset: 3px;
    background: var(--accent-color, #0284c7);
    border-radius: 50%;
  }

  .card-info {
    flex: 1;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .card-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-primary, #f8fafc);
  }

  .card-tag {
    font-size: 0.7rem;
    padding: 2px 7px;
    border-radius: 4px;
    font-weight: 500;
  }

  .card-tag.sub {
    background: rgba(16, 185, 129, 0.15);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .card-tag.multi {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.3);
  }

  .card-tag.local {
    background: rgba(168, 85, 247, 0.15);
    color: #c084fc;
    border: 1px solid rgba(168, 85, 247, 0.3);
  }

  .card-text {
    margin: 0 0 8px 0;
    font-size: 0.8rem;
    color: var(--text-muted, #94a3b8);
    line-height: 1.4;
  }

  .card-meta {
    font-size: 0.75rem;
  }

  .meta-status.ok {
    color: #10b981;
    font-weight: 500;
  }

  .meta-status.warn {
    color: #f59e0b;
  }

  .meta-status.err {
    color: #ef4444;
  }

  .meta-model {
    color: var(--text-secondary, #cbd5e1);
    font-family: monospace;
  }

  .form-group {
    margin-bottom: 18px;
  }

  .form-label {
    display: block;
    margin-bottom: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-primary, #f8fafc);
  }

  .form-input,
  .form-select,
  .form-textarea {
    width: 100%;
    padding: 8px 12px;
    background: var(--bg-input, #0f172a);
    border: 1px solid var(--border-color, #334155);
    border-radius: 6px;
    color: var(--text-primary, #f8fafc);
    font-size: 0.85rem;
    outline: none;
    box-sizing: border-box;
  }

  .form-input:focus,
  .form-select:focus,
  .form-textarea:focus {
    border-color: var(--accent-color, #0284c7);
  }

  .key-input-row {
    display: flex;
    gap: 8px;
  }

  .btn-toggle-eye {
    background: var(--bg-hover, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--border-color, #334155);
    border-radius: 6px;
    color: var(--text-muted, #94a3b8);
    cursor: pointer;
    padding: 0 12px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-toggle-eye:hover {
    color: var(--text-primary, #f8fafc);
  }

  .field-hint {
    display: block;
    margin-top: 5px;
    font-size: 0.75rem;
    color: var(--text-muted, #94a3b8);
  }

  .status-box {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border-color, #334155);
    border-radius: 6px;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .status-line {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.8rem;
  }

  .status-key {
    color: var(--text-muted, #94a3b8);
    width: 90px;
  }

  .status-val {
    color: var(--text-primary, #f8fafc);
  }

  .badge {
    font-size: 0.7rem;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .badge-ok {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
  }

  .badge-err {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }

  .slider-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }

  .slider-val {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--accent-color, #0284c7);
  }

  .form-slider {
    width: 100%;
    accent-color: var(--accent-color, #0284c7);
  }

  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 14px;
  }

  .checkbox-label {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
  }

  .check-title {
    display: block;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-primary, #f8fafc);
  }

  .check-sub {
    display: block;
    font-size: 0.75rem;
    color: var(--text-muted, #94a3b8);
  }

  .security-note {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 20px;
    padding: 10px 14px;
    background: rgba(2, 132, 199, 0.1);
    border: 1px solid rgba(2, 132, 199, 0.25);
    border-radius: 6px;
    font-size: 0.75rem;
    color: var(--text-secondary, #cbd5e1);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 20px;
    background: var(--bg-sidebar, rgba(0, 0, 0, 0.15));
    border-top: 1px solid var(--border-color, #334155);
  }

  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .btn-cancel {
    background: transparent;
    border: 1px solid var(--border-color, #334155);
    color: var(--text-secondary, #cbd5e1);
  }

  .btn-cancel:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-primary, #f8fafc);
  }

  .btn-primary {
    background: var(--accent-color, #0284c7);
    border: 1px solid var(--accent-color, #0284c7);
    color: #ffffff;
  }

  .btn-primary:hover {
    filter: brightness(1.1);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
