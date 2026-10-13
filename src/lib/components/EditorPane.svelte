<script lang="ts">
  import { mount, unmount } from "svelte";
  import { Marked } from "marked";
  import hljs from "highlight.js";
  import "highlight.js/styles/github-dark.css";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { parseFrontmatter } from "$lib/frontmatter";
  import { invoke } from "@tauri-apps/api/core";
  import Icon from "./Icon.svelte";
  import SecretPill from "./SecretPill.svelte";
  import PropertiesBlock from "./PropertiesBlock.svelte";
  import LiveMarkdownEditor from "./LiveMarkdownEditor.svelte";
  import { t } from "$lib/i18n";

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
    onDocumentAreaClick?: () => void;
    onSelectTab: (path: string) => void;
    onCloseTab: (path: string) => void;
    onToggleEditing: (isEditing: boolean) => void;
    onSaveNote: () => void;
    onSplitToggle: () => void;
    onCloseSplit?: () => void;
    onOpenSecretModal: () => void;
    onContentChange: (newContent: string) => void;
    onCursorChange?: (line: number, col: number) => void;
    onTagClick?: (tag: string) => void;
    onOpenCreateNote?: () => void;
    onOpenSearch?: () => void;
    onToggleSidebar?: () => void;
    onToggleAssistant?: () => void;
    onOpenSettings?: () => void;
    onOpenNote?: (path: string) => void;
    onPassphraseNeeded?: () => Promise<string | null>;
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
    onDocumentAreaClick,
    onSelectTab,
    onCloseTab,
    onToggleEditing,
    onSaveNote,
    onSplitToggle,
    onCloseSplit,
    onOpenSecretModal,
    onContentChange,
    onCursorChange,
    onTagClick,
    onOpenCreateNote,
    onOpenSearch,
    onToggleSidebar,
    onToggleAssistant,
    onOpenSettings,
    onOpenNote,
    onPassphraseNeeded,
  }: Props = $props();

  // Custom Marked renderer with syntax highlighting via highlight.js
  const customMarked = new Marked({
    renderer: {
      code({ text, lang }: { text: string; lang?: string }) {
        const validLang = lang && hljs.getLanguage(lang) ? lang : undefined;
        const res = validLang
          ? hljs.highlight(text, { language: validLang, ignoreIllegals: true }).value
          : hljs.highlightAuto(text).value;
        return `<pre><code class="hljs ${validLang || ''}">${res}</code></pre>`;
      }
    }
  });

  function getFileLanguage(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase();
    const filename = path.split("/").pop()?.toLowerCase() || "";

    if (filename === "dockerfile") return "dockerfile";
    if (filename.endsWith(".service")) return "ini";

    switch (ext) {
      case "rs": return "rust";
      case "js":
      case "mjs":
      case "cjs":
      case "jsx": return "javascript";
      case "ts":
      case "mts":
      case "cts":
      case "tsx": return "typescript";
      case "py": return "python";
      case "sh":
      case "bash":
      case "zsh": return "bash";
      case "json": return "json";
      case "yaml":
      case "yml": return "yaml";
      case "toml": return "toml";
      case "css":
      case "scss":
      case "sass":
      case "less": return "css";
      case "html":
      case "xml":
      case "svg": return "xml";
      case "c":
      case "h": return "c";
      case "cpp":
      case "hpp":
      case "cc": return "cpp";
      case "cs": return "csharp";
      case "go": return "go";
      case "sql": return "sql";
      case "lua": return "lua";
      case "ini":
      case "conf": return "ini";
      case "md":
      case "markdown": return "markdown";
      default: return "plaintext";
    }
  }

  function getFileIcon(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "md":
      case "markdown":
        return "file-text";
      case "rs":
      case "js":
      case "mjs":
      case "cjs":
      case "ts":
      case "py":
      case "sh":
      case "bash":
      case "json":
      case "yaml":
      case "yml":
      case "toml":
      case "css":
      case "html":
      case "c":
      case "cpp":
      case "cs":
      case "go":
      case "sql":
      case "lua":
        return "file-code";
      default:
        return "file-text";
    }
  }

  let isMarkdown = $derived(
    activePath ? activePath.endsWith(".md") || activePath.endsWith(".markdown") : true
  );

  let detectedLang = $derived(
    activePath ? getFileLanguage(activePath) : "plaintext"
  );

  let lineNumbers = $derived.by<number[]>(() => {
    const count = content ? content.split("\n").length : 1;
    const arr = new Array(count);
    for (let i = 0; i < count; i++) arr[i] = i + 1;
    return arr;
  });

  let highlightedCode = $derived.by<string>(() => {
    if (!content) return "";
    try {
      const valid = detectedLang && detectedLang !== "plaintext" && hljs.getLanguage(detectedLang) ? detectedLang : undefined;
      if (valid) {
        return hljs.highlight(content, { language: valid, ignoreIllegals: true }).value;
      }
      return hljs.highlightAuto(content).value;
    } catch {
      return content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
  });

  // Editor cursor & scroll synchronization
  let workspaceEl = $state<HTMLDivElement | null>(null);
  let gutterEl = $state<HTMLElement | null>(null);
  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let codeGutterEl = $state<HTMLElement | null>(null);
  let codePreEl = $state<HTMLElement | null>(null);

  let currentCursorLine = $state(1);
  let currentCursorCol = $state(1);
  let copiedCode = $state(false);

  // Floating Encrypt on selection in editor
  let floatingEncrypt = $state({
    visible: false,
    x: 0,
    y: 0,
    text: "",
    start: 0,
    end: 0,
    isEncrypting: false,
  });

  function getCaretCoordinates(element: HTMLTextAreaElement, position: number) {
    const div = document.createElement("div");
    const style = window.getComputedStyle(element);
    const properties = [
      "direction", "boxSizing", "width", "height", "overflowX", "overflowY",
      "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
      "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize",
      "fontSizeAdjust", "lineHeight", "fontFamily", "textAlign", "textTransform",
      "textIndent", "textDecoration", "letterSpacing", "wordSpacing", "tabSize"
    ];
    for (const prop of properties) {
      (div.style as any)[prop] = (style as any)[prop];
    }
    div.style.position = "absolute";
    div.style.visibility = "hidden";
    div.style.whiteSpace = "pre-wrap";
    div.style.wordWrap = "break-word";
    div.style.top = "0";
    div.style.left = "0";
    div.textContent = element.value.substring(0, position);
    const span = document.createElement("span");
    span.textContent = element.value.substring(position) || ".";
    div.appendChild(span);
    document.body.appendChild(div);
    const coordinates = {
      left: span.offsetLeft - element.scrollLeft,
      top: span.offsetTop - element.scrollTop,
    };
    document.body.removeChild(div);
    return coordinates;
  }

  function checkEditorSelection(e?: MouseEvent) {
    if (!textareaEl || !isEditing) {
      floatingEncrypt.visible = false;
      return;
    }
    const start = textareaEl.selectionStart;
    const end = textareaEl.selectionEnd;
    if (start === end) {
      floatingEncrypt.visible = false;
      return;
    }

    const text = textareaEl.value.slice(start, end).trim();
    if (!text) {
      floatingEncrypt.visible = false;
      return;
    }

    floatingEncrypt.text = text;
    floatingEncrypt.start = start;
    floatingEncrypt.end = end;

    if (workspaceEl) {
      const wsRect = workspaceEl.getBoundingClientRect();
      if (e) {
        const x = Math.max(12, Math.min(wsRect.width - 130, e.clientX - wsRect.left - 45));
        const y = Math.max(8, e.clientY - wsRect.top - 40);
        floatingEncrypt.x = x;
        floatingEncrypt.y = y;
        floatingEncrypt.visible = true;
      } else {
        const caret = getCaretCoordinates(textareaEl, start);
        const gutterW = gutterEl?.offsetWidth || 0;
        const x = Math.max(12, Math.min(wsRect.width - 130, caret.left + gutterW - 20));
        const y = Math.max(8, caret.top - 38);
        floatingEncrypt.x = x;
        floatingEncrypt.y = y;
        floatingEncrypt.visible = true;
      }
    }
  }

  async function handleFloatingEncrypt() {
    if (!floatingEncrypt.text || floatingEncrypt.isEncrypting) return;
    floatingEncrypt.isEncrypting = true;
    try {
      const token = await invoke<string>("crypto_encrypt_secret", {
        plaintext: floatingEncrypt.text,
        pubkeyContent: null,
      });

      const tokenMarkdown = `\`🔒[${token}]\``;
      const start = floatingEncrypt.start;
      const end = floatingEncrypt.end;

      const newContent = content.slice(0, start) + tokenMarkdown + content.slice(end);
      onContentChange(newContent);

      floatingEncrypt.visible = false;

      setTimeout(() => {
        if (textareaEl) {
          textareaEl.focus();
          const newPos = start + tokenMarkdown.length;
          textareaEl.selectionStart = newPos;
          textareaEl.selectionEnd = newPos;
          updateCursorPosition();
        }
      }, 50);
    } catch (err: any) {
      alert("Не удалось зашифровать секрет: " + err);
    } finally {
      floatingEncrypt.isEncrypting = false;
    }
  }

  function copyCodeToClipboard() {
    if (!content) return;
    navigator.clipboard.writeText(content);
    copiedCode = true;
    setTimeout(() => {
      copiedCode = false;
    }, 1500);
  }

  function handleEditorScroll() {
    if (textareaEl && gutterEl) {
      gutterEl.scrollTop = textareaEl.scrollTop;
    }
    if (floatingEncrypt.visible) {
      floatingEncrypt.visible = false;
    }
  }

  function handleCodeViewerScroll(e: Event) {
    const target = e.target as HTMLElement;
    if (codeGutterEl) {
      codeGutterEl.scrollTop = target.scrollTop;
    }
  }

  function updateCursorPosition() {
    if (!textareaEl) return;
    const selStart = textareaEl.selectionStart || 0;
    const before = content.slice(0, selStart);
    const lines = before.split("\n");
    currentCursorLine = lines.length;
    currentCursorCol = (lines[lines.length - 1]?.length || 0) + 1;
    onCursorChange?.(currentCursorLine, currentCursorCol);
  }

  function handleTextareaKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && (e.code === "KeyE" || e.key.toLowerCase() === "e" || e.key === "у" || e.key === "У")) {
      e.preventDefault();
      checkEditorSelection();
      handleFloatingEncrypt();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (!textareaEl) return;
      const start = textareaEl.selectionStart;
      const end = textareaEl.selectionEnd;
      const val = textareaEl.value;
      const indent = "  "; // 2 spaces
      const newVal = val.substring(0, start) + indent + val.substring(end);
      onContentChange(newVal);
      setTimeout(() => {
        if (textareaEl) {
          textareaEl.selectionStart = textareaEl.selectionEnd = start + indent.length;
          updateCursorPosition();
        }
      }, 0);
    }
  }

  // Parse YAML Frontmatter & Body
  let parsedDoc = $derived(parseFrontmatter(content));

  let parsedMarkdownHtml = $derived.by<string>(() => {
    if (!parsedDoc.body) return "";
    let body = parsedDoc.body.replace(/\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_m, target, title) => {
      return `[${title ? title.trim() : target.trim()}](${target.trim()})`;
    });
    let html = customMarked.parse(body) as string;
    // Replace secrets inside code or text with inline secret mount point
    const regex = /(?:<code>\s*)?(🔒\[enc:v1:[^\]]+\])(?:\s*<\/code>)?/g;
    return html.replace(regex, (_match, token) => {
      return `<span class="corthal-secret-mount" data-token="${token}"></span>`;
    });
  });

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

  function mountSecrets(node: HTMLElement, passphraseCallback?: () => Promise<string | null>) {
    let instances: any[] = [];
    let currentCallback = passphraseCallback;

    function renderWidgets() {
      for (const inst of instances) {
        unmount(inst);
      }
      instances = [];

      const placeholders = node.querySelectorAll<HTMLElement>(".corthal-secret-mount");
      for (const el of placeholders) {
        const token = el.getAttribute("data-token");
        if (token) {
          try {
            const inst = mount(SecretPill, {
              target: el,
              props: {
                token,
                onPassphraseNeeded: () => (currentCallback ? currentCallback() : Promise.resolve(null)),
              },
            });
            instances.push(inst);
          } catch (e) {
            console.error("Failed to mount SecretPill:", e);
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

  let tabsScrollArea: HTMLElement | undefined = $state();

  function scrollActiveTabIntoView(smooth: boolean = true) {
    if (!tabsScrollArea) return;
    const activeTabEl = tabsScrollArea.querySelector(".editor-tab.active") as HTMLElement | null;
    if (!activeTabEl) return;

    const containerRect = tabsScrollArea.getBoundingClientRect();
    const tabRect = activeTabEl.getBoundingClientRect();

    if (tabRect.left < containerRect.left) {
      const offset = tabRect.left - containerRect.left - 24;
      tabsScrollArea.scrollBy({
        left: offset,
        behavior: smooth ? "smooth" : "auto",
      });
    } else if (tabRect.right > containerRect.right) {
      const offset = tabRect.right - containerRect.right + 24;
      tabsScrollArea.scrollBy({
        left: offset,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  }

  $effect(() => {
    const currentPath = activePath;
    const currentTabsCount = tabs.length;

    if (currentPath && currentTabsCount > 0) {
      requestAnimationFrame(() => {
        scrollActiveTabIntoView(true);
      });
    }
  });

  function handleTabClick(path: string, e: MouseEvent) {
    e.stopPropagation();
    onFocusPane();
    onSelectTab(path);
    requestAnimationFrame(() => {
      scrollActiveTabIntoView(true);
    });
  }

  function handleCloseTab(path: string, e: MouseEvent) {
    e.stopPropagation();
    onCloseTab(path);
  }

  function handleTextareaInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    onContentChange(target.value);
    updateCursorPosition();
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
    if ((e.ctrlKey || e.metaKey) && (e.code === "KeyS" || e.key.toLowerCase() === "s")) {
      e.preventDefault();
      onSaveNote();
    }
    if ((e.ctrlKey || e.metaKey) && (e.code === "KeyW" || e.key.toLowerCase() === "w") && activePath) {
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
  aria-label={t("editor.pane_aria", { num: paneId === "left" ? 1 : 2 })}
  tabindex="0"
>
  <!-- TAB BAR -->
  <div class="tabs-header-bar">
    <div class="tabs-scroll-area" bind:this={tabsScrollArea} onwheel={handleTabsWheel}>
      {#each tabs as tab (tab.path)}
        {@const isActive = tab.path === activePath}
        <div
          class="editor-tab"
          class:active={isActive}
          onclick={(e) => handleTabClick(tab.path, e)}
          onpointerdown={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              e.stopPropagation();
              handleCloseTab(tab.path, e as any);
            }
          }}
          role="tab"
          tabindex="0"
          aria-selected={isActive}
          onkeydown={(e) => (e.key === "Enter" || e.code === "Enter") && handleTabClick(tab.path, e as any)}
        >
          <span class="tab-icon">
            <Icon name={getFileIcon(tab.path)} size={13} color={isActive ? "var(--corthal-accent)" : "var(--corthal-fg-muted)"} />
          </span>
          <span class="tab-title" title={tab.path}>{tab.title}</span>

          {#if tab.isDirty}
            <span class="dirty-indicator" title={t("editor.unsaved_changes")}>●</span>
          {/if}

          <button
            class="tab-close-btn"
            aria-label={t("editor.close_tab")}
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCloseTab(tab.path, e);
            }}
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      {/each}
    </div>

    <!-- PANE TOOLBAR ACTIONS (Right side of tab bar) -->
    <div class="pane-actions">
      {#if activePath}
        <!-- Insert Secret Button (visible when markdown file is open) -->
        {#if isMarkdown}
          <button
            class="pane-action-btn secret-btn icon-only"
            title={t("editor.insert_secret")}
            aria-label={t("editor.insert_secret")}
            onclick={onOpenSecretModal}
          >
            <Icon name="lock" size={13} color="#f59e0b" />
          </button>
        {/if}

        <!-- Mode Toggle: Live Preview vs Source for Markdown, View vs Edit for Code -->
        <div class="mode-toggle-group">
          {#if isMarkdown}
            <button
              class="mode-btn"
              class:active={!isEditing}
              onclick={() => onToggleEditing(false)}
              title={t("editor.mode_live")}
              aria-label={t("editor.mode_live")}
            >
              <Icon name="eye" size={13} />
            </button>
            <button
              class="mode-btn"
              class:active={isEditing}
              onclick={() => onToggleEditing(true)}
              title={t("editor.mode_source")}
              aria-label={t("editor.mode_source")}
            >
              <Icon name="code" size={13} />
            </button>
          {:else}
            <button
              class="mode-btn"
              class:active={!isEditing}
              onclick={() => onToggleEditing(false)}
              title={t("common.preview")}
              aria-label={t("common.preview")}
            >
              <Icon name="eye" size={13} />
            </button>
            <button
              class="mode-btn"
              class:active={isEditing}
              onclick={() => onToggleEditing(true)}
              title={t("common.edit")}
              aria-label={t("common.edit")}
            >
              <Icon name="file-edit" size={13} />
            </button>
          {/if}
        </div>
      {/if}

      <!-- Close Right Pane Button (if split and this is the right pane) -->
      {#if canCloseSplit && onCloseSplit}
        <button
          class="pane-action-btn close-pane-btn"
          onclick={onCloseSplit}
          title={t("common.close")}
        >
          <Icon name="x" size={13} />
        </button>
      {/if}
    </div>
  </div>

  <!-- PANE BODY -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="pane-content-body"
    onclick={() => onDocumentAreaClick?.()}
    onpointerdown={() => onDocumentAreaClick?.()}
  >
    {#if activePath}
      {#if isMarkdown}
        <!-- MARKDOWN: Hybrid Live Preview & Source Editor -->
        <div class="markdown-live-container">
          {#if !isEditing && parsedDoc.frontmatter && Object.keys(parsedDoc.frontmatter).length > 0}
            <div class="frontmatter-wrap">
              <PropertiesBlock
                properties={parsedDoc.frontmatter}
                onTagClick={(tag) => onTagClick?.(tag)}
              />
            </div>
          {/if}

          {#key activePath}
            <LiveMarkdownEditor
              {content}
              mode={isEditing ? "source" : "live"}
              {activePath}
              onContentChange={onContentChange}
              onCursorChange={onCursorChange}
              onSave={onSaveNote}
              onOpenSecretModal={onOpenSecretModal}
              onOpenNote={onOpenNote}
              onPassphraseNeeded={onPassphraseNeeded}
            />
          {/key}
        </div>
      {:else}
        <!-- NON-MARKDOWN: Code Editor (isEditing) or Code Viewer (!isEditing) -->
        {#if isEditing}
          <!-- EDIT MODE (with Line Numbers Gutter and 1:1 Scroll Sync) -->
          <div class="editor-workspace" bind:this={workspaceEl}>
            <div class="line-gutter" bind:this={gutterEl}>
              {#each lineNumbers as lineNum}
                <div
                  class="gutter-line"
                  class:active={currentCursorLine === lineNum}
                >
                  {lineNum}
                </div>
              {/each}
            </div>

            <textarea
              bind:this={textareaEl}
              class="editor-textarea"
              value={content}
              oninput={(e) => {
                handleTextareaInput(e);
                floatingEncrypt.visible = false;
              }}
              onscroll={handleEditorScroll}
              onclick={updateCursorPosition}
              onkeyup={(e) => {
                updateCursorPosition();
                if (e.shiftKey) checkEditorSelection();
              }}
              onmouseup={(e) => {
                updateCursorPosition();
                checkEditorSelection(e);
              }}
              onselect={() => {
                updateCursorPosition();
                checkEditorSelection();
              }}
              onkeydown={(e) => {
                handleTextareaKeydown(e);
                if (e.key !== "Shift" && e.key !== "Control" && e.key !== "Alt") {
                  floatingEncrypt.visible = false;
                }
              }}
              placeholder={t("editor.source_placeholder")}
              spellcheck="false"
            ></textarea>

            {#if floatingEncrypt.visible}
              <div
                class="floating-encrypt-bar"
                style="left: {floatingEncrypt.x}px; top: {floatingEncrypt.y}px;"
              >
                <button
                  type="button"
                  class="floating-encrypt-btn"
                  onmousedown={(e) => e.preventDefault()}
                  onclick={handleFloatingEncrypt}
                  disabled={floatingEncrypt.isEncrypting}
                  title={t("editor.encrypt_tooltip")}
                >
                  <Icon name="lock" size={12} color="var(--corthal-accent, #38bdf8)" />
                  <span>{floatingEncrypt.isEncrypting ? t("editor.encrypting") : t("editor.encrypt_selection")}</span>
                </button>
              </div>
            {/if}
          </div>
        {:else}
          <!-- Code Viewer for Non-Markdown files (.rs, .py, .js, .sh, .json, etc.) -->
          <div class="code-viewer-container">
            <div class="code-viewer-toolbar">
              <div class="lang-pill">
                <Icon name="file-code" size={13} color="var(--corthal-accent)" />
                <span>{detectedLang.toUpperCase()}</span>
              </div>
              <span class="code-meta-lines">{t("editor.lines_count", { count: lineNumbers.length })}</span>
              <button class="copy-code-btn" onclick={copyCodeToClipboard}>
                <Icon name={copiedCode ? "check" : "copy"} size={12} />
                <span>{copiedCode ? t("editor.code_copied") : t("editor.copy_code")}</span>
              </button>
            </div>

            <div class="code-viewer-workspace" onscroll={handleCodeViewerScroll}>
              <div class="line-gutter code-viewer-gutter" bind:this={codeGutterEl}>
                {#each lineNumbers as lineNum}
                  <div class="gutter-line">{lineNum}</div>
                {/each}
              </div>
              <pre class="code-viewer-pre"><code class="hljs {detectedLang}">{@html highlightedCode}</code></pre>
            </div>
          </div>
        {/if}
      {/if}
    {:else}
      <!-- VS Code Style Welcome / Watermark State -->
      <div class="empty-welcome-workspace">
        <div class="watermark-logo">
          <Icon name="brain" size={96} color="var(--corthal-accent, #38bdf8)" />
        </div>

        <div class="welcome-shortcuts-list">
          <button
            class="shortcut-action-row"
            onclick={onOpenSearch}
            title={t("editor.welcome.search_notes")}
          >
            <span class="shortcut-label">{t("editor.welcome.search_notes")}</span>
            <span class="shortcut-keys">
              <kbd>Ctrl</kbd> + <kbd>F</kbd>
            </span>
          </button>

          <button
            class="shortcut-action-row"
            onclick={onOpenCreateNote}
            title={t("editor.welcome.new_note")}
          >
            <span class="shortcut-label">{t("editor.welcome.new_note")}</span>
            <span class="shortcut-keys">
              <kbd>Ctrl</kbd> + <kbd>N</kbd>
            </span>
          </button>

          <button
            class="shortcut-action-row"
            onclick={onToggleSidebar}
            title={t("editor.welcome.explorer")}
          >
            <span class="shortcut-label">{t("editor.welcome.explorer")}</span>
            <span class="shortcut-keys">
              <kbd>Ctrl</kbd> + <kbd>B</kbd>
            </span>
          </button>

          <button
            class="shortcut-action-row"
            onclick={onSplitToggle}
            title={t("editor.welcome.split_editor")}
          >
            <span class="shortcut-label">{t("editor.welcome.split_editor")}</span>
            <span class="shortcut-keys">
              <kbd>Ctrl</kbd> + <kbd>\</kbd>
            </span>
          </button>

          <button
            class="shortcut-action-row"
            onclick={onToggleAssistant}
            title={t("editor.welcome.assistant")}
          >
            <span class="shortcut-label">{t("editor.welcome.assistant")}</span>
            <span class="shortcut-keys">
              <kbd>Ctrl</kbd> + <kbd>J</kbd>
            </span>
          </button>

          <button
            class="shortcut-action-row"
            onclick={onOpenSettings}
            title={t("editor.welcome.settings")}
          >
            <span class="shortcut-label">{t("editor.welcome.settings")}</span>
            <span class="shortcut-keys">
              <kbd>Ctrl</kbd> + <kbd>,</kbd>
            </span>
          </button>
        </div>
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
    background: var(--corthal-bg-main, #0f172a);
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
    background: var(--corthal-bg-header, #0b1120);
    border-bottom: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.08));
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
    border-right: 1px solid var(--corthal-border-subtle, rgba(255, 255, 255, 0.05));
    border-bottom: 2px solid transparent;
    color: var(--corthal-fg-muted, #94a3b8);
    font-size: 0.78rem;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.12s ease;
    max-width: 220px;
    outline: none;
  }

  .editor-tab:hover {
    background: var(--corthal-bg-hover, rgba(255, 255, 255, 0.04));
    color: var(--corthal-fg-primary, #ffffff);
  }

  .editor-tab.active {
    background: var(--corthal-bg-main, #0f172a);
    color: var(--corthal-fg-primary, #ffffff);
    border-bottom: 2px solid var(--corthal-accent, #38bdf8);
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
    color: var(--corthal-accent, #38bdf8);
    font-size: 0.75rem;
    line-height: 1;
  }

  .tab-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    background: transparent;
    border: none;
    color: var(--corthal-fg-muted, #94a3b8);
    cursor: pointer;
    opacity: 0.7;
    transition: all 0.12s;
    margin-left: auto;
    flex-shrink: 0;
    z-index: 5;
    pointer-events: auto;
  }

  .editor-tab:hover .tab-close-btn,
  .editor-tab.active .tab-close-btn {
    opacity: 1;
  }

  .tab-close-btn:hover {
    background: rgba(255, 255, 255, 0.18);
    color: #ffffff;
  }

  .tab-close-btn :global(*) {
    pointer-events: none;
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
    justify-content: center;
    gap: 5px;
    padding: 4px 7px;
    height: 24px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--corthal-fg-secondary, #94a3b8);
    font-size: 0.72rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .pane-action-btn.icon-only {
    width: 24px;
    padding: 0;
  }

  .pane-action-btn:hover {
    background: var(--corthal-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--corthal-fg-primary, #ffffff);
    border-color: var(--corthal-border-subtle, rgba(255, 255, 255, 0.1));
  }

  .pane-action-btn.active {
    color: var(--corthal-accent, #38bdf8);
    background: var(--corthal-accent-subtle, rgba(56, 189, 248, 0.12));
    border-color: var(--corthal-accent-border, rgba(56, 189, 248, 0.3));
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
    align-items: center;
    background: var(--corthal-bg-input, rgba(0, 0, 0, 0.25));
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.08));
    border-radius: 4px;
    padding: 1px;
    height: 24px;
  }

  .mode-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 20px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--corthal-fg-muted, #94a3b8);
    cursor: pointer;
    transition: all 0.12s;
  }

  .mode-btn:hover {
    color: var(--corthal-fg-primary, #ffffff);
  }

  .mode-btn.active {
    background: var(--corthal-bg-card, rgba(255, 255, 255, 0.12));
    color: var(--corthal-fg-primary, #ffffff);
  }

  /* PANE CONTENT BODY */
  .pane-content-body {
    flex: 1;
    overflow-y: auto;
    position: relative;
    min-height: 0;
  }

  /* EDITOR WORKSPACE WITH LINE GUTTER */
  .editor-workspace {
    display: flex;
    height: 100%;
    width: 100%;
    background: var(--corthal-bg-main, #0f172a);
    overflow: hidden;
    position: relative;
  }

  .line-gutter {
    flex-shrink: 0;
    min-width: 48px;
    padding: 16px 12px 16px 0;
    text-align: right;
    box-sizing: border-box;
    background: var(--corthal-bg-main, #0f172a);
    border-right: 1px solid var(--corthal-border-subtle, rgba(255, 255, 255, 0.08));
    overflow-y: hidden;
    user-select: none;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.88rem;
  }

  .gutter-line {
    height: 22px;
    line-height: 22px;
    color: var(--corthal-fg-muted, #64748b);
    font-variant-numeric: tabular-nums;
    transition: color 0.1s ease;
  }

  .gutter-line.active {
    color: var(--corthal-accent, #38bdf8);
    font-weight: 700;
  }

  .editor-textarea {
    flex: 1;
    height: 100%;
    padding: 16px 20px;
    box-sizing: border-box;
    background: transparent;
    border: none;
    color: var(--corthal-fg-primary, #f1f5f9);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.88rem;
    line-height: 22px;
    resize: none;
    outline: none;
    white-space: pre;
    overflow-x: auto;
    overflow-y: auto;
    tab-size: 2;
    user-select: text;
    -webkit-user-select: text;
  }

  .floating-encrypt-bar {
    position: absolute;
    z-index: 60;
    pointer-events: auto;
    animation: fadeIn 0.15s ease;
  }

  .floating-encrypt-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--corthal-bg-header, #080c14);
    border: 1px solid var(--corthal-accent, #38bdf8);
    border-radius: 6px;
    padding: 3px 9px;
    font-size: 0.73rem;
    font-weight: 500;
    color: var(--corthal-fg-primary, #ffffff);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
    cursor: pointer;
    transition: all 0.12s ease;
    user-select: none;
  }

  .floating-encrypt-btn:hover:not(:disabled) {
    background: var(--corthal-bg-card, #141b2a);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55);
    transform: translateY(-1px);
  }

  .floating-encrypt-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* CODE VIEWER FOR NON-MD FILES */
  .code-viewer-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--corthal-bg-main, #0f172a);
    overflow: hidden;
  }

  .code-viewer-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 16px;
    background: var(--corthal-bg-header, rgba(0, 0, 0, 0.2));
    border-bottom: 1px solid var(--corthal-border-subtle, rgba(255, 255, 255, 0.06));
    user-select: none;
    flex-shrink: 0;
  }

  .lang-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 7px;
    background: var(--corthal-accent-subtle, rgba(56, 189, 248, 0.12));
    border: 1px solid var(--corthal-accent-border, rgba(56, 189, 248, 0.25));
    border-radius: 4px;
    color: var(--corthal-accent, #38bdf8);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .code-meta-lines {
    font-size: 0.72rem;
    color: var(--corthal-fg-muted, #94a3b8);
  }

  .copy-code-btn {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    background: transparent;
    border: 1px solid var(--corthal-border-subtle, rgba(255, 255, 255, 0.1));
    border-radius: 4px;
    color: var(--corthal-fg-secondary, #cbd5e1);
    font-size: 0.72rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .copy-code-btn:hover {
    background: var(--corthal-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--corthal-fg-primary, #ffffff);
  }

  .code-viewer-workspace {
    display: flex;
    flex: 1;
    overflow: auto;
    position: relative;
    background: var(--corthal-bg-main, #0f172a);
  }

  .code-viewer-gutter {
    position: sticky;
    left: 0;
    z-index: 2;
  }

  .code-viewer-pre {
    flex: 1;
    margin: 0;
    padding: 16px 20px;
    background: transparent;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 0.88rem;
    line-height: 22px;
    user-select: text;
    -webkit-user-select: text;
  }

  .code-viewer-pre code {
    background: transparent !important;
    padding: 0 !important;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
    user-select: text;
    -webkit-user-select: text;
  }

  :global(pre code.hljs) {
    background: transparent !important;
    padding: 0 !important;
    font-family: inherit;
    font-size: inherit;
    line-height: inherit;
  }

  /* MARKDOWN LIVE PREVIEW CONTAINER */
  .markdown-live-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: var(--corthal-bg-main, #0f172a);
    position: relative;
  }

  .markdown-live-container .frontmatter-wrap {
    max-width: 880px;
    width: 100%;
    margin: 16px auto 0 auto;
    padding: 0 28px;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  /* MARKDOWN PREVIEW STYLING */
  .markdown-preview-container {
    padding: 24px 32px;
    max-width: 880px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .frontmatter-wrap {
    margin-bottom: 20px;
  }

  .markdown-preview-content {
    color: var(--corthal-fg-primary, #e2e8f0);
    line-height: 1.65;
    font-size: 0.95rem;
    user-select: text;
    -webkit-user-select: text;
  }

  .markdown-preview-content :global(a) {
    color: var(--corthal-accent, #38bdf8);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .markdown-preview-content :global(a:hover) {
    filter: brightness(1.2);
  }

  .markdown-preview-content :global(h1),
  .markdown-preview-content :global(h2),
  .markdown-preview-content :global(h3),
  .markdown-preview-content :global(h4) {
    color: var(--corthal-fg-primary, #f8fafc);
    font-weight: 600;
    margin-top: 1.5em;
    margin-bottom: 0.6em;
    line-height: 1.3;
  }

  .markdown-preview-content :global(h1) {
    font-size: 1.6rem;
    border-bottom: 1px solid var(--corthal-border-subtle, rgba(255, 255, 255, 0.08));
    padding-bottom: 0.3em;
  }

  .markdown-preview-content :global(h2) {
    font-size: 1.3rem;
  }

  .markdown-preview-content :global(h3) {
    font-size: 1.1rem;
  }

  .markdown-preview-content :global(p) {
    margin-top: 0.6em;
    margin-bottom: 0.8em;
  }

  .markdown-preview-content :global(ul),
  .markdown-preview-content :global(ol) {
    padding-left: 24px;
    margin-top: 0.5em;
    margin-bottom: 0.8em;
  }

  .markdown-preview-content :global(li) {
    margin-bottom: 0.35em;
    line-height: 1.6;
  }

  .markdown-preview-content :global(code) {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.85em;
    padding: 0.15em 0.4em;
    background: var(--corthal-bg-card, rgba(255, 255, 255, 0.08));
    border-radius: 4px;
    color: var(--corthal-accent, #38bdf8);
  }

  .markdown-preview-content :global(pre) {
    background: var(--corthal-bg-sidebar, #090e17);
    border: 1px solid var(--corthal-border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    padding: 14px 16px;
    overflow-x: auto;
    margin: 1em 0;
  }

  .markdown-preview-content :global(pre code) {
    background: transparent;
    padding: 0;
    color: inherit;
    font-size: 0.88rem;
  }

  .markdown-preview-content :global(blockquote) {
    border-left: 3px solid var(--corthal-accent, #38bdf8);
    padding-left: 14px;
    margin-left: 0;
    color: var(--corthal-fg-muted, #94a3b8);
    font-style: italic;
  }

  :global(.corthal-secret-mount) {
    display: inline-flex;
    vertical-align: middle;
    margin: 0 4px;
  }

  /* VS CODE STYLE WELCOME / WATERMARK STATE */
  .empty-welcome-workspace {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
    user-select: none;
    padding: 24px;
    box-sizing: border-box;
  }

  .watermark-logo {
    opacity: 0.12;
    margin-bottom: 32px;
    filter: drop-shadow(0 4px 20px rgba(56, 189, 248, 0.25));
    transition: opacity 0.25s ease, transform 0.25s ease;
  }

  .watermark-logo:hover {
    opacity: 0.24;
    transform: scale(1.05);
  }

  .welcome-shortcuts-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 330px;
    max-width: 90%;
  }

  .shortcut-action-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: transparent;
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    width: 100%;
    box-sizing: border-box;
  }

  .shortcut-action-row:hover {
    background: var(--corthal-bg-hover, rgba(255, 255, 255, 0.06));
  }

  .shortcut-label {
    font-size: 0.83rem;
    color: var(--corthal-fg-muted, #94a3b8);
    transition: color 0.15s;
    font-weight: 500;
  }

  .shortcut-action-row:hover .shortcut-label {
    color: var(--corthal-fg-primary, #ffffff);
  }

  .shortcut-keys {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.72rem;
    color: var(--corthal-fg-muted, #64748b);
  }

  .shortcut-keys kbd {
    background: var(--corthal-bg-card, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--corthal-border-subtle, rgba(255, 255, 255, 0.12));
    border-radius: 4px;
    padding: 1px 6px;
    font-family: inherit;
    font-size: 0.72rem;
    color: var(--corthal-fg-secondary, #cbd5e1);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }
</style>
