<script lang="ts">
  import Icon from "./Icon.svelte";
  import { themeStore } from "$lib/theme/store.svelte";
  import { THEME_PRESETS, ACCENT_COLORS } from "$lib/theme/presets";
  import type { VaultInfo, SshKeyInfo } from "$lib/types";

  interface Props {
    isOpen: boolean;
    initialTab?: "appearance" | "security" | "about";
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

  let activeTab = $state<"appearance" | "security" | "about">("appearance");
  let customGtkInput = $state("");
  let selectedGtkPath = $state("");
  let selectedKeyPath = $state("");

  $effect(() => {
    if (isOpen) {
      if (initialTab) activeTab = initialTab;
      if (activeSshKey) selectedKeyPath = activeSshKey.path;
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && isOpen) {
      onClose();
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
          <Icon name="settings" size={20} color="var(--cortex-accent)" />
          <h2 id="settings-title">Параметры и оформление</h2>
        </div>
        <button class="close-btn" onclick={onClose} aria-label="Закрыть">
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
            <span>Внешний вид</span>
          </button>
          <button
            class="nav-item"
            class:active={activeTab === "security"}
            onclick={() => (activeTab = "security")}
          >
            <Icon name="shield" size={16} />
            <span>Шифрование</span>
          </button>
          <button
            class="nav-item"
            class:active={activeTab === "about"}
            onclick={() => (activeTab = "about")}
          >
            <Icon name="lightbulb" size={16} />
            <span>О приложении</span>
          </button>
        </nav>

        <!-- Tab Content -->
        <main class="tab-content">
          {#if activeTab === "appearance"}
            <!-- 1. LIVE PREVIEW CARD -->
            <section class="settings-section">
              <h3 class="section-title">Предпросмотр темы</h3>
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
                      <span>Заметки</span>
                    </div>
                    <div class="preview-bar-item">
                      <span class="p-icon"></span>
                      <span>Проекты</span>
                    </div>
                  </div>
                  <div class="preview-main">
                    <div class="preview-doc-header">
                      <h4>Архитектура второго мозга</h4>
                      <span class="preview-badge">Активно</span>
                    </div>
                    <p class="preview-text">
                      Локальная база знаний Cortex поддерживает динамические CSS токены, чистые цветовые палитры и нативную интеграцию с Linux GTK.
                    </p>
                    <div class="preview-actions">
                      <button class="preview-btn primary">Действие</button>
                      <button class="preview-btn secondary">Справка</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- 2. THEME PRESETS -->
            <section class="settings-section">
              <div class="section-header-row">
                <h3 class="section-title">Цветовая палитра</h3>
                {#if themeStore.config.gtkThemePath}
                  <button class="reset-link" onclick={() => themeStore.clearGtkTheme()}>
                    Вернуться к пресетам Cortex
                  </button>
                {/if}
              </div>
              <p class="section-desc">
                Выберите один из 10 специально настроенных контрастных стилей или минималистичный светлый режим.
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
                          <span class="category-badge">Светлая</span>
                        {/if}
                      </div>
                      <span class="preset-desc">{preset.description}</span>
                    </div>
                    {#if themeStore.config.presetId === preset.id && !themeStore.config.gtkThemePath}
                      <div class="preset-check">
                        <Icon name="check" size={14} color="var(--cortex-accent)" />
                      </div>
                    {/if}
                  </button>
                {/each}
              </div>
            </section>

            <!-- 3. ACCENT COLORS -->
            <section class="settings-section">
              <h3 class="section-title">Акцентный цвет</h3>
              <p class="section-desc">
                Используется для выделения кнопок, активных вкладок, индикаторов фокуса и бейджей.
              </p>

              <div class="accents-container">
                <div class="accents-grid">
                  {#each ACCENT_COLORS as accent}
                    <button
                      class="accent-chip"
                      class:selected={themeStore.config.accentId === accent.id && !themeStore.config.customAccentHex}
                      onclick={() => handleAccentSelect(accent.id)}
                      title="{accent.name} ({accent.hex})"
                    >
                      <span class="color-dot" style="background: {accent.hex};">
                        {#if themeStore.config.accentId === accent.id && !themeStore.config.customAccentHex}
                          <Icon name="check" size={12} color="#ffffff" />
                        {/if}
                      </span>
                      <span class="accent-label">
                        {accent.name}
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
                    <span>Свой HEX-код...</span>
                  </label>
                  {#if themeStore.config.customAccentHex}
                    <span class="custom-hex-val">{themeStore.config.customAccentHex}</span>
                  {/if}
                </div>
              </div>
            </section>

            <!-- 4. CONTRAST & ACCESSIBILITY -->
            <section class="settings-section">
              <h3 class="section-title">Контрастность и спецвозможности</h3>
              <div class="toggle-row">
                <div class="toggle-text">
                  <span class="toggle-label">Режим высокого контраста</span>
                  <span class="toggle-sub">
                    Усиливает границы блоков и делает текст максимально контрастным для чтения
                  </span>
                </div>
                <button
                  class="toggle-switch"
                  class:active={themeStore.config.highContrast}
                  onclick={() => themeStore.toggleHighContrast()}
                  role="switch"
                  aria-checked={themeStore.config.highContrast}
                  aria-label="Включить высокий контраст"
                >
                  <span class="toggle-handle"></span>
                </button>
              </div>
            </section>

            <!-- 5. LINUX GTK INTEGRATION -->
            <section class="settings-section">
              <h3 class="section-title">Системное окружение Linux и GTK</h3>
              <p class="section-desc">
                Cortex умеет считывать настройки вашей рабочей среды и адаптироваться под установленные темы Cinnamon / GNOME.
              </p>

              {#if themeStore.systemInfo}
                <div class="sys-info-banner">
                  <div class="sys-info-item">
                    <span class="sys-label">Текущая тема GTK:</span>
                    <span class="sys-value">{themeStore.systemInfo.gtk_theme_name}</span>
                  </div>
                  <div class="sys-info-item">
                    <span class="sys-label">Режим системы:</span>
                    <span class="sys-value">
                      {themeStore.systemInfo.is_dark ? "Тёмный (Dark)" : "Светлый (Light)"}
                    </span>
                  </div>
                  {#if themeStore.systemInfo.system_accent}
                    <div class="sys-info-item">
                      <span class="sys-label">Системный акцент:</span>
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
                  <span class="toggle-label">Следовать системному режиму</span>
                  <span class="toggle-sub">
                    Автоматически переключаться между темным и светлым оформлением вслед за системой
                  </span>
                </div>
                <button
                  class="toggle-switch"
                  class:active={themeStore.config.useSystemTheme}
                  onclick={() => themeStore.setUseSystemTheme(!themeStore.config.useSystemTheme)}
                  role="switch"
                  aria-checked={themeStore.config.useSystemTheme}
                  aria-label="Следовать системному режиму"
                >
                  <span class="toggle-handle"></span>
                </button>
              </div>

              <!-- GTK Theme list -->
              <div class="gtk-picker-box">
                <span class="gtk-picker-label">Установленные темы GTK в системе:</span>
                <div class="gtk-picker-controls">
                  <select bind:value={selectedGtkPath} class="gtk-select">
                    <option value="">-- Выберите GTK тему --</option>
                    {#each themeStore.installedGtkThemes as gtk}
                      <option value={gtk.path}>
                        {gtk.name} ({gtk.is_dark ? "Dark" : "Light"})
                      </option>
                    {/each}
                  </select>
                  <button
                    class="apply-gtk-btn"
                    disabled={!selectedGtkPath || themeStore.isLoadingGtk}
                    onclick={handleApplyInstalledGtk}
                  >
                    {#if themeStore.isLoadingGtk}
                      Загрузка...
                    {:else}
                      Применить GTK
                    {/if}
                  </button>
                </div>

                <!-- Custom folder import -->
                <div class="custom-gtk-import">
                  <span class="gtk-picker-label">Или укажите путь к любой папке с темой (например, ~/.themes/MyTheme):</span>
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
                      Импортировать
                    </button>
                  </div>
                </div>
              </div>
            </section>
          {:else if activeTab === "security"}
            <section class="settings-section">
              <h3 class="section-title">Асимметричное шифрование SSH / AGE</h3>
              <p class="section-desc">
                Cortex защищает конфиденциальные заметки с помощью локального шифрования по алгоритму X25519 (AGE). Привязка ключа сохраняется в <code>.meta.json</code> активной базы знаний.
              </p>

              <div class="security-card">
                <div class="sec-item">
                  <span class="sec-label">Текущая база знаний:</span>
                  <div class="vault-sec-badge">
                    <span class="vault-sec-name">📁 {activeVault?.name || "knowledge"}</span>
                    <span class="vault-sec-path">({activeVault?.display_path || "~/knowledge"})</span>
                  </div>
                </div>

                <div class="sec-item">
                  <span class="sec-label">Активный SSH-ключ для этой базы:</span>
                  <div class="current-key-row">
                    <span class="key-badge">{activeSshKey?.key_type || "ED25519"}</span>
                    <code class="sec-code">{activeSshKey?.filename || "id_ed25519.pub"}</code>
                    {#if activeSshKey?.comment}
                      <span class="key-comment-tag">{activeSshKey.comment}</span>
                    {/if}
                  </div>
                </div>

                <div class="sec-item">
                  <span class="sec-label">Сменить SSH-ключ для текущей базы:</span>
                  <div class="ssh-selector-row">
                    <select bind:value={selectedKeyPath} class="ssh-select">
                      {#each sshKeys as key}
                        <option value={key.path}>
                          {key.filename} ({key.key_type}) {key.comment ? `— ${key.comment}` : ""}
                        </option>
                      {/each}
                    </select>
                    <button
                      class="apply-key-btn"
                      disabled={!selectedKeyPath || selectedKeyPath === activeSshKey?.path}
                      onclick={() => {
                        const targetKey = sshKeys.find(k => k.path === selectedKeyPath);
                        if (targetKey) onRequestChangeSshKey?.(targetKey);
                      }}
                    >
                      Применить
                    </button>
                  </div>
                  <span class="sec-note">При смене ключа будет запрошено подтверждение, а файл .meta.json обновится.</span>
                </div>

                <div class="sec-item">
                  <span class="sec-label">Формат токенов шифрования:</span>
                  <code class="sec-code">🔒[enc:v1:AGE-ENCRYPTED-DATA]</code>
                </div>

                <div class="sec-item">
                  <span class="sec-label">Статус хранилища:</span>
                  <span class="sec-badge ok">✓ Защищено локальным ключом пользователя</span>
                </div>
              </div>
            </section>
          {:else if activeTab === "about"}
            <section class="settings-section">
              <h3 class="section-title">Cortex v0.1.0 (Clean Room)</h3>
              <p class="section-desc">
                Агентная персональная операционная среда для ведения заметок, управления знаниями («Второй мозг») и совместной работы с локальными ИИ-агентами.
              </p>
              <div class="about-card">
                <p>• <strong>Стек</strong>: Rust (Tauri 2) + Svelte 5 + WebKit2GTK</p>
                <p>• <strong>Стилизация</strong>: Чистая независимая архитектура (Clean Room Design)</p>
                <p>• <strong>Интеграция</strong>: Поддержка тем Arch Linux GTK 3/4 и безопасный VNC-песочница</p>
              </div>
            </section>
          {/if}
        </main>
      </div>

      <!-- Footer -->
      <footer class="modal-footer">
        <div class="footer-status">
          <span>Тема: <strong>{themeStore.currentPreset.name}</strong></span>
          <span class="dot-separator">•</span>
          <span>Акцент: <strong>{themeStore.currentAccent.name}</strong></span>
        </div>
        <button class="close-done-btn" onclick={onClose}>
          Готово
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
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fadeIn 0.15s ease-out;
  }

  .modal-window {
    background: var(--cortex-bg-sidebar, #0e1015);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.12));
    border-radius: 12px;
    width: 860px;
    max-width: 95vw;
    height: 720px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 45px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 22px;
    background: var(--cortex-bg-header, #171a22);
    border-bottom: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.1));
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
    color: var(--cortex-fg-primary, #ffffff);
  }

  .close-btn {
    background: transparent;
    border: none;
    color: var(--cortex-fg-muted, #94a3b8);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .close-btn:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.1));
    color: var(--cortex-fg-primary, #ffffff);
  }

  .modal-body {
    display: grid;
    grid-template-columns: 200px 1fr;
    flex: 1;
    overflow: hidden;
  }

  /* SETTINGS NAV */
  .settings-nav {
    background: var(--cortex-bg-sidebar, #0e1015);
    border-right: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
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
    color: var(--cortex-fg-secondary, #9ca3af);
    font-size: 0.88rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
  }

  .nav-item:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.05));
    color: var(--cortex-fg-primary, #ffffff);
  }

  .nav-item.active {
    background: var(--cortex-accent-subtle, rgba(59, 130, 246, 0.15));
    color: var(--cortex-accent, #3b82f6);
    font-weight: 500;
  }

  /* TAB CONTENT */
  .tab-content {
    background: var(--cortex-bg-main, #13161c);
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
    color: var(--cortex-fg-primary, #ffffff);
  }

  .reset-link {
    background: transparent;
    border: none;
    color: var(--cortex-accent, #3b82f6);
    font-size: 0.8rem;
    cursor: pointer;
    text-decoration: underline;
  }

  .section-desc {
    margin: 0;
    font-size: 0.82rem;
    color: var(--cortex-fg-muted, #94a3b8);
    line-height: 1.4;
  }

  /* PREVIEW CARD */
  .preview-card {
    background: var(--cortex-bg-card, #1b1e27);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  }

  .preview-header {
    background: var(--cortex-bg-header, #171a22);
    padding: 8px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
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
    color: var(--cortex-fg-muted, #94a3b8);
    font-weight: 500;
  }

  .preview-content {
    display: grid;
    grid-template-columns: 140px 1fr;
    min-height: 120px;
  }

  .preview-sidebar {
    background: var(--cortex-bg-sidebar, #0e1015);
    padding: 10px;
    border-right: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
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
    color: var(--cortex-fg-secondary, #9ca3af);
  }

  .preview-bar-item.active {
    background: var(--cortex-accent-subtle, rgba(59, 130, 246, 0.15));
    color: var(--cortex-accent, #3b82f6);
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
    background: var(--cortex-bg-main, #13161c);
  }

  .preview-doc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .preview-doc-header h4 {
    margin: 0;
    font-size: 0.92rem;
    color: var(--cortex-fg-primary, #ffffff);
  }

  .preview-badge {
    background: var(--cortex-accent-subtle, rgba(59, 130, 246, 0.15));
    color: var(--cortex-accent, #3b82f6);
    border: 1px solid var(--cortex-accent-border, rgba(59, 130, 246, 0.35));
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 0.68rem;
    font-weight: 600;
  }

  .preview-text {
    margin: 0;
    font-size: 0.8rem;
    color: var(--cortex-fg-secondary, #9ca3af);
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
    background: var(--cortex-accent, #3b82f6);
    color: #ffffff;
    border: none;
    font-weight: 500;
  }

  .preview-btn.secondary {
    background: var(--cortex-bg-card, #1b1e27);
    color: var(--cortex-fg-primary, #ffffff);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.15));
  }

  /* PRESETS GRID */
  .presets-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .preset-card {
    background: var(--cortex-bg-card, #1b1e27);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.1));
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
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.06));
    border-color: var(--cortex-accent, #3b82f6);
  }

  .preset-card.selected {
    border-color: var(--cortex-accent, #3b82f6);
    background: var(--cortex-accent-subtle, rgba(59, 130, 246, 0.1));
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
    color: var(--cortex-fg-primary, #ffffff);
  }

  .category-badge {
    background: rgba(255, 255, 255, 0.1);
    color: var(--cortex-fg-muted, #94a3b8);
    font-size: 0.65rem;
    padding: 1px 5px;
    border-radius: 3px;
  }

  .preset-desc {
    font-size: 0.74rem;
    color: var(--cortex-fg-muted, #94a3b8);
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
    background: var(--cortex-bg-card, #1b1e27);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
    min-width: 0;
    box-sizing: border-box;
  }

  .accent-chip:hover {
    background: var(--cortex-bg-hover, rgba(255, 255, 255, 0.06));
    border-color: rgba(255, 255, 255, 0.2);
  }

  .accent-chip.selected {
    border-color: var(--cortex-accent, #3b82f6);
    background: var(--cortex-accent-subtle, rgba(59, 130, 246, 0.12));
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
    color: var(--cortex-fg-secondary, #cbd5e1);
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
    color: var(--cortex-fg-secondary, #94a3b8);
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
    color: var(--cortex-accent, #3b82f6);
    background: var(--cortex-accent-subtle, rgba(59, 130, 246, 0.15));
    padding: 2px 6px;
    border-radius: 4px;
  }

  /* TOGGLE SWITCH */
  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--cortex-bg-card, #1b1e27);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
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
    color: var(--cortex-fg-primary, #ffffff);
  }

  .toggle-sub {
    font-size: 0.76rem;
    color: var(--cortex-fg-muted, #94a3b8);
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
    background: var(--cortex-accent, #3b82f6);
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
    background: var(--cortex-bg-card, #1b1e27);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
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
    color: var(--cortex-fg-muted, #94a3b8);
  }

  .sys-value {
    color: var(--cortex-fg-primary, #ffffff);
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
    background: var(--cortex-bg-card, #1b1e27);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    padding: 14px 16px;
  }

  .gtk-picker-label {
    font-size: 0.78rem;
    color: var(--cortex-fg-muted, #94a3b8);
  }

  .gtk-picker-controls {
    display: flex;
    gap: 8px;
  }

  .gtk-select {
    flex: 1;
    background: var(--cortex-bg-input, #212530);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.12));
    border-radius: 6px;
    color: var(--cortex-fg-primary, #ffffff);
    padding: 7px 10px;
    font-size: 0.82rem;
    outline: none;
  }

  .custom-path-input {
    flex: 1;
    background: var(--cortex-bg-input, #212530);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.12));
    border-radius: 6px;
    color: var(--cortex-fg-primary, #ffffff);
    padding: 7px 10px;
    font-size: 0.82rem;
    outline: none;
    font-family: ui-monospace, SFMono-Regular, monospace;
  }

  .apply-gtk-btn {
    background: var(--cortex-accent, #3b82f6);
    border: none;
    color: #ffffff;
    font-size: 0.78rem;
    font-weight: 500;
    padding: 0 14px;
    border-radius: 6px;
    cursor: pointer;
    transition: opacity 0.15s;
    white-space: nowrap;
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
    border-top: 1px solid var(--cortex-border-subtle, rgba(255, 255, 255, 0.05));
  }

  /* SECURITY & ABOUT CARDS */
  .security-card, .about-card {
    background: var(--cortex-bg-card, #1b1e27);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .sec-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sec-label {
    font-size: 0.78rem;
    color: var(--cortex-fg-muted, #94a3b8);
  }

  .sec-code {
    background: rgba(0, 0, 0, 0.3);
    padding: 4px 8px;
    border-radius: 4px;
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 0.82rem;
    color: var(--cortex-accent, #3b82f6);
    width: fit-content;
  }

  .vault-sec-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255, 255, 255, 0.04);
    padding: 6px 10px;
    border-radius: 6px;
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.08));
    font-size: 0.82rem;
  }

  .vault-sec-name {
    font-weight: 600;
    color: var(--cortex-fg-primary, #ffffff);
  }

  .vault-sec-path {
    font-family: ui-monospace, SFMono-Regular, monospace;
    color: var(--cortex-fg-muted, #94a3b8);
    font-size: 0.78rem;
  }

  .current-key-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .key-badge {
    background: rgba(59, 130, 246, 0.15);
    color: var(--cortex-accent, #38bdf8);
    font-size: 0.68rem;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .key-comment-tag {
    font-size: 0.76rem;
    color: var(--cortex-fg-muted, #94a3b8);
    font-family: ui-monospace, SFMono-Regular, monospace;
  }

  .ssh-selector-row {
    display: flex;
    gap: 8px;
  }

  .ssh-select {
    flex: 1;
    background: var(--cortex-bg-main, #13161c);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.12));
    border-radius: 6px;
    color: var(--cortex-fg-primary, #ffffff);
    padding: 7px 10px;
    font-size: 0.8rem;
    outline: none;
  }

  .apply-key-btn {
    background: var(--cortex-accent, #3b82f6);
    border: none;
    color: #ffffff;
    font-size: 0.78rem;
    font-weight: 500;
    padding: 0 14px;
    border-radius: 6px;
    cursor: pointer;
    transition: opacity 0.15s;
    white-space: nowrap;
  }

  .apply-key-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .sec-note {
    font-size: 0.72rem;
    color: var(--cortex-fg-muted, #64748b);
  }

  .sec-badge.ok {
    color: #10b981;
    font-size: 0.82rem;
    font-weight: 500;
  }

  .about-card p {
    margin: 0;
    font-size: 0.84rem;
    color: var(--cortex-fg-secondary, #9ca3af);
    line-height: 1.5;
  }

  /* FOOTER */
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 22px;
    background: var(--cortex-bg-header, #171a22);
    border-top: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.1));
  }

  .footer-status {
    font-size: 0.8rem;
    color: var(--cortex-fg-muted, #94a3b8);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .footer-status strong {
    color: var(--cortex-fg-primary, #ffffff);
  }

  .dot-separator {
    opacity: 0.4;
  }

  .close-done-btn {
    background: var(--cortex-accent, #3b82f6);
    color: #ffffff;
    border: none;
    font-size: 0.84rem;
    font-weight: 600;
    padding: 7px 18px;
    border-radius: 6px;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .close-done-btn:hover {
    opacity: 0.9;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
