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
  import { t } from "$lib/i18n";

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
  let isBold = $state(false);
  let isItalic = $state(false);
  let isStrike = $state(false);
  let isCode = $state(false);
  let isLink = $state(false);

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

  const WORD_CHAR_RE = /[\p{L}\p{N}_-]/u;

  function isWordChar(char: string): boolean {
    return Boolean(char && WORD_CHAR_RE.test(char));
  }

  function findWordAt(text: string, offset: number): { from: number; to: number } | null {
    if (text.length === 0) return null;
    let idx = offset;
    if (idx >= text.length || !isWordChar(text[idx])) {
      if (idx > 0 && isWordChar(text[idx - 1])) {
        idx = idx - 1;
      } else {
        return null;
      }
    }
    let from = idx;
    while (from > 0 && isWordChar(text[from - 1])) {
      from--;
    }
    let to = idx;
    while (to < text.length && isWordChar(text[to])) {
      to++;
    }
    if (from === to) return null;
    return { from, to };
  }

  function findEnclosingSpan(
    lineText: string,
    offset: number,
    marker: string,
    type: "bold" | "italic" | "strike" | "code" | "highlight"
  ): { start: number; end: number } | null {
    const mLen = marker.length;
    const indices: number[] = [];
    let i = 0;
    while (i <= lineText.length - mLen) {
      if (lineText.slice(i, i + mLen) === marker) {
        if (type === "italic") {
          const prevIsStar = i > 0 && lineText[i - 1] === "*";
          const nextIsStar = i + 1 < lineText.length && lineText[i + 1] === "*";
          if (prevIsStar || nextIsStar) {
            i++;
            continue;
          }
        }
        if (type === "code") {
          const prevIsTick = i > 0 && lineText[i - 1] === "`";
          const nextIsTick = i + 1 < lineText.length && lineText[i + 1] === "`";
          if (prevIsTick || nextIsTick) {
            i++;
            continue;
          }
        }
        indices.push(i);
        i += mLen;
      } else {
        i++;
      }
    }

    for (let p = 0; p + 1 < indices.length; p += 2) {
      const spanStart = indices[p];
      const spanEnd = indices[p + 1] + mLen;
      if (offset >= spanStart && offset <= spanEnd) {
        return { start: spanStart, end: spanEnd };
      }
    }
    return null;
  }

  function checkFormatActive(
    view: EditorView,
    type: "bold" | "italic" | "strike" | "code" | "link"
  ): boolean {
    const { from, to } = view.state.selection.main;
    const doc = view.state.doc;

    if (type === "link") {
      if (from !== to) {
        const text = doc.sliceString(from, to).trim();
        return /^\[.*?\]\(.*?\)$/.test(text);
      }
      const line = doc.lineAt(from);
      const lineOffset = from - line.from;
      const links = [...line.text.matchAll(/\[(.*?)\]\((.*?)\)/g)];
      return links.some((m) => {
        const start = m.index!;
        const end = start + m[0].length;
        return lineOffset >= start && lineOffset <= end;
      });
    }

    let marker = "**";
    if (type === "italic") marker = "*";
    else if (type === "strike") marker = "~~";
    else if (type === "code") marker = "`";

    const mLen = marker.length;

    if (from !== to) {
      const rawText = doc.sliceString(from, to).trim();
      let isSelf = false;
      if (type === "italic") {
        const count = rawText.match(/^\*+/)?.[0].length || 0;
        isSelf = (count === 1 || count === 3) && rawText.endsWith("*") && rawText.length >= 2;
      } else {
        isSelf = rawText.startsWith(marker) && rawText.endsWith(marker) && rawText.length >= mLen * 2;
      }
      if (isSelf) return true;

      if (type === "italic") {
        const starBefore = doc.sliceString(Math.max(0, from - 3), from).match(/\*+$/)?.[0].length || 0;
        const starAfter = doc.sliceString(to, Math.min(doc.length, to + 3)).match(/^\*+/)?.[0].length || 0;
        return (starBefore === 1 || starBefore === 3) && (starAfter === 1 || starAfter === 3);
      } else {
        const docBefore = doc.sliceString(Math.max(0, from - mLen), from);
        const docAfter = doc.sliceString(to, Math.min(doc.length, to + mLen));
        return docBefore === marker && docAfter === marker;
      }
    } else {
      const line = doc.lineAt(from);
      const span = findEnclosingSpan(line.text, from - line.from, marker, type);
      return Boolean(span);
    }
  }

  function handleInsertOrToggleLink() {
    if (!editorView) return;
    const { from, to } = editorView.state.selection.main;
    const doc = editorView.state.doc;
    const sel = doc.sliceString(from, to);

    // If selection is already a markdown link [text](url):
    const linkMatch = sel.match(/^\[(.*?)\]\((.*?)\)$/);
    if (linkMatch) {
      const text = linkMatch[1];
      editorView.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from, head: from + text.length },
      });
      editorView.focus();
      bubbleVisible = false;
      return;
    }

    // If selection is inside a link [text](url):
    const line = doc.lineAt(from);
    const lineOffset = from - line.from;
    const lineLinks = [...line.text.matchAll(/\[(.*?)\]\((.*?)\)/g)];
    for (const m of lineLinks) {
      const mStart = m.index!;
      const mEnd = mStart + m[0].length;
      if (lineOffset >= mStart && lineOffset <= mEnd) {
        const text = m[1];
        editorView.dispatch({
          changes: { from: line.from + mStart, to: line.from + mEnd, insert: text },
          selection: { anchor: line.from + mStart, head: line.from + mStart + text.length },
        });
        editorView.focus();
        bubbleVisible = false;
        return;
      }
    }

    // If text is selected and is an URL:
    if (from !== to && /^https?:\/\//i.test(sel.trim())) {
      const linkLabel = t("live_editor.link_default_text");
      const template = `[${linkLabel}](${sel.trim()})`;
      editorView.dispatch({
        changes: { from, to, insert: template },
        selection: { anchor: from + 1, head: from + 1 + linkLabel.length },
      });
      editorView.focus();
      bubbleVisible = false;
      return;
    }

    // Default: wrap selection or insert template
    const linkText = sel || "ссылка";
    const template = `[${linkText}](url)`;
    editorView.dispatch({
      changes: { from, to, insert: template },
      selection: {
        anchor: from + linkText.length + 3,
        head: from + template.length - 1,
      },
    });
    editorView.focus();
    bubbleVisible = false;
  }

  function toggleFormat(type: "bold" | "italic" | "strike" | "code" | "highlight" | "link") {
    if (!editorView) return;
    const state = editorView.state;
    const doc = state.doc;
    const { from, to } = state.selection.main;

    if (type === "link") {
      handleInsertOrToggleLink();
      return;
    }

    let marker = "**";
    if (type === "italic") marker = "*";
    else if (type === "strike") marker = "~~";
    else if (type === "code") marker = "`";
    else if (type === "highlight") marker = "==";

    const mLen = marker.length;

    // --- CASE 1: Selection is not empty (from !== to) ---
    if (from !== to) {
      const rawText = doc.sliceString(from, to);
      const leadMatch = rawText.match(/^\s*/);
      const trailMatch = rawText.match(/\s*$/);
      const leadSpaces = leadMatch ? leadMatch[0] : "";
      const trailSpaces = trailMatch ? trailMatch[0] : "";

      if (rawText.trim().length === 0) {
        return;
      }

      const coreFrom = from + leadSpaces.length;
      const coreTo = to - trailSpaces.length;
      const coreText = rawText.slice(leadSpaces.length, rawText.length - trailSpaces.length);

      // Check 1: Is coreText itself wrapped in marker?
      let isSelfWrapped = false;
      if (type === "italic") {
        const starCount = coreText.match(/^\*+/)?.[0].length || 0;
        isSelfWrapped = (starCount === 1 || starCount === 3) && coreText.endsWith("*") && coreText.length >= 2;
      } else {
        isSelfWrapped = coreText.startsWith(marker) && coreText.endsWith(marker) && coreText.length >= mLen * 2;
      }

      if (isSelfWrapped) {
        const unwrapped = coreText.slice(mLen, coreText.length - mLen);
        editorView.dispatch({
          changes: { from: coreFrom, to: coreTo, insert: unwrapped },
          selection: { anchor: coreFrom, head: coreFrom + unwrapped.length },
        });
        editorView.focus();
        bubbleVisible = false;
        return;
      }

      // Check 2: Are markers immediately outside the selection in document?
      const docBefore = doc.sliceString(Math.max(0, coreFrom - mLen), coreFrom);
      const docAfter = doc.sliceString(coreTo, Math.min(doc.length, coreTo + mLen));
      let isOuterWrapped = false;

      if (type === "italic") {
        const starBefore = doc.sliceString(Math.max(0, coreFrom - 3), coreFrom).match(/\*+$/)?.[0].length || 0;
        const starAfter = doc.sliceString(coreTo, Math.min(doc.length, coreTo + 3)).match(/^\*+/)?.[0].length || 0;
        isOuterWrapped = (starBefore === 1 || starBefore === 3) && (starAfter === 1 || starAfter === 3);
      } else {
        isOuterWrapped = docBefore === marker && docAfter === marker;
      }

      if (isOuterWrapped) {
        editorView.dispatch({
          changes: { from: coreFrom - mLen, to: coreTo + mLen, insert: coreText },
          selection: { anchor: coreFrom - mLen, head: coreTo - mLen },
        });
        editorView.focus();
        bubbleVisible = false;
        return;
      }

      // Check 3: Otherwise wrap
      const wrapped = `${marker}${coreText}${marker}`;
      editorView.dispatch({
        changes: { from: coreFrom, to: coreTo, insert: wrapped },
        selection: { anchor: coreFrom + mLen, head: coreTo + mLen },
      });
      editorView.focus();
      bubbleVisible = false;
      return;
    }

    // --- CASE 2: No selection (cursor collapsed) ---
    const pos = from;

    // Check if cursor is directly between empty markers (e.g. **|**)
    const checkBefore = doc.sliceString(Math.max(0, pos - mLen), pos);
    const checkAfter = doc.sliceString(pos, Math.min(doc.length, pos + mLen));
    if (checkBefore === marker && checkAfter === marker) {
      editorView.dispatch({
        changes: { from: pos - mLen, to: pos + mLen, insert: "" },
        selection: { anchor: pos - mLen },
      });
      editorView.focus();
      return;
    }

    // Check if cursor is inside an existing span on this line
    const line = doc.lineAt(pos);
    const lineText = line.text;
    const offset = pos - line.from;
    const span = findEnclosingSpan(lineText, offset, marker, type);
    if (span) {
      const absStart = line.from + span.start;
      const absEnd = line.from + span.end;
      const content = lineText.slice(span.start + mLen, span.end - mLen);
      editorView.dispatch({
        changes: { from: absStart, to: absEnd, insert: content },
        selection: { anchor: Math.max(absStart, Math.min(absStart + content.length, pos - mLen)) },
      });
      editorView.focus();
      return;
    }

    // Check if cursor is on/adjacent to a word
    const wordRange = findWordAt(lineText, offset);
    if (wordRange) {
      const absWordFrom = line.from + wordRange.from;
      const absWordTo = line.from + wordRange.to;
      const wordText = lineText.slice(wordRange.from, wordRange.to);

      const beforeWord = doc.sliceString(Math.max(0, absWordFrom - mLen), absWordFrom);
      const afterWord = doc.sliceString(absWordTo, Math.min(doc.length, absWordTo + mLen));

      if (beforeWord === marker && afterWord === marker) {
        editorView.dispatch({
          changes: { from: absWordFrom - mLen, to: absWordTo + mLen, insert: wordText },
          selection: { anchor: pos - mLen },
        });
      } else {
        const wrapped = `${marker}${wordText}${marker}`;
        editorView.dispatch({
          changes: { from: absWordFrom, to: absWordTo, insert: wrapped },
          selection: { anchor: pos + mLen },
        });
      }
      editorView.focus();
      return;
    }

    // Fallback: insert empty pair
    const emptyPair = `${marker}${marker}`;
    editorView.dispatch({
      changes: { from: pos, to: pos, insert: emptyPair },
      selection: { anchor: pos + mLen },
    });
    editorView.focus();
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
      alert(t("live_editor.encrypt_error") + err);
    } finally {
      isEncrypting = false;
    }
  }

  function handleSelectionUpdate(view: EditorView) {
    const sel = view.state.selection.main;

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
        isBold = checkFormatActive(view, "bold");
        isItalic = checkFormatActive(view, "italic");
        isStrike = checkFormatActive(view, "strike");
        isCode = checkFormatActive(view, "code");
        isLink = checkFormatActive(view, "link");

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

  function createKeyboardHandler() {
    return EditorView.domEventHandlers({
      keydown(e: KeyboardEvent, view: EditorView) {
        const isCtrl = e.ctrlKey || e.metaKey;
        if (!isCtrl) return false;

        // 1. Bold: Ctrl+B
        if (!e.shiftKey && !e.altKey && (e.code === "KeyB" || e.key.toLowerCase() === "b" || e.key === "и" || e.key === "И")) {
          e.preventDefault();
          e.stopPropagation();
          toggleFormat("bold");
          return true;
        }

        // 2. Italic: Ctrl+I
        if (!e.shiftKey && !e.altKey && (e.code === "KeyI" || e.key.toLowerCase() === "i" || e.key === "ш" || e.key === "Ш")) {
          e.preventDefault();
          e.stopPropagation();
          toggleFormat("italic");
          return true;
        }

        // 3. Strikethrough: Ctrl+Shift+X or Ctrl+Shift+S
        if (e.shiftKey && !e.altKey && (
          e.code === "KeyX" || e.code === "KeyS" ||
          e.key.toLowerCase() === "x" || e.key.toLowerCase() === "s" ||
          e.key === "ч" || e.key === "Ч" || e.key === "ы" || e.key === "Ы"
        )) {
          e.preventDefault();
          e.stopPropagation();
          toggleFormat("strike");
          return true;
        }

        // 4. Inline Code: Ctrl+` (Backquote) or Ctrl+Shift+C
        if (
          (!e.shiftKey && !e.altKey && (e.code === "Backquote" || e.key === "`" || e.key === "ё" || e.key === "Ё")) ||
          (e.shiftKey && !e.altKey && (e.code === "KeyC" || e.key.toLowerCase() === "c" || e.key === "с" || e.key === "С"))
        ) {
          e.preventDefault();
          e.stopPropagation();
          toggleFormat("code");
          return true;
        }

        // 5. Link: Ctrl+K
        if (!e.shiftKey && !e.altKey && (e.code === "KeyK" || e.key.toLowerCase() === "k" || e.key === "л" || e.key === "Л")) {
          e.preventDefault();
          e.stopPropagation();
          toggleFormat("link");
          return true;
        }

        // 6. Secret: Ctrl+E
        if (!e.shiftKey && !e.altKey && (e.code === "KeyE" || e.key.toLowerCase() === "e" || e.key === "у" || e.key === "У")) {
          e.preventDefault();
          e.stopPropagation();
          if (bubbleVisible && selectedText) {
            handleEncryptSelection();
          } else {
            onOpenSecretModal?.();
          }
          return true;
        }

        // 7. Save: Ctrl+S
        if (!e.shiftKey && !e.altKey && (e.code === "KeyS" || e.key.toLowerCase() === "s" || e.key === "ы" || e.key === "Ы")) {
          e.preventDefault();
          e.stopPropagation();
          onSave?.();
          return true;
        }

        return false;
      },
    });
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
          toggleFormat("bold");
          return true;
        },
      },
      {
        key: "Mod-i",
        run: () => {
          toggleFormat("italic");
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
          toggleFormat("link");
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
      createKeyboardHandler(),
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
        class:active={isBold}
        onclick={() => toggleFormat("bold")}
        title={t("live_editor.bold")}
        aria-label={t("live_editor.bold")}
      >
        <span class="btn-text bold">B</span>
      </button>

      <button
        class="bubble-btn"
        class:active={isItalic}
        onclick={() => toggleFormat("italic")}
        title={t("live_editor.italic")}
        aria-label={t("live_editor.italic")}
      >
        <span class="btn-text italic">I</span>
      </button>

      <button
        class="bubble-btn"
        class:active={isStrike}
        onclick={() => toggleFormat("strike")}
        title={t("live_editor.strike")}
        aria-label={t("live_editor.strike")}
      >
        <span class="btn-text strike">S</span>
      </button>

      <button
        class="bubble-btn"
        class:active={isCode}
        onclick={() => toggleFormat("code")}
        title={t("live_editor.code")}
        aria-label={t("live_editor.code")}
      >
        <Icon name="code" size={13} />
      </button>

      <button
        class="bubble-btn"
        class:active={isLink}
        onclick={() => toggleFormat("link")}
        title={t("live_editor.link")}
        aria-label={t("live_editor.link")}
      >
        <Icon name="link" size={13} />
      </button>

      <div class="bubble-divider"></div>

      <button
        class="bubble-btn encrypt-btn"
        onclick={handleEncryptSelection}
        disabled={isEncrypting}
        title={t("live_editor.secret")}
        aria-label={t("live_editor.secret")}
      >
        <Icon name={isEncrypting ? "refresh-cw" : "lock"} size={13} class={isEncrypting ? "spin" : ""} color="#f59e0b" />
        <span class="encrypt-label">{isEncrypting ? t("live_editor.encrypting") : t("editor.encrypt_selection")}</span>
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
        <span>{t("live_editor.slash_header")}</span>
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

  .bubble-btn.active {
    background: var(--cortex-accent, #3b82f6);
    color: #ffffff;
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
