<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { EditorState, Compartment } from "@codemirror/state";
  import { EditorView, keymap, lineNumbers } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
  import { languages } from "@codemirror/language-data";
  import { GFM } from "@lezer/markdown";
  import { invoke } from "@tauri-apps/api/core";
  import { cortexEditorTheme, cortexSyntax } from "$lib/editor/theme";
  import { createLivePreviewPlugin } from "$lib/editor/livePreviewExtension";
  import { SLASH_COMMANDS, type SlashCommandItem } from "$lib/editor/slashCommands";
  import Icon from "./Icon.svelte";

  interface Props {
    content: string;
    mode?: "live" | "source";
    activePath?: string | null;
    onContentChange: (newContent: string) => void;
    onCursorChange?: (line: number, col: number) => void;
    onSave?: () => void;
    onOpenSecretModal?: () => void;
    onOpenNote?: (path: string) => void;
    onPassphraseNeeded?: () => Promise<string | null>;
  }

  let {
    content,
    mode = "live",
    activePath,
    onContentChange,
    onCursorChange,
    onSave,
    onOpenSecretModal,
    onOpenNote,
    onPassphraseNeeded,
  }: Props = $props();

  let editorContainerEl = $state<HTMLDivElement | null>(null);
  let editorView: EditorView | null = null;
  let modeCompartment = new Compartment();
  let livePreviewCompartment = new Compartment();

  // Floating Bubble State
  let bubbleVisible = $state(false);
  let bubbleX = $state(0);
  let bubbleY = $state(0);
  let selectedText = $state("");
  let selectionFrom = $state(0);
  let selectionTo = $state(0);
  let isEncrypting = $state(false);

  // Slash Command State
  let slashOpen = $state(false);
  let slashX = $state(0);
  let slashY = $state(0);
  let slashQuery = $state("");
  let slashSelectedIndex = $state(0);
  let slashLinePos = $state(0);

  let filteredSlashCommands = $derived.by<SlashCommandItem[]>(() => {
    if (!slashQuery) return SLASH_COMMANDS;
    const q = slashQuery.toLowerCase();
    return SLASH_COMMANDS.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  });

  function wrapSelection(before: string, after: string = before) {
    if (!editorView) return;
    const { from, to } = editorView.state.selection.main;
    const sel = editorView.state.sliceDoc(from, to);

    // If already wrapped, unwrap
    if (
      sel.startsWith(before) &&
      sel.endsWith(after) &&
      sel.length >= before.length + after.length
    ) {
      const unwrapped = sel.slice(before.length, sel.length - after.length);
      editorView.dispatch({
        changes: { from, to, insert: unwrapped },
        selection: { anchor: from, head: from + unwrapped.length },
      });
    } else {
      const wrapped = `${before}${sel}${after}`;
      editorView.dispatch({
        changes: { from, to, insert: wrapped },
        selection: { anchor: from + before.length, head: to + before.length },
      });
    }
    editorView.focus();
    bubbleVisible = false;
  }

  async function handleEncryptSelection() {
    if (!editorView || isEncrypting || !selectedText) return;
    isEncrypting = true;
    try {
      const token = await invoke<string>("crypto_encrypt_secret", {
        plaintext: selectedText,
        pubkeyContent: null,
      });
      const tokenMarkdown = `\`🔒[${token}]\``;
      editorView.dispatch({
        changes: { from: selectionFrom, to: selectionTo, insert: tokenMarkdown },
        selection: { anchor: selectionFrom + tokenMarkdown.length },
      });
      editorView.focus();
      bubbleVisible = false;
    } catch (err: any) {
      alert("Не удалось зашифровать секрет: " + err);
    } finally {
      isEncrypting = false;
    }
  }

  function handleInsertLink() {
    if (!editorView) return;
    const { from, to } = editorView.state.selection.main;
    const sel = editorView.state.sliceDoc(from, to) || "ссылка";
    const template = `[${sel}](url)`;
    editorView.dispatch({
      changes: { from, to, insert: template },
      selection: { anchor: from + sel.length + 3, head: from + template.length - 1 },
    });
    editorView.focus();
    bubbleVisible = false;
  }

  function handleSelectionUpdate(view: EditorView) {
    const sel = view.state.selection.main;
    const isCtrl = false;

    // 1. Update cursor line and column
    const curLine = view.state.doc.lineAt(sel.head);
    const lineNum = curLine.number;
    const colNum = sel.head - curLine.from + 1;
    onCursorChange?.(lineNum, colNum);

    // 2. Check text selection for Bubble Menu
    if (sel.from !== sel.to) {
      const text = view.state.sliceDoc(sel.from, sel.to).trim();
      if (text) {
        selectedText = text;
        selectionFrom = sel.from;
        selectionTo = sel.to;

        const coords = view.coordsAtPos(sel.from);
        const containerRect = editorContainerEl?.getBoundingClientRect();
        if (coords && containerRect) {
          bubbleX = Math.max(16, Math.min(containerRect.width - 240, coords.left - containerRect.left - 40));
          bubbleY = Math.max(10, coords.top - containerRect.top - 46);
          bubbleVisible = true;
        }
      } else {
        bubbleVisible = false;
      }
    } else {
      bubbleVisible = false;
    }

    // 3. Check for Slash Command trigger on current line
    const lineText = curLine.text;
    const textBeforeCursor = lineText.slice(0, sel.head - curLine.from);
    const slashMatch = textBeforeCursor.match(/^\/([a-zA-Z0-9а-яА-ЯёЁ_-]*)$/);

    if (slashMatch && sel.from === sel.to) {
      slashQuery = slashMatch[1];
      slashLinePos = curLine.from;
      slashSelectedIndex = 0;

      const coords = view.coordsAtPos(sel.head);
      const containerRect = editorContainerEl?.getBoundingClientRect();
      if (coords && containerRect) {
        slashX = Math.max(16, Math.min(containerRect.width - 280, coords.left - containerRect.left));
        slashY = coords.bottom - containerRect.top + 6;
        slashOpen = true;
      }
    } else {
      slashOpen = false;
    }
  }

  function executeSlashCommand(cmd: SlashCommandItem) {
    if (!editorView) return;
    slashOpen = false;

    if (cmd.requiresSecretModal) {
      // Remove slash
      const curLine = editorView.state.doc.lineAt(editorView.state.selection.main.head);
      editorView.dispatch({
        changes: { from: curLine.from, to: editorView.state.selection.main.head, insert: "" },
      });
      onOpenSecretModal?.();
      return;
    }

    const curLine = editorView.state.doc.lineAt(editorView.state.selection.main.head);
    const insertPos = curLine.from;
    const replaceTo = editorView.state.selection.main.head;

    editorView.dispatch({
      changes: { from: insertPos, to: replaceTo, insert: cmd.template },
      selection: {
        anchor: insertPos + (cmd.cursorOffset !== undefined ? cmd.cursorOffset : cmd.template.length),
      },
    });
    editorView.focus();
  }

  function createCustomKeymap() {
    return keymap.of([
      {
        key: "Mod-s",
        run: () => {
          onSave?.();
          return true;
        },
      },
      {
        key: "Mod-b",
        run: () => {
          wrapSelection("**");
          return true;
        },
      },
      {
        key: "Mod-i",
        run: () => {
          wrapSelection("*");
          return true;
        },
      },
      {
        key: "Mod-e",
        run: () => {
          if (bubbleVisible && selectedText) {
            handleEncryptSelection();
            return true;
          }
          onOpenSecretModal?.();
          return true;
        },
      },
      {
        key: "Mod-k",
        run: () => {
          handleInsertLink();
          return true;
        },
      },
      {
        key: "Escape",
        run: () => {
          if (slashOpen) {
            slashOpen = false;
            return true;
          }
          if (bubbleVisible) {
            bubbleVisible = false;
            return true;
          }
          return false;
        },
      },
      {
        key: "ArrowDown",
        run: () => {
          if (slashOpen && filteredSlashCommands.length > 0) {
            slashSelectedIndex = (slashSelectedIndex + 1) % filteredSlashCommands.length;
            return true;
          }
          return false;
        },
      },
      {
        key: "ArrowUp",
        run: () => {
          if (slashOpen && filteredSlashCommands.length > 0) {
            slashSelectedIndex =
              (slashSelectedIndex - 1 + filteredSlashCommands.length) % filteredSlashCommands.length;
            return true;
          }
          return false;
        },
      },
      {
        key: "Enter",
        run: () => {
          if (slashOpen && filteredSlashCommands[slashSelectedIndex]) {
            executeSlashCommand(filteredSlashCommands[slashSelectedIndex]);
            return true;
          }
          return false;
        },
      },
      indentWithTab,
    ]);
  }

  function getExtensions() {
    const isLive = mode === "live";

    return [
      cortexEditorTheme,
      cortexSyntax,
      history(),
      EditorView.lineWrapping,
      markdown({
        extensions: [GFM],
        codeLanguages: languages,
      }),
      modeCompartment.of(isLive ? [] : lineNumbers()),
      livePreviewCompartment.of(
        isLive
          ? createLivePreviewPlugin({
              onOpenNote: (target) => onOpenNote?.(target),
              onPassphraseNeeded: () => (onPassphraseNeeded ? onPassphraseNeeded() : Promise.resolve(null)),
            })
          : []
      ),
      createCustomKeymap(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...markdownKeymap]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onContentChange(update.state.doc.toString());
        }
        if (update.docChanged || update.selectionSet) {
          handleSelectionUpdate(update.view);
        }
      }),
    ];
  }

  onMount(() => {
    if (!editorContainerEl) return;

    const headDoc = content.slice(0, Math.min(content.length, 5000));
    const fmMatch = headDoc.match(/^---\r?\n([\s\S]*?\r?\n---\r?\n?)/);
    const startPos = mode === "live" && fmMatch ? fmMatch[0].length : 0;

    const startState = EditorState.create({
      doc: content,
      selection: { anchor: startPos, head: startPos },
      extensions: getExtensions(),
    });

    editorView = new EditorView({
      state: startState,
      parent: editorContainerEl,
    });
  });

  onDestroy(() => {
    if (editorView) {
      editorView.destroy();
      editorView = null;
    }
  });

  // Synchronize when external content changes (tab switch or external reload)
  $effect(() => {
    if (editorView && content !== editorView.state.doc.toString()) {
      editorView.dispatch({
        changes: { from: 0, to: editorView.state.doc.length, insert: content },
      });
    }
  });

  // Synchronize when mode changes (live preview <-> source mode)
  $effect(() => {
    if (editorView) {
      const isLive = mode === "live";
      editorView.dispatch({
        effects: [
          modeCompartment.reconfigure(isLive ? [] : lineNumbers()),
          livePreviewCompartment.reconfigure(
            isLive
              ? createLivePreviewPlugin({
                  onOpenNote: (target) => onOpenNote?.(target),
                  onPassphraseNeeded: () => (onPassphraseNeeded ? onPassphraseNeeded() : Promise.resolve(null)),
                })
              : []
          ),
        ],
      });
    }
  });
</script>

<div class="cortex-live-editor" bind:this={editorContainerEl}>
  <!-- FLOATING SELECTION BUBBLE TOOLBAR (Obsidian / Typora style) -->
  {#if bubbleVisible}
    <div
      class="editor-bubble-toolbar"
      style="left: {bubbleX}px; top: {bubbleY}px;"
      onmousedown={(e) => e.preventDefault()}
      role="toolbar"
      tabindex="-1"
    >
      <button
        class="bubble-btn"
        onclick={() => wrapSelection("**")}
        title="Полужирный (Ctrl+B)"
        aria-label="Полужирный"
      >
        <span class="btn-text bold">B</span>
      </button>

      <button
        class="bubble-btn"
        onclick={() => wrapSelection("*")}
        title="Курсив (Ctrl+I)"
        aria-label="Курсив"
      >
        <span class="btn-text italic">I</span>
      </button>

      <button
        class="bubble-btn"
        onclick={() => wrapSelection("~~")}
        title="Зачёркнутый"
        aria-label="Зачёркнутый"
      >
        <span class="btn-text strike">S</span>
      </button>

      <button
        class="bubble-btn"
        onclick={() => wrapSelection("`")}
        title="Код"
        aria-label="В коде"
      >
        <Icon name="code" size={13} />
      </button>

      <button
        class="bubble-btn"
        onclick={handleInsertLink}
        title="Ссылка (Ctrl+K)"
        aria-label="Вставить ссылку"
      >
        <Icon name="link" size={13} />
      </button>

      <div class="bubble-divider"></div>

      <button
        class="bubble-btn encrypt-btn"
        onclick={handleEncryptSelection}
        disabled={isEncrypting}
        title="Зашифровать выделенный текст ключом SSH (Ctrl+E)"
        aria-label="Зашифровать секрет"
      >
        <Icon name={isEncrypting ? "refresh-cw" : "lock"} size={13} class={isEncrypting ? "spin" : ""} color="#f59e0b" />
        <span class="encrypt-label">{isEncrypting ? "Шифрование..." : "Зашифровать"}</span>
      </button>
    </div>
  {/if}

  <!-- SLASH COMMANDS POPUP (Notion / Obsidian style) -->
  {#if slashOpen && filteredSlashCommands.length > 0}
    <div
      class="editor-slash-popup"
      style="left: {slashX}px; top: {slashY}px;"
      onmousedown={(e) => e.preventDefault()}
      role="menu"
      tabindex="-1"
    >
      <div class="slash-header">
        <span>БЫСТРЫЕ КОМАНДЫ (НАЖМИТЕ ENTER)</span>
      </div>

      <div class="slash-items">
        {#each filteredSlashCommands as cmd, idx}
          {@const isSelected = idx === slashSelectedIndex}
          <button
            class="slash-item"
            class:selected={isSelected}
            onclick={() => executeSlashCommand(cmd)}
            onmouseenter={() => (slashSelectedIndex = idx)}
            role="menuitem"
          >
            <div class="slash-icon">
              <Icon name={cmd.icon} size={15} color={isSelected ? "var(--cortex-accent, #38bdf8)" : "#94a3b8"} />
            </div>
            <div class="slash-info">
              <div class="slash-title">{cmd.title}</div>
              <div class="slash-desc">{cmd.description}</div>
            </div>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .cortex-live-editor {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: transparent;
  }

  :global(.cm-editor) {
    height: 100%;
  }

  /* Global task checkbox styling in Live Preview */
  :global(.cm-live-task-wrap) {
    display: inline-flex;
    align-items: center;
    vertical-align: middle;
    margin-right: 6px;
    margin-left: 2px;
  }

  :global(.cm-live-task-checkbox) {
    appearance: none;
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border: 1.5px solid var(--cortex-border, #475569);
    border-radius: 4px;
    background: var(--cortex-bg-card, #1e293b);
    cursor: pointer;
    position: relative;
    outline: none;
    transition: all 0.15s ease;
  }

  :global(.cm-live-task-checkbox:checked) {
    background: var(--cortex-accent, #38bdf8);
    border-color: var(--cortex-accent, #38bdf8);
  }

  :global(.cm-live-task-checkbox:checked::after) {
    content: "";
    position: absolute;
    left: 4px;
    top: 1px;
    width: 5px;
    height: 9px;
    border: solid #090d16;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  :global(.cm-live-hr-container) {
    padding: 12px 0;
  }

  :global(.cm-live-hr) {
    border: none;
    height: 1px;
    background: var(--cortex-border, rgba(255, 255, 255, 0.1));
    margin: 0;
  }

  :global(.cm-live-secret-mount) {
    display: inline-flex;
    vertical-align: middle;
    margin: 0 2px;
  }

  /* Floating Bubble Toolbar */
  .editor-bubble-toolbar {
    position: absolute;
    z-index: 50;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 6px;
    border-radius: 8px;
    background: var(--cortex-bg-card, #131b2e);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.12));
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
    animation: bubbleFadeIn 0.15s ease-out;
  }

  @keyframes bubbleFadeIn {
    from {
      opacity: 0;
      transform: translateY(4px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .bubble-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--cortex-fg-secondary, #94a3b8);
    height: 26px;
    min-width: 26px;
    padding: 0 6px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.12s;
  }

  .bubble-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--cortex-fg-primary, #f8fafc);
  }

  .btn-text.bold {
    font-weight: 800;
  }

  .btn-text.italic {
    font-style: italic;
    font-family: serif;
    font-weight: 600;
  }

  .btn-text.strike {
    text-decoration: line-through;
    font-weight: 600;
  }

  .bubble-divider {
    width: 1px;
    height: 16px;
    background: var(--cortex-border, rgba(255, 255, 255, 0.12));
    margin: 0 4px;
  }

  .encrypt-btn {
    gap: 5px;
    color: #fbbf24;
    font-weight: 500;
    font-size: 12px;
  }

  .encrypt-btn:hover {
    background: rgba(245, 158, 11, 0.15);
    color: #fde68a;
  }

  /* Slash Commands Popup */
  .editor-slash-popup {
    position: absolute;
    z-index: 60;
    width: 280px;
    max-height: 320px;
    overflow-y: auto;
    background: var(--cortex-bg-card, #131b2e);
    border: 1px solid var(--cortex-border, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.55);
    padding: 6px;
    animation: bubbleFadeIn 0.15s ease-out;
  }

  .slash-header {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: var(--cortex-fg-muted, #64748b);
    padding: 6px 10px 4px 10px;
    text-transform: uppercase;
  }

  .slash-items {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .slash-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 6px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    width: 100%;
    transition: background 0.12s;
  }

  .slash-item:hover,
  .slash-item.selected {
    background: rgba(56, 189, 248, 0.12);
  }

  .slash-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.05);
    flex-shrink: 0;
  }

  .slash-item.selected .slash-icon {
    background: rgba(56, 189, 248, 0.2);
  }

  .slash-info {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .slash-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--cortex-fg-primary, #f1f5f9);
  }

  .slash-desc {
    font-size: 11px;
    color: var(--cortex-fg-muted, #94a3b8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
</style>
