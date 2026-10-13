<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import Icon from "./Icon.svelte";
  import CustomSelect, { type SelectOption } from "./CustomSelect.svelte";
  import { themeStore } from "$lib/theme/store.svelte";
  import { i18n, t } from "$lib/i18n";
  import { THEME_PRESETS, ACCENT_COLORS } from "$lib/theme/presets";
  import type {
    VaultInfo,
    SshKeyInfo,
    AssistantConfig,
    CodexStatus,
    AssistantProvider,
    PassphrasePolicy,
    SecurityConfig,
    SessionStatus,
  } from "$lib/types";

  interface Props {
    isOpen: boolean;
    initialTab?: "appearance" | "security" | "assistant" | "about";
    activeVault?: VaultInfo | null;
    activeSshKey?: SshKeyInfo | null;
    sshKeys?: SshKeyInfo[];
    onClose: () => void;
    onRequestChangeSshKey?: (key: SshKeyInfo) => void;
  }

  let {
    isOpen,
    initialTab = "appearance",
    activeVault = null,
    activeSshKey = null,
    sshKeys = [],
    onClose,
    onRequestChangeSshKey,
  }: Props = $props();

  let activeTab = $state<"appearance" | "security" | "assistant" | "about">("appearance");
  let customGtkInput = $state("");
  let selectedGtkPath = $state("");
  let selectedKeyPath = $state("");

  // Select options for CustomSelect components
  let gtkThemeOptions = $derived<SelectOption[]>([
    { value: "", label: t("settings.appearance.gtk_none_option") },
    ...themeStore.installedGtkThemes.map((gtk) => ({
      value: gtk.path,
      label: `${gtk.name} (${gtk.is_dark ? "Dark" : "Light"})`,
      badge: gtk.is_dark ? "Dark" : "Light",
    })),
  ]);

  let sshKeyOptions = $derived<SelectOption[]>(
    sshKeys.map((key) => ({
      value: key.path,
      label: `${key.filename} (${key.key_type})${key.comment ? ` — ${key.comment}` : ""}`,
      badge: key.key_type,
    }))
  );

  let passphraseTimeoutOptions = $derived<SelectOption[]>([
    { value: 5, label: t("settings.security.timeout_5m") },
    { value: 10, label: t("settings.security.timeout_10m") },
    { value: 15, label: t("settings.security.timeout_15m") },
    { value: 30, label: t("settings.security.timeout_30m") },
    { value: 60, label: t("settings.security.timeout_1h") },
    { value: 120, label: t("settings.security.timeout_2h") },
  ]);

  let REASONING_EFFORT_OPTIONS = $derived<SelectOption[]>([
    { value: "auto", label: t("settings.assistant_tab.effort_auto_default") },
    { value: "low", label: t("settings.assistant_tab.effort_low") },
    { value: "medium", label: t("settings.assistant_tab.effort_medium") },
    { value: "high", label: t("settings.assistant_tab.effort_high") },
    { value: "xhigh", label: t("settings.assistant_tab.effort_xhigh") },
  ]);

  let CODEX_REASONING_OPTIONS = $derived<SelectOption[]>([
    { value: "auto", label: t("settings.assistant_tab.effort_auto_codex") },
    { value: "low", label: t("settings.assistant_tab.effort_low") },
    { value: "medium", label: t("settings.assistant_tab.effort_medium") },
    { value: "high", label: t("settings.assistant_tab.effort_high") },
    { value: "xhigh", label: t("settings.assistant_tab.effort_xhigh") },
  ]);

  // Security config & session status
  let securityConfig = $state<SecurityConfig>({
    passphrase_policy: "session",
    passphrase_timeout_minutes: 15,
  });
  let sessionStatus = $state<SessionStatus | null>(null);

  function formatRemainingTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m > 0) {
      return `${m} ${t("common.min_short")} ${s} ${t("common.sec_short")}`;
    }
    return `${s} ${t("common.sec_short")}`;
  }

  async function loadSecuritySettings() {
    try {
      const cfg = await invoke<SecurityConfig>("crypto_get_security_config");
      securityConfig = cfg;
    } catch (e) {
      console.error("Failed to load security config:", e);
    }
    await refreshSessionStatus();
  }

  async function refreshSessionStatus() {
    try {
      const status = await invoke<SessionStatus>("crypto_get_session_status");
      sessionStatus = status;
    } catch (e) {
      console.error("Failed to get session status:", e);
    }
  }

  async function saveSecuritySettings() {
    try {
      await invoke("crypto_save_security_config", {
        config: {
          passphrase_policy: securityConfig.passphrase_policy,
          passphrase_timeout_minutes: Number(securityConfig.passphrase_timeout_minutes) || 15,
        },
      });
      await refreshSessionStatus();
    } catch (e) {
      console.error("Failed to save security config:", e);
    }
  }

  async function setPolicy(policy: PassphrasePolicy) {
    securityConfig.passphrase_policy = policy;
    await saveSecuritySettings();
  }

  async function handleLockSession() {
    try {
      await invoke("crypto_clear_session_passphrase");
      await refreshSessionStatus();
    } catch (e) {
      console.error("Failed to clear session passphrase:", e);
    }
  }

  // AI Assistant state
  let assistantConfig = $state<AssistantConfig>({
    provider: "codex",
    codex_model: "gpt-6.1-sol",
    codex_sandbox: "workspace-write",
    codex_reasoning_effort: "auto",
    openrouter_key: null,
    openrouter_model: "anthropic/claude-3.7-sonnet",
    openrouter_reasoning_effort: "auto",
    openrouter_temperature: 0.7,
    openai_base_url: "http://localhost:11434/v1",
    openai_key: null,
    openai_model: "llama3",
    openai_reasoning_effort: "auto",
    openai_temperature: 0.7,
    system_prompt: "Ты — встроенный AI-ассистент базы знаний Corthal. Ты помогаешь формулировать мысли, структурировать заметки и связывать концепции. Все секреты, переданные в формате 🔒[enc:...], являются защищенными токенами шифрования Age — сохраняй их в неизменном виде.",
    include_vault_context: true,
    include_active_note: true,
  });

  let codexStatus = $state<CodexStatus | null>(null);
  let showOpenrouterKey = $state(false);
  let showOpenaiKey = $state(false);

  // Model discovery states
  let isOpenrouterLoading = $state(false);
  let openrouterFetchError = $state<string | null>(null);
  let openrouterModels = $state<string[]>([]);

  let isOpenaiLoading = $state(false);
  let openaiFetchError = $state<string | null>(null);
  let openaiModels = $state<string[]>([]);

  let codexModelOptions = $derived<SelectOption[]>(
    (codexStatus?.available_models && codexStatus.available_models.length > 0
      ? codexStatus.available_models
      : ["gpt-6.1-sol", "gpt-6-astra", "gpt-5.6-sol", "gpt-5.5", "o3-mini", "o1", "gpt-4o"]
    ).map((m) => ({ value: m, label: m }))
  );

  let openrouterModelOptions = $derived<SelectOption[]>(
    (openrouterModels.length > 0
      ? openrouterModels
      : [
          "anthropic/claude-3.7-sonnet",
          "anthropic/claude-3.5-sonnet",
          "google/gemini-2.0-flash-001",
          "openai/gpt-4o",
          "deepseek/deepseek-chat",
        ]
    ).map((m) => ({ value: m, label: m }))
  );

  let openaiModelOptions = $derived<SelectOption[]>(
    openaiModels.map((m) => ({ value: m, label: m }))
  );

  $effect(() => {
    if (isOpen) {
      if (initialTab) activeTab = initialTab;
      if (activeSshKey) selectedKeyPath = activeSshKey.path;
      loadAssistantSettings();
      loadSecuritySettings();

      let unlistenUnlocked: UnlistenFn | null = null;
      let unlistenLocked: UnlistenFn | null = null;
      let pollInterval: any = null;

      listen("crypto:session-unlocked", () => {
        refreshSessionStatus();
      }).then((fn) => {
        unlistenUnlocked = fn;
      });

      listen("crypto:session-locked", () => {
        refreshSessionStatus();
      }).then((fn) => {
        unlistenLocked = fn;
      });

      pollInterval = setInterval(() => {
        if (activeTab === "security") {
          refreshSessionStatus();
        }
      }, 1000);

      return () => {
        if (unlistenUnlocked) unlistenUnlocked();
        if (unlistenLocked) unlistenLocked();
        if (pollInterval) clearInterval(pollInterval);
      };
    }
  });

  $effect(() => {
    if (isOpen && activeTab === "security") {
      refreshSessionStatus();
    }
  });

  async function loadAssistantSettings() {
    try {
      const cfg = await invoke<AssistantConfig>("assistant_get_config");
      assistantConfig = {
        ...cfg,
        codex_reasoning_effort: cfg.codex_reasoning_effort || "auto",
        openrouter_reasoning_effort: cfg.openrouter_reasoning_effort || "auto",
        openai_reasoning_effort: cfg.openai_reasoning_effort || "auto",
      };
    } catch (e) {
      console.error("Failed to load assistant config:", e);
    }

    try {
      codexStatus = await invoke<CodexStatus>("assistant_check_codex_status");
    } catch (e) {
      console.error("Failed to check codex status:", e);
    }
  }

  async function saveAssistantSettings() {
    try {
      await invoke("assistant_save_config", { config: $state.snapshot(assistantConfig) });
    } catch (e) {
      console.error("Failed to save assistant config:", e);
    }
  }

  async function fetchOpenrouterModels() {
    isOpenrouterLoading = true;
    openrouterFetchError = null;
    try {
      const list = await invoke<string[]>("assistant_fetch_models", {
        baseUrl: "https://openrouter.ai/api/v1/models",
        apiKey: assistantConfig.openrouter_key,
      });
      openrouterModels = list;
    } catch (err: any) {
      openrouterFetchError = err?.toString() || t("settings.assistant_tab.fetch_openrouter_error");
    } finally {
      isOpenrouterLoading = false;
    }
  }

  async function fetchOpenaiModels() {
    isOpenaiLoading = true;
    openaiFetchError = null;
    try {
      const list = await invoke<string[]>("assistant_fetch_models", {
        baseUrl: assistantConfig.openai_base_url,
        apiKey: assistantConfig.openai_key,
      });
      openaiModels = list;
    } catch (err: any) {
      openaiFetchError = err?.toString() || t("settings.assistant_tab.fetch_endpoint_error");
    } finally {
      isOpenaiLoading = false;
    }
  }

  function handleDone() {
    saveAssistantSettings();
    saveSecuritySettings();
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if ((e.key === "Escape" || e.code === "Escape") && isOpen) {
      handleDone();
    }
  }

  function handlePresetSelect(presetId: string) {
    themeStore.setPreset(presetId);
  }

  function handleAccentSelect(accentId: string) {
    themeStore.setAccent(accentId);
  }

  function handleCustomColorChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.value) {
      themeStore.setAccent("custom", input.value);
    }
  }

  async function handleApplyInstalledGtk() {
    if (selectedGtkPath) {
      await themeStore.loadGtkTheme(selectedGtkPath);
    }
  }

  async function handleApplyCustomGtk() {
    if (customGtkInput.trim()) {
      await themeStore.loadGtkTheme(customGtkInput.trim());
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- Backdrop -->
  <div class="modal-backdrop" onclick={onClose} role="presentation">
    <!-- Modal Window -->
    <div
      class="modal-window"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <!-- Header -->
      <header class="modal-header">
        <div class="header-left">
          <Icon name="settings" size={20} color="var(--corthal-accent)" />
          <h2 id="settings-title">{t("settings.modal_title")}</h2>
        </div>
        <button class="close-btn" onclick={handleDone} aria-label={t("common.close")}>
          <Icon name="x" size={18} />
        </button>
      </header>

      <!-- Body with Sidebar Nav + Tab Content -->
      <div class="modal-body">
        <!-- Tabs Nav -->
        <nav class="settings-nav">
          <button
            class="nav-item"
            class:active={activeTab === "appearance"}
            onclick={() => (activeTab = "appearance")}
          >
            <Icon name="monitor" size={16} />
            <span>{t("settings.tabs.appearance")}</span>
          </button>
          <button
            class="nav-item"
            class:active={activeTab === "security"}
            onclick={() => (activeTab = "security")}
          >
            <Icon name="shield" size={16} />
            <span>{t("settings.tabs.security")}</span>
          </button>
          <button
            class="nav-item"
            class:active={activeTab === "assistant"}
            onclick={() => (activeTab = "assistant")}
          >
            <Icon name="sparkles" size={16} />
            <span>{t("settings.tabs.assistant")}</span>
          </button>
          <button
            class="nav-item"
            class:active={activeTab === "about"}
            onclick={() => (activeTab = "about")}
          >
            <Icon name="lightbulb" size={16} />
            <span>{t("settings.tabs.about")}</span>
          </button>
        </nav>

        <!-- Tab Content -->
        <main class="tab-content">
          {#if activeTab === "appearance"}
            <!-- 0. LANGUAGE SELECTION -->
            <section class="settings-section">
              <div class="section-header-row">
                <h3 class="section-title">{t("settings.language.title")}</h3>
              </div>
              <p class="section-desc">
                {t("settings.language.desc")}
              </p>
              <div class="lang-selector-grid">
                <button
                  type="button"
                  class="lang-card"
                  class:selected={i18n.locale === "ru"}
                  onclick={() => i18n.setLocale("ru")}
                >
                  <span class="lang-flag">🇷🇺</span>
                  <div class="lang-info">
                    <span class="lang-name">{t("settings.language.ru")}</span>
                    <span class="lang-sub">{t("settings.language.ru_desc")}</span>
                  </div>
                  {#if i18n.locale === "ru"}
                    <div class="lang-check">
                      <Icon name="check" size={16} color="var(--corthal-accent)" />
                    </div>
                  {/if}
                </button>

                <button
                  type="button"
                  class="lang-card"
                  class:selected={i18n.locale === "en"}
                  onclick={() => i18n.setLocale("en")}
                >
                  <span class="lang-flag">🇬🇧</span>
                  <div class="lang-info">
                    <span class="lang-name">{t("settings.language.en")}</span>
                    <span class="lang-sub">{t("settings.language.en_desc")}</span>
                  </div>
                  {#if i18n.locale === "en"}
                    <div class="lang-check">
                      <Icon name="check" size={16} color="var(--corthal-accent)" />
                    </div>
                  {/if}
                </button>
              </div>
            </section>

            <!-- 1. LIVE PREVIEW CARD -->
            <section class="settings-section">
              <h3 class="section-title">{t("settings.appearance.preview_title")}</h3>
              <div class="preview-card">
                <div class="preview-header">
                  <div class="preview-dots">
                    <span class="dot red"></span>
                    <span class="dot yellow"></span>
                    <span class="dot green"></span>
                  </div>
                  <span class="preview-title">
                    {themeStore.currentPreset.name} • {themeStore.currentAccent.name}
                  </span>
                </div>
                <div class="preview-content">
                  <div class="preview-sidebar">
                    <div class="preview-bar-item active">
                      <span class="p-icon"></span>
                      <span>{t("settings.appearance.preview_notes")}</span>
                    </div>
                    <div class="preview-bar-item">
                      <span class="p-icon"></span>
                      <span>{t("settings.appearance.preview_projects")}</span>
                    </div>
                  </div>
                  <div class="preview-main">
                    <div class="preview-doc-header">
                      <h4>{t("settings.appearance.preview_doc_title")}</h4>
                      <span class="preview-badge">{t("settings.appearance.preview_badge")}</span>
                    </div>
                    <p class="preview-text">
                      {t("settings.appearance.preview_text")}
                    </p>
                    <div class="preview-actions">
                      <button class="preview-btn primary">{t("settings.appearance.preview_btn_primary")}</button>
                      <button class="preview-btn secondary">{t("settings.appearance.preview_btn_secondary")}</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- 2. THEME PRESETS -->
            <section class="settings-section">
              <div class="section-header-row">
                <h3 class="section-title">{t("settings.appearance.palette_title")}</h3>
                {#if themeStore.config.gtkThemePath}
                  <button class="reset-link" onclick={() => themeStore.clearGtkTheme()}>
                    {t("settings.appearance.return_corthal_presets")}
                  </button>
                {/if}
              </div>
              <p class="section-desc">
                {t("settings.appearance.palette_desc")}
              </p>

              <div class="presets-grid">
                {#each THEME_PRESETS as preset}
                  <button
                    class="preset-card"
                    class:selected={themeStore.config.presetId === preset.id && !themeStore.config.gtkThemePath}
                    onclick={() => handlePresetSelect(preset.id)}
                  >
                    <div class="preset-swatches">
                      <span class="swatch" style="background: {preset.colors.bgSidebar};"></span>
                      <span class="swatch" style="background: {preset.colors.bgMain};"></span>
                      <span class="swatch" style="background: {preset.colors.bgCard};"></span>
                      <span class="swatch" style="background: {preset.colors.border};"></span>
                    </div>
                    <div class="preset-info">
                      <div class="preset-name-row">
                        <span class="preset-name">{preset.name}</span>
                        {#if preset.category === "light"}
                          <span class="category-badge">{t("theme_dropdown.light_category")}</span>
                        {/if}
                      </div>
                      <span class="preset-desc">{t(`themes.presets.${preset.id}`)}</span>
                    </div>
                    {#if themeStore.config.presetId === preset.id && !themeStore.config.gtkThemePath}
                      <div class="preset-check">
                        <Icon name="check" size={14} color="var(--corthal-accent)" />
                      </div>
                    {/if}
                  </button>
                {/each}
              </div>
            </section>

            <!-- 3. ACCENT COLORS -->
            <section class="settings-section">
              <h3 class="section-title">{t("settings.appearance.accent_title")}</h3>
              <p class="section-desc">
                {t("settings.appearance.accent_desc")}
              </p>

              <div class="accents-container">
                <div class="accents-grid">
                  {#each ACCENT_COLORS as accent}
                    <button
                      class="accent-chip"
                      class:selected={themeStore.config.accentId === accent.id && !themeStore.config.customAccentHex}
                      onclick={() => handleAccentSelect(accent.id)}
                      title="{t(`themes.accents.${accent.id}`)} ({accent.hex})"
                    >
                      <span class="color-dot" style="background: {accent.hex};">
                        {#if themeStore.config.accentId === accent.id && !themeStore.config.customAccentHex}
                          <Icon name="check" size={12} color="#ffffff" />
                        {/if}
                      </span>
                      <span class="accent-label">
                        {t(`themes.accents.${accent.id}`)}
                        {#if accent.isSystem}
                          <span class="sys-tag">GTK</span>
                        {/if}
                      </span>
                    </button>
                  {/each}
                </div>

                <!-- Custom color picker -->
                <div class="custom-color-row">
                  <label class="custom-color-label">
                    <span class="custom-color-indicator" style="background: {themeStore.currentAccent.hex};"></span>
                    <input
                      type="color"
                      value={themeStore.currentAccent.hex}
                      oninput={handleCustomColorChange}
                    />
                    <span>{t("settings.appearance.custom_hex")}</span>
                  </label>
                  {#if themeStore.config.customAccentHex}
                    <span class="custom-hex-val">{themeStore.config.customAccentHex}</span>
                  {/if}
                </div>
              </div>
            </section>

            <!-- 4. CONTRAST & ACCESSIBILITY -->
            <section class="settings-section">
              <h3 class="section-title">{t("settings.appearance.contrast_title")}</h3>
              <div class="toggle-row">
                <div class="toggle-text">
                  <span class="toggle-label">{t("settings.appearance.high_contrast")}</span>
                  <span class="toggle-sub">
                    {t("settings.appearance.high_contrast_desc")}
                  </span>
                </div>
                <button
                  class="toggle-switch"
                  class:active={themeStore.config.highContrast}
                  onclick={() => themeStore.toggleHighContrast()}
                  role="switch"
                  aria-checked={themeStore.config.highContrast}
                  aria-label={t("settings.appearance.high_contrast")}
                >
                  <span class="toggle-handle"></span>
                </button>
              </div>
            </section>

            <!-- 5. LINUX GTK INTEGRATION -->
            <section class="settings-section">
              <h3 class="section-title">{t("settings.appearance.linux_gtk_title")}</h3>
              <p class="section-desc">
                {t("settings.appearance.linux_gtk_desc")}
              </p>

              {#if themeStore.systemInfo}
                <div class="sys-info-banner">
                  <div class="sys-info-item">
                    <span class="sys-label">{t("settings.appearance.gtk_theme_label")}</span>
                    <span class="sys-value">{themeStore.systemInfo.gtk_theme_name}</span>
                  </div>
                  <div class="sys-info-item">
                    <span class="sys-label">{t("settings.appearance.system_mode_label")}</span>
                    <span class="sys-value">
                      {themeStore.systemInfo.is_dark ? "Dark" : "Light"}
                    </span>
                  </div>
                  {#if themeStore.systemInfo.system_accent}
                    <div class="sys-info-item">
                      <span class="sys-label">{t("settings.appearance.system_accent_label")}</span>
                      <span class="sys-value color-badge">
                        <span class="badge-color" style="background: {themeStore.systemInfo.system_accent}"></span>
                        {themeStore.systemInfo.system_accent}
                      </span>
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Follow system theme toggle -->
              <div class="toggle-row" style="margin-top: 14px;">
                <div class="toggle-text">
                  <span class="toggle-label">{t("settings.appearance.follow_system_label")}</span>
                  <span class="toggle-sub">
                    {t("settings.appearance.follow_system_desc")}
                  </span>
                </div>
                <button
                  class="toggle-switch"
                  class:active={themeStore.config.useSystemTheme}
                  onclick={() => themeStore.setUseSystemTheme(!themeStore.config.useSystemTheme)}
                  role="switch"
                  aria-checked={themeStore.config.useSystemTheme}
                  aria-label={t("settings.appearance.follow_system_label")}
                >
                  <span class="toggle-handle"></span>
                </button>
              </div>

              <!-- GTK Theme list -->
              <div class="gtk-picker-box">
                <span class="gtk-picker-label">{t("settings.appearance.installed_gtk_themes")}</span>
                <div class="gtk-picker-controls">
                  <div class="gtk-select-wrapper">
                    <CustomSelect
                      options={gtkThemeOptions}
                      bind:value={selectedGtkPath}
                      placeholder={t("settings.appearance.gtk_select_placeholder")}
                    />
                  </div>
                  <button
                    class="apply-gtk-btn"
                    disabled={!selectedGtkPath || themeStore.isLoadingGtk}
                    onclick={handleApplyInstalledGtk}
                  >
                    {#if themeStore.isLoadingGtk}
                      {t("common.loading")}
                    {:else}
                      {t("settings.appearance.apply_gtk")}
                    {/if}
                  </button>
                </div>

                <!-- Custom folder import -->
                <div class="custom-gtk-import">
                  <span class="gtk-picker-label">{t("settings.appearance.gtk_custom_folder_label")}</span>
                  <div class="gtk-picker-controls">
                    <input
                      type="text"
                      bind:value={customGtkInput}
                      placeholder="/home/bn/.themes/..."
                      class="custom-path-input"
                    />
                    <button
                      class="apply-gtk-btn"
                      disabled={!customGtkInput.trim() || themeStore.isLoadingGtk}
                      onclick={handleApplyCustomGtk}
                    >
                      {t("common.import")}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          {:else if activeTab === "security"}
            <section class="settings-section">
              <h3 class="section-title">{t("settings.security.title")}</h3>
              <p class="section-desc">
                {t("settings.security.desc")}
              </p>

              <div class="security-card">
                <div class="sec-grid-info">
                  <div class="sec-item">
                    <span class="sec-label">{t("settings.security.current_vault")}</span>
                    <div class="vault-sec-badge">
                      <span class="vault-sec-name">📁 {activeVault?.name || "knowledge"}</span>
                      <span class="vault-sec-path">({activeVault?.display_path || "~/knowledge"})</span>
                    </div>
                  </div>

                  <div class="sec-item">
                    <span class="sec-label">{t("settings.security.active_key")}:</span>
                    <div class="current-key-row">
                      <span class="key-badge">{activeSshKey?.key_type || "ED25519"}</span>
                      <code class="sec-code">{activeSshKey?.filename || "id_ed25519.pub"}</code>
                      {#if activeSshKey?.comment}
                        <span class="key-comment-tag">{activeSshKey.comment}</span>
                      {/if}
                    </div>
                  </div>
                </div>

                <div class="sec-item">
                  <span class="sec-label">{t("settings.security.change_ssh_key")}</span>
                  <div class="ssh-selector-row">
                    <div class="ssh-select-wrapper">
                      <CustomSelect
                        options={sshKeyOptions}
                        bind:value={selectedKeyPath}
                        placeholder={t("settings.security.select_ssh_key_placeholder")}
                      />
                    </div>
                    <button
                      type="button"
                      class="apply-key-btn"
                      disabled={!selectedKeyPath || selectedKeyPath === activeSshKey?.path}
                      onclick={() => {
                        const targetKey = sshKeys.find(k => k.path === selectedKeyPath);
                        if (targetKey) onRequestChangeSshKey?.(targetKey);
                      }}
                    >
                      {t("common.apply")}
                    </button>
                  </div>
                  <span class="sec-note">{t("settings.security.change_key_note")}</span>
                </div>

                <div class="sec-grid-status">
                  <div class="sec-item">
                    <span class="sec-label">{t("settings.security.token_format")}</span>
                    <code class="sec-code">🔒[enc:v1:AGE-ENCRYPTED-DATA]</code>
                  </div>

                  <div class="sec-item">
                    <span class="sec-label">{t("settings.security.vault_status")}</span>
                    <span class="sec-badge ok">{t("settings.security.vault_protected")}</span>
                  </div>
                </div>
              </div>

              <!-- Passphrase Cache Policy Section -->
              <h3 class="section-title" style="margin-top: 18px;">{t("settings.security.policy_title")}</h3>
              <p class="section-desc">
                {t("settings.security.policy_desc")}
              </p>

              <div class="security-card">
                <!-- Policy Option: Once per session -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                  class="policy-option-row"
                  class:selected={securityConfig.passphrase_policy === "session"}
                  onclick={() => setPolicy("session")}
                  role="radio"
                  aria-checked={securityConfig.passphrase_policy === "session"}
                  tabindex="0"
                >
                  <div class="policy-radio-label">
                    <div class="custom-radio-circle" class:checked={securityConfig.passphrase_policy === "session"}>
                      {#if securityConfig.passphrase_policy === "session"}
                        <div class="radio-inner-dot"></div>
                      {/if}
                    </div>
                    <div class="policy-option-info">
                      <span class="policy-title">{t("settings.security.policy_session")}</span>
                      <span class="policy-desc">
                        {t("settings.security.policy_session_desc")}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Policy Option: Timeout in minutes -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                  class="policy-option-row"
                  class:selected={securityConfig.passphrase_policy === "timeout"}
                  onclick={() => setPolicy("timeout")}
                  role="radio"
                  aria-checked={securityConfig.passphrase_policy === "timeout"}
                  tabindex="0"
                >
                  <div class="policy-radio-label">
                    <div class="custom-radio-circle" class:checked={securityConfig.passphrase_policy === "timeout"}>
                      {#if securityConfig.passphrase_policy === "timeout"}
                        <div class="radio-inner-dot"></div>
                      {/if}
                    </div>
                    <div class="policy-option-info">
                      <span class="policy-title">{t("settings.security.policy_timeout")}</span>
                      <span class="policy-desc">
                        {t("settings.security.policy_timeout_desc")}
                      </span>
                    </div>
                  </div>

                  {#if securityConfig.passphrase_policy === "timeout"}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div class="timeout-config-row" onclick={(e) => e.stopPropagation()} role="presentation">
                      <span class="timeout-label">{t("settings.security.timeout_label")}</span>
                      <div class="timeout-select-wrap">
                        <CustomSelect
                          options={passphraseTimeoutOptions}
                          bind:value={securityConfig.passphrase_timeout_minutes}
                          onchange={() => saveSecuritySettings()}
                        />
                      </div>
                    </div>
                  {/if}
                </div>

                <!-- Policy Option: Always prompt -->
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                  class="policy-option-row"
                  class:selected={securityConfig.passphrase_policy === "always"}
                  onclick={() => setPolicy("always")}
                  role="radio"
                  aria-checked={securityConfig.passphrase_policy === "always"}
                  tabindex="0"
                >
                  <div class="policy-radio-label">
                    <div class="custom-radio-circle" class:checked={securityConfig.passphrase_policy === "always"}>
                      {#if securityConfig.passphrase_policy === "always"}
                        <div class="radio-inner-dot"></div>
                      {/if}
                    </div>
                    <div class="policy-option-info">
                      <span class="policy-title">{t("settings.security.policy_always")}</span>
                      <span class="policy-desc">
                        {t("settings.security.policy_always_desc")}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Current Session Lock Status -->
                <div class="sec-item session-status-row">
                  <span class="sec-label">{t("settings.security.session_status")}</span>
                  <div class="session-status-controls">
                    {#if sessionStatus?.is_unlocked}
                      <span class="sec-badge ok">
                        🔓 {t("settings.security.unlocked_for", { time: sessionStatus.remaining_seconds != null ? formatRemainingTime(sessionStatus.remaining_seconds) : "session" })}
                      </span>
                      <button
                        type="button"
                        class="action-lock-btn"
                        onclick={handleLockSession}
                        title={t("settings.security.lock_now")}
                      >
                        <Icon name="lock" size={13} color="#fca5a5" />
                        <span>{t("settings.security.lock_now")}</span>
                      </button>
                    {:else}
                      <span class="sec-badge locked">
                        {t("settings.security.memory_locked")}
                      </span>
                    {/if}
                  </div>
                </div>
              </div>
            </section>
          {:else if activeTab === "assistant"}
            <section class="settings-section">
              <h3 class="section-title">{t("settings.assistant_tab.title")}</h3>
              <p class="section-desc">
                {t("settings.assistant_tab.desc")}
              </p>

              <div class="provider-accordion-list">
                <!-- 1. CODEX CLI -->
                <div class="provider-card-accordion" class:selected={assistantConfig.provider === "codex"}>
                  <label class="provider-card-header">
                    <input
                      type="radio"
                      name="settings-provider"
                      value="codex"
                      checked={assistantConfig.provider === "codex"}
                      onchange={() => {
                        assistantConfig.provider = "codex";
                        saveAssistantSettings();
                      }}
                    />
                    <div class="provider-header-main">
                      <div class="provider-title-line">
                        <span class="provider-label">Codex CLI</span>
                        <span class="provider-tag codex">ChatGPT Plus / Pro</span>
                      </div>
                      <span class="provider-hint">
                        {t("settings.assistant_tab.codex_hint")}
                      </span>
                    </div>
                    <div class="provider-header-status">
                      {#if codexStatus?.is_logged_in}
                        <span class="status-chip success">{t("settings.assistant_tab.codex_status_ok")}</span>
                      {:else if codexStatus?.installed}
                        <span class="status-chip warning">{t("settings.assistant_tab.codex_status_login")}</span>
                      {:else}
                        <span class="status-chip error">{t("settings.assistant_tab.codex_status_missing")}</span>
                      {/if}
                    </div>
                  </label>

                  {#if assistantConfig.provider === "codex"}
                    <div class="provider-card-body">
                      <!-- Model Selection -->
                      <div class="field-row">
                        <span class="field-label">{t("settings.assistant_tab.codex_model_label")}</span>
                        <div class="field-control">
                          <CustomSelect
                            options={codexModelOptions}
                            bind:value={assistantConfig.codex_model}
                            onchange={saveAssistantSettings}
                          />
                        </div>
                      </div>

                      <!-- Custom Model text input -->
                      <div class="field-row">
                        <label class="field-label" for="codex-custom-model">{t("settings.assistant_tab.custom_model_label")}</label>
                        <div class="field-control">
                          <input
                            id="codex-custom-model"
                            type="text"
                            class="corthal-input"
                            bind:value={assistantConfig.codex_model}
                            onblur={saveAssistantSettings}
                            placeholder="gpt-6.1-sol"
                          />
                        </div>
                      </div>

                      <!-- Reasoning Effort -->
                      <div class="field-row">
                        <span class="field-label">{t("settings.assistant_tab.reasoning_effort_label")}</span>
                        <div class="field-control">
                          <CustomSelect
                            options={CODEX_REASONING_OPTIONS}
                            bind:value={assistantConfig.codex_reasoning_effort}
                            onchange={saveAssistantSettings}
                          />
                        </div>
                      </div>
                    </div>
                  {/if}
                </div>

                <!-- 2. OPENROUTER API -->
                <div class="provider-card-accordion" class:selected={assistantConfig.provider === "openrouter"}>
                  <label class="provider-card-header">
                    <input
                      type="radio"
                      name="settings-provider"
                      value="openrouter"
                      checked={assistantConfig.provider === "openrouter"}
                      onchange={() => {
                        assistantConfig.provider = "openrouter";
                        saveAssistantSettings();
                      }}
                    />
                    <div class="provider-header-main">
                      <div class="provider-title-line">
                        <span class="provider-label">OpenRouter API</span>
                        <span class="provider-tag openrouter">Claude, Gemini, DeepSeek</span>
                      </div>
                      <span class="provider-hint">
                        {t("settings.assistant_tab.openrouter_hint")}
                      </span>
                    </div>
                  </label>

                  {#if assistantConfig.provider === "openrouter"}
                    <div class="provider-card-body">
                      <!-- OpenRouter API Key -->
                      <div class="field-row">
                        <label class="field-label" for="or-key">{t("settings.assistant_tab.openrouter_key_label")}</label>
                        <div class="field-control input-with-btn">
                          <input
                            id="or-key"
                            type={showOpenrouterKey ? "text" : "password"}
                            class="corthal-input"
                            placeholder="sk-or-v1-..."
                            bind:value={assistantConfig.openrouter_key}
                            onblur={saveAssistantSettings}
                          />
                          <button
                            type="button"
                            class="field-icon-btn"
                            onclick={() => (showOpenrouterKey = !showOpenrouterKey)}
                            title={showOpenrouterKey ? t("common.hide") : t("common.show")}
                          >
                            <Icon name={showOpenrouterKey ? "eye-off" : "eye"} size={14} />
                          </button>
                        </div>
                      </div>

                      <!-- Fetch Models Button -->
                      <div class="field-row">
                        <span class="field-label">{t("settings.assistant_tab.models_catalog_label")}</span>
                        <div class="field-control">
                          <button
                            type="button"
                            class="action-secondary-btn"
                            onclick={fetchOpenrouterModels}
                            disabled={isOpenrouterLoading}
                          >
                            <Icon name="refresh-cw" size={13} class={isOpenrouterLoading ? "spin" : ""} />
                            <span>{isOpenrouterLoading ? t("settings.assistant_tab.loading_list") : t("settings.assistant_tab.fetch_openrouter_models")}</span>
                          </button>
                          {#if openrouterModels.length > 0}
                            <span class="inline-count">{t("settings.assistant_tab.available_models_count", { count: openrouterModels.length })}</span>
                          {/if}
                          {#if openrouterFetchError}
                            <span class="inline-error">{openrouterFetchError}</span>
                          {/if}
                        </div>
                      </div>

                      <!-- Model Selection -->
                      <div class="field-row">
                        <span class="field-label">{t("settings.assistant_tab.model")}</span>
                        <div class="field-control">
                          <CustomSelect
                            options={openrouterModelOptions}
                            bind:value={assistantConfig.openrouter_model}
                            onchange={saveAssistantSettings}
                          />
                        </div>
                      </div>

                      <!-- Custom Model input -->
                      <div class="field-row">
                        <label class="field-label" for="or-custom-model">{t("settings.assistant_tab.or_enter_model_id")}</label>
                        <div class="field-control">
                          <input
                            id="or-custom-model"
                            type="text"
                            class="corthal-input"
                            bind:value={assistantConfig.openrouter_model}
                            onblur={saveAssistantSettings}
                            placeholder="anthropic/claude-3.7-sonnet"
                          />
                        </div>
                      </div>

                      <!-- Reasoning Effort -->
                      <div class="field-row">
                        <span class="field-label">{t("settings.assistant_tab.reasoning_effort_label")}</span>
                        <div class="field-control">
                          <CustomSelect
                            options={REASONING_EFFORT_OPTIONS}
                            bind:value={assistantConfig.openrouter_reasoning_effort}
                            onchange={saveAssistantSettings}
                          />
                        </div>
                      </div>

                      <!-- Temperature -->
                      <div class="field-row">
                        <label class="field-label" for="or-temp">{t("settings.assistant_tab.temp_with_val", { val: assistantConfig.openrouter_temperature })}</label>
                        <div class="field-control range-box">
                          <input
                            id="or-temp"
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            bind:value={assistantConfig.openrouter_temperature}
                            onchange={saveAssistantSettings}
                          />
                          <span class="range-display">{assistantConfig.openrouter_temperature}</span>
                        </div>
                      </div>
                    </div>
                  {/if}
                </div>

                <!-- 3. CUSTOM OPENAI-COMPATIBLE API -->
                <div class="provider-card-accordion" class:selected={assistantConfig.provider === "openai"}>
                  <label class="provider-card-header">
                    <input
                      type="radio"
                      name="settings-provider"
                      value="openai"
                      checked={assistantConfig.provider === "openai"}
                      onchange={() => {
                        assistantConfig.provider = "openai";
                        saveAssistantSettings();
                      }}
                    />
                    <div class="provider-header-main">
                      <div class="provider-title-line">
                        <span class="provider-label">{t("settings.assistant_tab.custom_api_label")}</span>
                        <span class="provider-tag local">{t("settings.assistant_tab.custom_api_tag")}</span>
                      </div>
                      <span class="provider-hint">
                        {t("settings.assistant_tab.custom_api_hint")}
                      </span>
                    </div>
                  </label>

                  {#if assistantConfig.provider === "openai"}
                    <div class="provider-card-body">
                      <!-- Base URL -->
                      <div class="field-row">
                        <label class="field-label" for="custom-url">{t("settings.assistant_tab.base_url_label")}</label>
                        <div class="field-control">
                          <input
                            id="custom-url"
                            type="text"
                            class="corthal-input"
                            bind:value={assistantConfig.openai_base_url}
                            onblur={saveAssistantSettings}
                            placeholder="http://localhost:11434/v1"
                          />
                          <span class="field-tip">{t("settings.assistant_tab.base_url_tip")}</span>
                        </div>
                      </div>

                      <!-- API Key -->
                      <div class="field-row">
                        <label class="field-label" for="custom-key">{t("settings.assistant_tab.optional_api_key_label")}</label>
                        <div class="field-control input-with-btn">
                          <input
                            id="custom-key"
                            type={showOpenaiKey ? "text" : "password"}
                            class="corthal-input"
                            placeholder={t("settings.assistant_tab.optional_api_key_placeholder")}
                            bind:value={assistantConfig.openai_key}
                            onblur={saveAssistantSettings}
                          />
                          <button
                            type="button"
                            class="field-icon-btn"
                            onclick={() => (showOpenaiKey = !showOpenaiKey)}
                            title={showOpenaiKey ? t("common.hide") : t("common.show")}
                          >
                            <Icon name={showOpenaiKey ? "eye-off" : "eye"} size={14} />
                          </button>
                        </div>
                      </div>

                      <!-- Fetch Models Button -->
                      <div class="field-row">
                        <span class="field-label">{t("settings.assistant_tab.endpoint_models_label")}</span>
                        <div class="field-control">
                          <button
                            type="button"
                            class="action-secondary-btn"
                            onclick={fetchOpenaiModels}
                            disabled={isOpenaiLoading}
                          >
                            <Icon name="refresh-cw" size={13} class={isOpenaiLoading ? "spin" : ""} />
                            <span>{isOpenaiLoading ? t("settings.assistant_tab.polling_endpoint") : t("settings.assistant_tab.fetch_endpoint_models")}</span>
                          </button>
                          {#if openaiModels.length > 0}
                            <span class="inline-count">{t("settings.assistant_tab.found_models_count", { count: openaiModels.length })}</span>
                          {/if}
                          {#if openaiFetchError}
                            <span class="inline-error">{openaiFetchError}</span>
                          {/if}
                        </div>
                      </div>

                      <!-- Model Selection -->
                      <div class="field-row">
                        <span class="field-label">{t("settings.assistant_tab.model")}</span>
                        <div class="field-control">
                          {#if openaiModels.length > 0}
                            <CustomSelect
                              options={openaiModelOptions}
                              bind:value={assistantConfig.openai_model}
                              onchange={saveAssistantSettings}
                            />
                          {:else}
                            <input
                              id="custom-model-select"
                              type="text"
                              class="corthal-input"
                              bind:value={assistantConfig.openai_model}
                              onblur={saveAssistantSettings}
                              placeholder="llama3, mistral, qwen2.5..."
                            />
                          {/if}
                        </div>
                      </div>

                      {#if openaiModels.length > 0}
                        <div class="field-row">
                          <label class="field-label" for="custom-model-text">{t("settings.assistant_tab.or_specify_manually")}</label>
                          <div class="field-control">
                            <input
                              id="custom-model-text"
                              type="text"
                              class="corthal-input"
                              bind:value={assistantConfig.openai_model}
                              onblur={saveAssistantSettings}
                              placeholder="llama3"
                            />
                          </div>
                        </div>
                      {/if}

                      <!-- Reasoning Effort -->
                      <div class="field-row">
                        <span class="field-label">{t("settings.assistant_tab.reasoning_effort_label")}</span>
                        <div class="field-control">
                          <CustomSelect
                            options={REASONING_EFFORT_OPTIONS}
                            bind:value={assistantConfig.openai_reasoning_effort}
                            onchange={saveAssistantSettings}
                          />
                        </div>
                      </div>

                      <!-- Temperature -->
                      <div class="field-row">
                        <label class="field-label" for="custom-temp">{t("settings.assistant_tab.temp_with_val", { val: assistantConfig.openai_temperature })}</label>
                        <div class="field-control range-box">
                          <input
                            id="custom-temp"
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            bind:value={assistantConfig.openai_temperature}
                            onchange={saveAssistantSettings}
                          />
                          <span class="range-display">{assistantConfig.openai_temperature}</span>
                        </div>
                      </div>
                    </div>
                  {/if}
                </div>
              </div>
            </section>

            <!-- Context and Prompt -->
            <section class="settings-section">
              <h3 class="section-title">{t("settings.assistant_tab.context_and_prompt_title")}</h3>
              <div class="context-toggles">
                <label class="toggle-checkbox-row">
                  <input
                    type="checkbox"
                    bind:checked={assistantConfig.include_vault_context}
                    onchange={saveAssistantSettings}
                  />
                  <div class="toggle-text">
                    <span class="toggle-title">{t("settings.assistant_tab.vault_context_title")}</span>
                    <span class="toggle-desc">{t("settings.assistant_tab.vault_context_desc")}</span>
                  </div>
                </label>

                <label class="toggle-checkbox-row">
                  <input
                    type="checkbox"
                    bind:checked={assistantConfig.include_active_note}
                    onchange={saveAssistantSettings}
                  />
                  <div class="toggle-text">
                    <span class="toggle-title">{t("settings.assistant_tab.active_note_context_title")}</span>
                    <span class="toggle-desc">{t("settings.assistant_tab.active_note_context_desc")}</span>
                  </div>
                </label>
              </div>

              <div class="system-prompt-box">
                <label class="field-label" for="settings-system-prompt">{t("settings.assistant_tab.system_prompt_label")}</label>
                <textarea
                  id="settings-system-prompt"
                  class="corthal-textarea"
                  rows="4"
                  bind:value={assistantConfig.system_prompt}
                  onblur={saveAssistantSettings}
                ></textarea>
              </div>
            </section>
          {:else if activeTab === "about"}
            <section class="settings-section">
              <h3 class="section-title">{t("settings.about.title")} v0.1.0 (Clean Room)</h3>
              <p class="section-desc">
                {t("settings.about.app_desc")}
              </p>
              <div class="about-card">
                <p>• <strong>{t("settings.about.runtime")}</strong>: Rust (Tauri 2) + Svelte 5 + WebKit2GTK</p>
                <p>• <strong>{t("settings.about.os")}</strong>: Arch Linux, Cinnamon, AmneziaVPN</p>
                <p>• {t("settings.about.developer_notes")}</p>
              </div>
            </section>
          {/if}
        </main>
      </div>

      <!-- Footer -->
      <footer class="modal-footer">
        <button class="close-done-btn" onclick={handleDone}>
          {t("common.done")}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fadeIn 0.15s ease-out;
    -webkit-transform: translate3d(0, 0, 0);
    transform: translate3d(0, 0, 0);
    isolation: isolate;
  }

  .modal-window {
    background: var(--corthal-bg-sidebar, #0e1015);
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.12));
    border-radius: 12px;
    width: 860px;
    max-width: 95vw;
    height: 720px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 45px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    -webkit-transform: translate3d(0, 0, 0);
    transform: translate3d(0, 0, 0);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 22px;
    background: var(--corthal-bg-header, #171a22);
    border-bottom: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.1));
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-left h2 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--corthal-fg-primary, #ffffff);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--corthal-fg-muted, #94a3b8);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .close-btn:hover {
    background: var(--corthal-bg-hover, rgba(255, 255, 255, 0.1));
    color: var(--corthal-fg-primary, #ffffff);
  }

  .modal-body {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  /* SETTINGS NAV */
  .settings-nav {
    background: var(--corthal-bg-sidebar, #0e1015);
    border-right: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.08));
    padding: 16px 10px;
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
    color: var(--corthal-fg-secondary, #9ca3af);
    font-size: 0.88rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
  }

  .nav-item:hover {
    background: var(--corthal-bg-hover, rgba(255, 255, 255, 0.05));
    color: var(--corthal-fg-primary, #ffffff);
  }

  .nav-item.active {
    background: var(--corthal-accent-subtle, rgba(59, 130, 246, 0.15));
    color: var(--corthal-accent, #3b82f6);
    font-weight: 500;
  }

  /* TAB CONTENT */
  .tab-content {
    background: var(--corthal-bg-main, #13161c);
    padding: 22px 28px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .settings-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-title {
    margin: 0;
    font-size: 0.98rem;
    font-weight: 600;
    color: var(--corthal-fg-primary, #ffffff);
  }

  .reset-link {
    background: transparent;
    border: none;
    color: var(--corthal-accent, #3b82f6);
    font-size: 0.8rem;
    cursor: pointer;
    text-decoration: underline;
  }

  .section-desc {
    margin: 0;
    font-size: 0.82rem;
    color: var(--corthal-fg-muted, #94a3b8);
    line-height: 1.4;
  }

  /* PREVIEW CARD */
  .preview-card {
    background: var(--corthal-bg-card, #1b1e27);
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  }

  .preview-header {
    background: var(--corthal-bg-header, #171a22);
    padding: 8px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.08));
  }

  .preview-dots {
    display: flex;
    gap: 6px;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
  .dot.red { background: #ef4444; }
  .dot.yellow { background: #f59e0b; }
  .dot.green { background: #10b981; }

  .preview-title {
    font-size: 0.78rem;
    color: var(--corthal-fg-muted, #94a3b8);
    font-weight: 500;
  }

  .preview-content {
    display: grid;
    grid-template-columns: 140px 1fr;
    min-height: 120px;
  }

  .preview-sidebar {
    background: var(--corthal-bg-sidebar, #0e1015);
    padding: 10px;
    border-right: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.08));
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .preview-bar-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 8px;
    border-radius: 4px;
    font-size: 0.75rem;
    color: var(--corthal-fg-secondary, #9ca3af);
  }

  .preview-bar-item.active {
    background: var(--corthal-accent-subtle, rgba(59, 130, 246, 0.15));
    color: var(--corthal-accent, #3b82f6);
    font-weight: 600;
  }

  .p-icon {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .preview-main {
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: var(--corthal-bg-main, #13161c);
  }

  .preview-doc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .preview-doc-header h4 {
    margin: 0;
    font-size: 0.92rem;
    color: var(--corthal-fg-primary, #ffffff);
  }

  .preview-badge {
    background: var(--corthal-accent-subtle, rgba(59, 130, 246, 0.15));
    color: var(--corthal-accent, #3b82f6);
    border: 1px solid var(--corthal-accent-border, rgba(59, 130, 246, 0.35));
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.68rem;
    font-weight: 600;
  }

  .preview-text {
    margin: 0;
    font-size: 0.8rem;
    color: var(--corthal-fg-secondary, #9ca3af);
    line-height: 1.4;
  }

  .preview-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  .preview-btn {
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 0.74rem;
    cursor: default;
  }

  .preview-btn.primary {
    background: var(--corthal-accent, #3b82f6);
    color: #ffffff;
    border: none;
    font-weight: 500;
  }

  .preview-btn.secondary {
    background: var(--corthal-bg-card, #1b1e27);
    color: var(--corthal-fg-primary, #ffffff);
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.15));
  }

  /* LANGUAGE SELECTOR */
  .lang-selector-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .lang-card {
    background: var(--corthal-bg-card, #1b1e27);
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    cursor: pointer;
    position: relative;
    transition: all 0.15s;
  }

  .lang-card:hover {
    background: var(--corthal-bg-hover, rgba(255, 255, 255, 0.06));
    border-color: var(--corthal-accent, #3b82f6);
  }

  .lang-card.selected {
    border-color: var(--corthal-accent, #3b82f6);
    background: var(--corthal-accent-subtle, rgba(59, 130, 246, 0.1));
  }

  .lang-flag {
    font-size: 24px;
    line-height: 1;
    user-select: none;
  }

  .lang-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .lang-name {
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--corthal-fg-primary, #ffffff);
  }

  .lang-sub {
    font-size: 0.74rem;
    color: var(--corthal-fg-muted, #94a3b8);
  }

  .lang-check {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* PRESETS GRID */
  .presets-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .preset-card {
    background: var(--corthal-bg-card, #1b1e27);
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    cursor: pointer;
    position: relative;
    transition: all 0.15s;
  }

  .preset-card:hover {
    background: var(--corthal-bg-hover, rgba(255, 255, 255, 0.06));
    border-color: var(--corthal-accent, #3b82f6);
  }

  .preset-card.selected {
    border-color: var(--corthal-accent, #3b82f6);
    background: var(--corthal-accent-subtle, rgba(59, 130, 246, 0.1));
  }

  .preset-swatches {
    display: grid;
    grid-template-columns: repeat(2, 12px);
    gap: 3px;
    padding: 4px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
  }

  .swatch {
    width: 12px;
    height: 12px;
    border-radius: 2px;
  }

  .preset-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .preset-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .preset-name {
    font-size: 0.86rem;
    font-weight: 600;
    color: var(--corthal-fg-primary, #ffffff);
  }

  .category-badge {
    background: rgba(255, 255, 255, 0.1);
    color: var(--corthal-fg-muted, #94a3b8);
    font-size: 0.65rem;
    padding: 1px 5px;
    border-radius: 3px;
  }

  .preset-desc {
    font-size: 0.74rem;
    color: var(--corthal-fg-muted, #94a3b8);
  }

  .preset-check {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
  }

  /* ACCENTS */
  .accents-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .accents-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 8px;
    width: 100%;
    box-sizing: border-box;
  }

  .accent-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 9px;
    background: var(--corthal-bg-card, #1b1e27);
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
    min-width: 0;
    box-sizing: border-box;
  }

  .accent-chip:hover {
    background: var(--corthal-bg-hover, rgba(255, 255, 255, 0.06));
    border-color: rgba(255, 255, 255, 0.2);
  }

  .accent-chip.selected {
    border-color: var(--corthal-accent, #3b82f6);
    background: var(--corthal-accent-subtle, rgba(59, 130, 246, 0.12));
  }

  .color-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .accent-label {
    font-size: 0.75rem;
    color: var(--corthal-fg-secondary, #cbd5e1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sys-tag {
    background: rgba(255, 255, 255, 0.12);
    font-size: 0.62rem;
    padding: 1px 3px;
    border-radius: 2px;
  }

  .custom-color-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 4px;
  }

  .custom-color-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    color: var(--corthal-fg-secondary, #94a3b8);
    cursor: pointer;
    position: relative;
  }

  .custom-color-label input[type="color"] {
    position: absolute;
    opacity: 0;
    width: 24px;
    height: 24px;
    cursor: pointer;
  }

  .custom-color-indicator {
    width: 20px;
    height: 20px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  .custom-hex-val {
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.78rem;
    color: var(--corthal-accent, #3b82f6);
    background: var(--corthal-accent-subtle, rgba(59, 130, 246, 0.15));
    padding: 2px 6px;
    border-radius: 4px;
  }

  /* TOGGLE SWITCH */
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--corthal-bg-card, #1b1e27);
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.08));
    padding: 12px 16px;
    border-radius: 8px;
  }

  .toggle-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .toggle-label {
    font-size: 0.88rem;
    font-weight: 500;
    color: var(--corthal-fg-primary, #ffffff);
  }

  .toggle-sub {
    font-size: 0.76rem;
    color: var(--corthal-fg-muted, #94a3b8);
  }

  .toggle-switch {
    width: 44px;
    height: 24px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    border: none;
    position: relative;
    cursor: pointer;
    transition: background 0.2s;
    padding: 2px;
  }

  .toggle-switch.active {
    background: var(--corthal-accent, #3b82f6);
  }

  .toggle-handle {
    display: block;
    width: 20px;
    height: 20px;
    background: #ffffff;
    border-radius: 50%;
    transition: transform 0.2s;
  }

  .toggle-switch.active .toggle-handle {
    transform: translateX(20px);
  }

  /* LINUX GTK */
  .sys-info-banner {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    background: var(--corthal-bg-card, #1b1e27);
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    padding: 12px 16px;
  }

  .sys-info-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
  }

  .sys-label {
    color: var(--corthal-fg-muted, #94a3b8);
  }

  .sys-value {
    color: var(--corthal-fg-primary, #ffffff);
    font-weight: 600;
  }

  .color-badge {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .badge-color {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .gtk-picker-box {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 14px;
    background: var(--corthal-bg-card, #1b1e27);
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    padding: 14px 16px;
  }

  .gtk-picker-label {
    font-size: 0.78rem;
    color: var(--corthal-fg-muted, #94a3b8);
  }

  .gtk-picker-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
  }

  .gtk-select-wrapper {
    flex: 1;
    min-width: 0;
  }

  .custom-path-input {
    flex: 1;
    background: var(--corthal-bg-input, #212530);
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.12));
    border-radius: 6px;
    color: var(--corthal-fg-primary, #ffffff);
    padding: 7px 10px;
    font-size: 0.82rem;
    outline: none;
    font-family: ui-monospace, SFMono-Regular, monospace;
  }

  .apply-gtk-btn {
    background: var(--corthal-accent, #3b82f6);
    border: none;
    color: #ffffff;
    font-size: 0.78rem;
    font-weight: 500;
    padding: 0 14px;
    height: 34px;
    border-radius: 6px;
    cursor: pointer;
    transition: opacity 0.15s;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .apply-gtk-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .custom-gtk-import {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 10px;
    border-top: 1px solid var(--corthal-border-subtle, rgba(255, 255, 255, 0.05));
  }

  /* SECURITY & ABOUT CARDS */
  .security-card, .about-card {
    background: var(--corthal-bg-card, #1b1e27);
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
    box-sizing: border-box;
  }

  .sec-grid-info, .sec-grid-status {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }

  .sec-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }

  .sec-label {
    font-size: 0.78rem;
    color: var(--corthal-fg-muted, #94a3b8);
  }

  .sec-code {
    background: rgba(0, 0, 0, 0.3);
    padding: 4px 8px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.82rem;
    color: var(--corthal-accent, #3b82f6);
    width: fit-content;
  }

  .vault-sec-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.04);
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.08));
    font-size: 0.82rem;
    overflow: hidden;
  }

  .vault-sec-name {
    font-weight: 600;
    color: var(--corthal-fg-primary, #ffffff);
    white-space: nowrap;
  }

  .vault-sec-path {
    font-family: ui-monospace, SFMono-Regular, monospace;
    color: var(--corthal-fg-muted, #94a3b8);
    font-size: 0.78rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .current-key-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .key-badge {
    background: rgba(59, 130, 246, 0.15);
    color: var(--corthal-accent, #38bdf8);
    font-size: 0.68rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .key-comment-tag {
    font-size: 0.76rem;
    color: var(--corthal-fg-muted, #94a3b8);
    font-family: ui-monospace, SFMono-Regular, monospace;
  }

  .ssh-selector-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-width: 0;
  }

  .ssh-select-wrapper {
    flex: 1;
    min-width: 0;
  }

  .apply-key-btn {
    flex-shrink: 0;
    background: var(--corthal-accent, #3b82f6);
    border: none;
    color: #ffffff;
    font-size: 0.8rem;
    font-weight: 500;
    padding: 0 16px;
    height: 34px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .apply-key-btn:hover:not(:disabled) {
    background: var(--corthal-accent-hover, #2563eb);
  }

  .apply-key-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .sec-note {
    font-size: 0.72rem;
    color: var(--corthal-fg-muted, #64748b);
  }

  .sec-badge.ok {
    color: #10b981;
    font-size: 0.82rem;
    font-weight: 500;
  }

  .sec-badge.locked {
    color: #f87171;
    font-size: 0.82rem;
    font-weight: 500;
  }

  .policy-option-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    outline: none;
  }

  .policy-option-row:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: var(--corthal-border-hover, rgba(255, 255, 255, 0.18));
  }

  .policy-option-row.selected {
    border-color: var(--corthal-accent, #38bdf8);
    background: rgba(56, 189, 248, 0.06);
  }

  .policy-radio-label {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    cursor: pointer;
    width: 100%;
  }

  .custom-radio-circle {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid var(--corthal-border-hover, rgba(255, 255, 255, 0.3));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
    transition: all 0.15s ease;
  }

  .custom-radio-circle.checked {
    border-color: var(--corthal-accent, #38bdf8);
    background: transparent;
  }

  .radio-inner-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--corthal-accent, #38bdf8);
  }

  .policy-option-info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }

  .policy-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--corthal-fg-primary, #ffffff);
  }

  .policy-option-row.selected .policy-title {
    color: var(--corthal-accent, #38bdf8);
  }

  .policy-desc {
    font-size: 0.77rem;
    color: var(--corthal-fg-muted, #94a3b8);
    line-height: 1.35;
  }

  .timeout-config-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: 30px;
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px dashed var(--corthal-border-subtle, rgba(255, 255, 255, 0.08));
  }

  .timeout-label {
    font-size: 0.78rem;
    color: var(--corthal-fg-secondary, #cbd5e1);
    white-space: nowrap;
  }

  .timeout-select-wrap {
    width: 200px;
    min-width: 160px;
  }

  .session-status-row {
    padding-top: 8px;
    border-top: 1px solid var(--corthal-border-subtle, rgba(255, 255, 255, 0.08));
  }

  .session-status-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
  }

  .action-lock-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 0.76rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-lock-btn:hover {
    background: rgba(239, 68, 68, 0.22);
    color: #ffffff;
  }

  .about-card p {
    margin: 0;
    font-size: 0.84rem;
    color: var(--corthal-fg-secondary, #9ca3af);
    line-height: 1.5;
  }

  /* AI ASSISTANT ACCORDION & FIELDS */
  .provider-accordion-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .provider-card-accordion {
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: var(--corthal-bg-card, #131720);
    overflow: hidden;
    transition: border-color 0.15s, background-color 0.15s;
  }

  .provider-card-accordion.selected {
    border-color: var(--corthal-accent, #3b82f6);
    background: rgba(59, 130, 246, 0.04);
  }

  .provider-card-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    cursor: pointer;
    user-select: none;
  }

  .provider-card-header input[type="radio"] {
    accent-color: var(--corthal-accent, #3b82f6);
    width: 16px;
    height: 16px;
    cursor: pointer;
    margin: 0;
    flex-shrink: 0;
  }

  .provider-header-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .provider-title-line {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .provider-label {
    font-size: 0.92rem;
    font-weight: 600;
    color: var(--corthal-fg-primary, #ffffff);
  }

  .provider-tag {
    font-size: 0.68rem;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 4px;
    letter-spacing: 0.2px;
  }

  .provider-tag.codex {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }

  .provider-tag.openrouter {
    background: rgba(139, 92, 246, 0.15);
    color: #a78bfa;
    border: 1px solid rgba(139, 92, 246, 0.3);
  }

  .provider-tag.local {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }

  .provider-hint {
    font-size: 0.76rem;
    color: var(--corthal-fg-muted, #94a3b8);
  }

  .provider-header-status {
    flex-shrink: 0;
  }

  .status-chip {
    font-size: 0.72rem;
    padding: 3px 8px;
    border-radius: 4px;
    font-weight: 500;
  }

  .status-chip.success {
    background: rgba(16, 185, 129, 0.12);
    color: #34d399;
    border: 1px solid rgba(16, 185, 129, 0.25);
  }

  .status-chip.warning {
    background: rgba(245, 158, 11, 0.12);
    color: #fbbf24;
    border: 1px solid rgba(245, 158, 11, 0.25);
  }

  .status-chip.error {
    background: rgba(239, 68, 68, 0.12);
    color: #f87171;
    border: 1px solid rgba(239, 68, 68, 0.25);
  }

  .provider-card-body {
    padding: 16px;
    border-top: 1px solid var(--corthal-border-subtle, rgba(255, 255, 255, 0.08));
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    gap: 14px;
    animation: fadeIn 0.15s ease-out;
  }

  .field-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--corthal-fg-primary, #cbd5e1);
  }

  .field-control {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-tip {
    font-size: 0.72rem;
    color: var(--corthal-fg-muted, #64748b);
  }

  .corthal-input,
  .corthal-textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--corthal-bg-main, #0b0f17);
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.14));
    border-radius: 6px;
    padding: 7px 12px;
    color: var(--corthal-fg-primary, #f1f5f9);
    font-size: 0.84rem;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    font-family: inherit;
  }

  .corthal-input:focus,
  .corthal-textarea:focus {
    border-color: var(--corthal-accent, #3b82f6);
    box-shadow: 0 0 0 2px var(--corthal-accent-subtle, rgba(59, 130, 246, 0.2));
  }

  .corthal-textarea {
    resize: vertical;
    line-height: 1.45;
  }

  .input-with-btn {
    position: relative;
    display: flex;
    align-items: center;
  }

  .input-with-btn .corthal-input {
    padding-right: 36px;
  }

  .field-icon-btn {
    position: absolute;
    right: 8px;
    background: transparent;
    border: none;
    color: var(--corthal-fg-muted, #94a3b8);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .field-icon-btn:hover {
    color: var(--corthal-fg-primary, #ffffff);
    background: rgba(255, 255, 255, 0.08);
  }

  .action-secondary-btn {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--corthal-bg-card, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.14));
    color: var(--corthal-fg-primary, #cbd5e1);
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.78rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-secondary-btn:hover:not(:disabled) {
    background: var(--corthal-bg-hover, rgba(255, 255, 255, 0.12));
    border-color: var(--corthal-accent, #3b82f6);
    color: #ffffff;
  }

  .action-secondary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .inline-count {
    font-size: 0.74rem;
    color: #34d399;
    font-weight: 500;
  }

  .inline-error {
    font-size: 0.74rem;
    color: #f87171;
  }

  .range-box {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .range-box input[type="range"] {
    flex: 1;
    accent-color: var(--corthal-accent, #3b82f6);
  }

  .range-display {
    font-family: ui-monospace, monospace;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--corthal-accent, #38bdf8);
    min-width: 32px;
    text-align: right;
  }

  .context-toggles {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
  }

  .toggle-checkbox-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 14px;
    background: var(--corthal-bg-card, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--corthal-border-subtle, rgba(255, 255, 255, 0.06));
    border-radius: 8px;
    cursor: pointer;
  }

  .toggle-checkbox-row input[type="checkbox"] {
    margin-top: 3px;
    accent-color: var(--corthal-accent, #3b82f6);
    width: 15px;
    height: 15px;
    cursor: pointer;
  }

  .toggle-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toggle-title {
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--corthal-fg-primary, #ffffff);
  }

  .toggle-desc {
    font-size: 0.74rem;
    color: var(--corthal-fg-muted, #94a3b8);
  }

  .system-prompt-box {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* FOOTER */
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 12px 22px;
    background: var(--corthal-bg-header, #171a22);
    border-top: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.1));
  }

  .close-done-btn {
    background: var(--corthal-accent, #3b82f6);
    color: #ffffff;
    border: none;
    font-size: 0.84rem;
    font-weight: 600;
    padding: 7px 22px;
    border-radius: 6px;
    cursor: pointer;
    transition: opacity 0.15s, filter 0.15s;
  }

  .close-done-btn:hover {
    filter: brightness(1.1);
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
