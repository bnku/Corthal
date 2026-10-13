import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder, type Range, type Extension, StateField, EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { mount, unmount } from "svelte";
import SecretPill from "$lib/components/SecretPill.svelte";
import { t, i18n } from "$lib/i18n";

export interface LivePreviewOptions {
  onOpenNote?: (target: string) => void;
  onPassphraseNeeded?: () => Promise<string | null>;
}

// 1. Task Checkbox Widget
class TaskCheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
    readonly markerLen: number
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget) {
    return this.checked === other.checked && this.pos === other.pos && this.markerLen === other.markerLen;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-live-task-wrap";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "cm-live-task-checkbox";
    input.checked = this.checked;

    input.onchange = (e) => {
      e.stopPropagation();
      const newMarker = input.checked ? "[x]" : "[ ]";
      view.dispatch({
        changes: {
          from: this.pos,
          to: this.pos + this.markerLen,
          insert: newMarker,
        },
      });
    };

    wrap.appendChild(input);
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

// 2. Horizontal Rule Widget
class HorizontalRuleWidget extends WidgetType {
  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-live-hr-container";
    const hr = document.createElement("hr");
    hr.className = "cm-live-hr";
    wrap.appendChild(hr);
    return wrap;
  }
}

// 2b. Bullet Widget for lists
class BulletWidget extends WidgetType {
  toDOM(): HTMLElement {
    const dot = document.createElement("span");
    dot.className = "cm-live-bullet";
    dot.textContent = "•";
    return dot;
  }
}

// 2c. Helpers for Code Copying
async function doCopyCode(codeContent: string, copyBtn: HTMLButtonElement) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(codeContent);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = codeContent;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span style="color:#22c55e">${t("common.copied")}</span>`;
    setTimeout(() => {
      copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>${t("common.copy")}</span>`;
    }, 1500);
  } catch (err) {
    console.error("Failed to copy code:", err);
  }
}

function createCopyButton(codeContent: string): HTMLButtonElement {
  const copyBtn = document.createElement("button");
  copyBtn.className = "cm-live-code-copy-btn";
  copyBtn.type = "button";
  copyBtn.title = t("editor.copy_code");
  copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>${t("common.copy")}</span>`;

  copyBtn.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    doCopyCode(codeContent, copyBtn);
  });
  return copyBtn;
}

// 2d. Code Header Widget for fenced code blocks (inactive line)
class CodeHeaderWidget extends WidgetType {
  readonly locale = i18n.locale;
  constructor(readonly lang: string, readonly codeContent: string) {
    super();
  }

  eq(other: CodeHeaderWidget) {
    return this.lang === other.lang && this.codeContent === other.codeContent && this.locale === other.locale;
  }

  toDOM(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "cm-live-code-header-bar";

    const left = document.createElement("div");
    left.className = "cm-live-code-header-left";

    const dot = document.createElement("span");
    dot.className = "cm-live-code-dot";
    left.appendChild(dot);

    const badge = document.createElement("span");
    badge.className = "cm-live-code-badge";
    badge.textContent = this.lang ? this.lang.toUpperCase() : "CODE";
    left.appendChild(badge);

    bar.appendChild(left);
    bar.appendChild(createCopyButton(this.codeContent));

    return bar;
  }

  ignoreEvent(event: Event) {
    if ((event.target as HTMLElement)?.closest(".cm-live-code-copy-btn")) {
      return true;
    }
    return false;
  }
}

// 2e. Code Copy Button Widget (for active header line)
class CodeCopyBtnWidget extends WidgetType {
  readonly locale = i18n.locale;
  constructor(readonly codeContent: string) {
    super();
  }

  eq(other: CodeCopyBtnWidget) {
    return this.codeContent === other.codeContent && this.locale === other.locale;
  }

  toDOM(): HTMLElement {
    return createCopyButton(this.codeContent);
  }

  ignoreEvent(event: Event) {
    if ((event.target as HTMLElement)?.closest(".cm-live-code-copy-btn")) {
      return true;
    }
    return false;
  }
}

// 2f. Table Parsing & Real HTML Table Widget
interface TableColumn {
  title: string;
  align: "left" | "center" | "right";
}

interface ParsedTable {
  columns: TableColumn[];
  rows: string[][];
  rowLineOffsets: number[];
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCellHTML(raw: string): string {
  let escaped = escapeHTML(raw);

  // Secrets: 🔒[enc:v1:...]
  escaped = escaped.replace(
    /🔒\[enc:v1:[^\]]+\]/g,
    `<span class="cm-live-secret-pill" title="${escapeHTML(t("secret_pill.badge_title"))}"><span class="cm-live-secret-icon">🔒</span> ${escapeHTML(t("live_editor.secret_pill_label"))}</span>`
  );

  // Inline code: `code`
  escaped = escaped.replace(/`([^`]+)`/g, `<code class="cm-live-inline-code">$1</code>`);

  // Wikilinks: [[target|label]] or [[target]]
  escaped = escaped.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (_m, target, label) => `<span class="cm-live-wikilink" data-target="${target}" title="${escapeHTML(t("live_editor.open_link_tooltip", { target }))}">${label}</span>`);
  escaped = escaped.replace(/\[\[([^\]]+)\]\]/g, (_m, target) => `<span class="cm-live-wikilink" data-target="${target}" title="${escapeHTML(t("live_editor.open_link_tooltip", { target }))}">${target}</span>`);

  // Markdown links: [label](url)
  escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" class="cm-live-link" target="_blank" rel="noopener">$1</a>`);

  // Bold: **text**
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, `<strong>$1</strong>`);

  // Italic: *text*
  escaped = escaped.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, `<em>$1</em>`);

  // Strikethrough: ~~text~~
  escaped = escaped.replace(/~~([^~]+)~~/g, `<del>$1</del>`);

  return escaped;
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);

  const cells: string[] = [];
  let current = "";
  let inCode = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "\\" && i + 1 < trimmed.length && trimmed[i + 1] === "|") {
      current += "|";
      i++;
    } else if (ch === "`") {
      inCode = !inCode;
      current += ch;
    } else if (ch === "|" && !inCode) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseMarkdownTable(raw: string): ParsedTable {
  const lines = raw.split(/\r?\n/);
  const rows: string[][] = [];
  const lineOffsets: number[] = [];

  let headerLineIndex = -1;
  let delimLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("|") || trimmed.includes("|")) {
      if (headerLineIndex === -1) {
        headerLineIndex = i;
      } else if (delimLineIndex === -1) {
        if (/^\|?[\s\-:|]+\|?$/.test(trimmed) && trimmed.includes("-")) {
          delimLineIndex = i;
        }
      }
    }
  }

  if (headerLineIndex === -1 || delimLineIndex === -1) {
    return { columns: [], rows: [], rowLineOffsets: [] };
  }

  const headerCells = splitTableRow(lines[headerLineIndex]);
  const delimCells = splitTableRow(lines[delimLineIndex]);

  const columns: TableColumn[] = headerCells.map((title, idx) => {
    const delim = (delimCells[idx] || "").trim();
    let align: "left" | "center" | "right" = "left";
    if (delim.startsWith(":") && delim.endsWith(":")) {
      align = "center";
    } else if (delim.endsWith(":")) {
      align = "right";
    }
    return { title, align };
  });

  let curOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    if (i > delimLineIndex) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith("|") || trimmed.includes("|")) {
        const cells = splitTableRow(lines[i]);
        while (cells.length < columns.length) cells.push("");
        rows.push(cells.slice(0, columns.length));
        lineOffsets.push(curOffset);
      }
    }
    curOffset += lines[i].length + 1;
  }

  return { columns, rows, rowLineOffsets: lineOffsets };
}

class LiveTableWidget extends WidgetType {
  readonly locale = i18n.locale;
  constructor(
    readonly rawMarkdown: string,
    readonly tableFrom: number,
    readonly parsed: ParsedTable,
    readonly options: LivePreviewOptions
  ) {
    super();
  }

  eq(other: LiveTableWidget) {
    return this.rawMarkdown === other.rawMarkdown && this.tableFrom === other.tableFrom && this.locale === other.locale;
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement("div");
    container.className = "cm-live-table-container";

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "cm-live-table-toolbar";

    const badge = document.createElement("div");
    badge.className = "cm-live-table-badge";
    badge.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg><span>${escapeHTML(t("live_editor.table_badge", { count: this.parsed.rows.length }))}</span>`;

    const editBtn = document.createElement("button");
    editBtn.className = "cm-live-table-edit-btn";
    editBtn.type = "button";
    editBtn.title = t("live_editor.edit_table_tooltip");
    editBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg><span>${escapeHTML(t("common.edit"))}</span>`;

    toolbar.appendChild(badge);
    toolbar.appendChild(editBtn);
    container.appendChild(toolbar);

    // Scroll wrapper & Table
    const scrollWrap = document.createElement("div");
    scrollWrap.className = "cm-live-table-scroll-wrapper";

    const table = document.createElement("table");
    table.className = "cm-live-table";

    const thead = document.createElement("thead");
    const headerTr = document.createElement("tr");
    for (const col of this.parsed.columns) {
      const th = document.createElement("th");
      th.style.textAlign = col.align;
      th.innerHTML = formatCellHTML(col.title);
      headerTr.appendChild(th);
    }
    thead.appendChild(headerTr);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let rIdx = 0; rIdx < this.parsed.rows.length; rIdx++) {
      const row = this.parsed.rows[rIdx];
      const tr = document.createElement("tr");
      tr.dataset.rowIdx = String(rIdx);

      for (let cIdx = 0; cIdx < this.parsed.columns.length; cIdx++) {
        const td = document.createElement("td");
        const col = this.parsed.columns[cIdx];
        td.style.textAlign = col.align;
        const cellText = row[cIdx] || "";
        td.innerHTML = formatCellHTML(cellText);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scrollWrap.appendChild(table);
    container.appendChild(scrollWrap);

    // Interactive click: wikilinks or edit mode jump
    container.addEventListener("click", (e) => {
      const target = e.target as HTMLElement | null;

      const wikilink = target?.closest(".cm-live-wikilink") as HTMLElement | null;
      if (wikilink && wikilink.dataset.target) {
        e.stopPropagation();
        e.preventDefault();
        this.options.onOpenNote?.(wikilink.dataset.target);
        return;
      }

      const link = target?.closest("a") as HTMLAnchorElement | null;
      if (link) {
        return;
      }

      e.stopPropagation();
      e.preventDefault();

      let targetPos = this.tableFrom;
      const tr = target?.closest("tr") as HTMLElement | null;
      if (tr && tr.dataset.rowIdx !== undefined) {
        const rowIdx = parseInt(tr.dataset.rowIdx, 10);
        if (this.parsed.rowLineOffsets[rowIdx] !== undefined) {
          targetPos = Math.min(this.tableFrom + this.parsed.rowLineOffsets[rowIdx], view.state.doc.length);
        }
      }

      view.dispatch({
        selection: { anchor: targetPos },
        scrollIntoView: true,
      });
      view.focus();
    });

    return container;
  }

  ignoreEvent(event: Event): boolean {
    return true;
  }
}

function buildTableDecos(state: EditorState, options: LivePreviewOptions): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const sel = state.selection.main;

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === "Table") {
        const isCursorInTable = selectionIntersects(sel.from, sel.to, node.from, node.to);
        if (!isCursorInTable) {
          const rawMarkdown = state.sliceDoc(node.from, node.to);
          const parsed = parseMarkdownTable(rawMarkdown);
          if (parsed.columns.length > 0) {
            const lineFrom = state.doc.lineAt(node.from);
            const lineTo = state.doc.lineAt(node.to);
            decos.push(
              Decoration.replace({
                widget: new LiveTableWidget(rawMarkdown, lineFrom.from, parsed, options),
                block: true,
              }).range(lineFrom.from, lineTo.to)
            );
          }
        }
        return false;
      }
    },
  });

  return Decoration.set(decos);
}

export function createLiveTableField(options: LivePreviewOptions) {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildTableDecos(state, options);
    },
    update(decos, tr) {
      if (tr.docChanged || tr.selection) {
        return buildTableDecos(tr.state, options);
      }
      return decos;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

// 3. Secret Pill Widget for 🔒[enc:v1:...]
class SecretWidget extends WidgetType {
  private svelteInstance: any = null;

  constructor(
    readonly token: string,
    readonly onPassphraseNeeded?: () => Promise<string | null>
  ) {
    super();
  }

  eq(other: SecretWidget) {
    return this.token === other.token;
  }

  toDOM(): HTMLElement {
    const container = document.createElement("span");
    container.className = "cm-live-secret-mount";
    container.setAttribute("data-token", this.token);

    try {
      this.svelteInstance = mount(SecretPill, {
        target: container,
        props: {
          token: this.token,
          onPassphraseNeeded: () => (this.onPassphraseNeeded ? this.onPassphraseNeeded() : Promise.resolve(null)),
        },
      });
    } catch (e) {
      console.error("Failed to mount SecretPill in CodeMirror:", e);
    }

    return container;
  }

  destroy() {
    if (this.svelteInstance) {
      try {
        unmount(this.svelteInstance);
      } catch {}
      this.svelteInstance = null;
    }
  }

  ignoreEvent() {
    return false;
  }
}

// 4. Wikilink Widget
class WikilinkWidget extends WidgetType {
  readonly locale = i18n.locale;
  constructor(
    readonly target: string,
    readonly label: string,
    readonly onOpenNote?: (target: string) => void
  ) {
    super();
  }

  eq(other: WikilinkWidget) {
    return this.target === other.target && this.label === other.label && this.locale === other.locale;
  }

  toDOM(): HTMLElement {
    const a = document.createElement("span");
    a.className = "cm-live-wikilink";
    a.textContent = this.label;
    a.title = t("live_editor.open_link_tooltip", { target: this.target });
    a.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onOpenNote?.(this.target);
    };
    return a;
  }

  ignoreEvent() {
    return false;
  }
}

// Helper to determine if range overlaps with selection
function selectionIntersects(selFrom: number, selTo: number, rangeFrom: number, rangeTo: number): boolean {
  return selFrom <= rangeTo && selTo >= rangeFrom;
}

// StateField for block-level frontmatter concealing (ViewPlugin cannot replace line breaks)
export const hideFrontmatterField = StateField.define<DecorationSet>({
  create(state) {
    const headDoc = state.doc.sliceString(0, Math.min(state.doc.length, 5000));
    const fmMatch = headDoc.match(/^---\r?\n([\s\S]*?\r?\n---\r?\n?)/);
    if (!fmMatch) return Decoration.none;
    const fmEnd = fmMatch[0].length;
    return Decoration.set([
      Decoration.replace({ block: true }).range(0, fmEnd),
    ]);
  },
  update(decos, tr) {
    if (!tr.docChanged) return decos;
    const headDoc = tr.newDoc.sliceString(0, Math.min(tr.newDoc.length, 5000));
    const fmMatch = headDoc.match(/^---\r?\n([\s\S]*?\r?\n---\r?\n?)/);
    if (!fmMatch) return Decoration.none;
    const fmEnd = fmMatch[0].length;
    return Decoration.set([
      Decoration.replace({ block: true }).range(0, fmEnd),
    ]);
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function createLivePreviewPlugin(options: LivePreviewOptions): Extension {
  return [
    hideFrontmatterField,
    createLiveTableField(options),
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;

        constructor(view: EditorView) {
          this.decorations = this.buildDecorations(view);
        }

        update(update: ViewUpdate) {
          if (update.docChanged || update.selectionSet || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
          }
        }

        buildDecorations(view: EditorView): DecorationSet {
          const builder = new RangeSetBuilder<Decoration>();
          const { state } = view;
          const tree = syntaxTree(state);
          const sel = state.selection.main;
          const curLine = state.doc.lineAt(sel.head).number;

          // Collect all ranges and sort them properly before feeding RangeSetBuilder
          const allDecos: Array<{ from: number; to: number; deco: Decoration }> = [];
          const lineDecorations = new Map<number, Set<string>>();

          const addLineClass = (lineStart: number, className: string) => {
            let set = lineDecorations.get(lineStart);
            if (!set) {
              set = new Set();
              lineDecorations.set(lineStart, set);
            }
            for (const c of className.split(" ")) {
              if (c) set.add(c);
            }
          };

          // Detect YAML Frontmatter at document start to skip its nodes in tree iteration
          const headDoc = state.doc.sliceString(0, Math.min(state.doc.length, 5000));
          const fmMatch = headDoc.match(/^---\r?\n([\s\S]*?\r?\n---\r?\n?)/);
          const fmEnd = fmMatch ? fmMatch[0].length : 0;

        for (const { from, to } of view.visibleRanges) {
          tree.iterate({
            from,
            to,
            enter(node) {
              const name = node.name;
              const nFrom = node.from;
              const nTo = node.to;

              // Ignore nodes inside frontmatter (so --- is not treated as HR, and YAML as SetextHeading)
              if (fmEnd > 0 && nTo <= fmEnd) {
                return;
              }

              // Check if cursor line matches
              const nodeLine = state.doc.lineAt(nFrom).number;
              const isCursorOnLine = nodeLine === curLine;
              const isCursorInNode = selectionIntersects(sel.from, sel.to, nFrom, nTo);

              // 1. Headings (ATXHeading1 .. ATXHeading6)
              if (name.startsWith("ATXHeading")) {
                const level = name.slice(10);
                const lineStart = state.doc.lineAt(nFrom).from;
                addLineClass(lineStart, `cm-live-h${level}`);

                // Find HeaderMark child
                const mark = node.node.firstChild;
                if (mark && mark.name === "HeaderMark") {
                  if (!isCursorOnLine) {
                    // Hide the header marker and trailing space
                    const hideTo = Math.min(state.doc.length, mark.to + 1);
                    allDecos.push({
                      from: mark.from,
                      to: hideTo,
                      deco: Decoration.replace({}),
                    });
                  } else {
                    allDecos.push({
                      from: mark.from,
                      to: mark.to,
                      deco: Decoration.mark({ class: "cm-live-syntax-mark" }),
                    });
                  }
                }
              }

              // 2. Fenced Code Blocks (```lang ... ```)
              else if (name === "FencedCode") {
                const firstLine = state.doc.lineAt(nFrom);
                const lastLine = state.doc.lineAt(nTo);

                // Language
                const langNode = node.node.getChild("CodeInfo");
                const lang = langNode ? state.sliceDoc(langNode.from, langNode.to).trim() : "";

                // Code text
                const codeTextNode = node.node.getChild("CodeText");
                const codeContent = codeTextNode ? state.sliceDoc(codeTextNode.from, codeTextNode.to) : "";

                if (firstLine.number === lastLine.number) {
                  addLineClass(firstLine.from, "cm-live-code-line cm-live-code-single");
                  return false;
                }

                // 2a. Opening Header line
                if (curLine === firstLine.number) {
                  addLineClass(firstLine.from, "cm-live-code-line cm-live-code-first cm-live-code-header-active");
                  const openMark = node.node.firstChild;
                  if (openMark && openMark.name === "CodeMark") {
                    allDecos.push({
                      from: openMark.from,
                      to: openMark.to,
                      deco: Decoration.mark({ class: "cm-live-syntax-mark" }),
                    });
                  }
                  if (langNode) {
                    allDecos.push({
                      from: langNode.from,
                      to: langNode.to,
                      deco: Decoration.mark({ class: "cm-live-code-badge-inline" }),
                    });
                  }
                  allDecos.push({
                    from: firstLine.to,
                    to: firstLine.to,
                    deco: Decoration.widget({
                      widget: new CodeCopyBtnWidget(codeContent),
                      side: 1,
                    }),
                  });
                } else {
                  addLineClass(firstLine.from, "cm-live-code-line cm-live-code-first");
                  allDecos.push({
                    from: firstLine.from,
                    to: firstLine.to,
                    deco: Decoration.replace({
                      widget: new CodeHeaderWidget(lang, codeContent),
                    }),
                  });
                }

                // 2b. Body lines
                for (let l = firstLine.number + 1; l < lastLine.number; l++) {
                  const line = state.doc.line(l);
                  addLineClass(line.from, "cm-live-code-line");
                }

                // 2c. Footer line
                if (curLine === lastLine.number) {
                  addLineClass(lastLine.from, "cm-live-code-line cm-live-code-last-active");
                  const closeMark = node.node.lastChild;
                  if (closeMark && closeMark.name === "CodeMark") {
                    allDecos.push({
                      from: closeMark.from,
                      to: closeMark.to,
                      deco: Decoration.mark({ class: "cm-live-syntax-mark" }),
                    });
                  }
                } else {
                  addLineClass(lastLine.from, "cm-live-code-line cm-live-code-last");
                  allDecos.push({
                    from: lastLine.from,
                    to: lastLine.to,
                    deco: Decoration.replace({}),
                  });
                }

                return false;
              }

              // 3. Tables
              else if (name === "Table") {
                const isCursorInTable = selectionIntersects(sel.from, sel.to, nFrom, nTo);
                if (!isCursorInTable) {
                  // Rendered as HTML Table widget via createLiveTableField
                  return false;
                }
                const firstLine = state.doc.lineAt(nFrom);
                const lastLine = state.doc.lineAt(nTo);
                for (let l = firstLine.number; l <= lastLine.number; l++) {
                  addLineClass(state.doc.line(l).from, "cm-live-table-raw-line");
                }
              }
              else if (name === "TableHeader" || name === "TableRow") {
                // Descend into TableDelimiter / TableCell
              }
              else if (name === "TableDelimiter") {
                allDecos.push({
                  from: nFrom,
                  to: nTo,
                  deco: Decoration.mark({ class: "cm-live-table-pipe" }),
                });
              }

              // 4. Lists (Bullet, Ordered, and Task lists)
              else if (name === "ListItem") {
                const line = state.doc.lineAt(nFrom);
                addLineClass(line.from, "cm-live-list-item");
              }
              else if (name === "ListMark") {
                const parent = node.node.parent;
                const grandParent = parent?.parent;
                const listType = grandParent?.name; // "BulletList" or "OrderedList"
                const hasTask = parent?.getChild("Task") !== null;
                const line = state.doc.lineAt(nFrom);
                const isCursorOnMarkLine = line.number === curLine;

                if (hasTask) {
                  if (!isCursorOnMarkLine) {
                    // Hide list mark before task checkbox
                    const hideTo = state.sliceDoc(nTo, nTo + 1) === " " ? nTo + 1 : nTo;
                    allDecos.push({
                      from: nFrom,
                      to: hideTo,
                      deco: Decoration.replace({}),
                    });
                  } else {
                    allDecos.push({
                      from: nFrom,
                      to: nTo,
                      deco: Decoration.mark({ class: "cm-live-syntax-mark" }),
                    });
                  }
                } else if (listType === "OrderedList") {
                  if (!isCursorOnMarkLine) {
                    allDecos.push({
                      from: nFrom,
                      to: nTo,
                      deco: Decoration.mark({ class: "cm-live-ordered-mark" }),
                    });
                  } else {
                    allDecos.push({
                      from: nFrom,
                      to: nTo,
                      deco: Decoration.mark({ class: "cm-live-syntax-mark" }),
                    });
                  }
                } else {
                  // BulletList
                  if (!isCursorOnMarkLine) {
                    allDecos.push({
                      from: nFrom,
                      to: nTo,
                      deco: Decoration.replace({
                        widget: new BulletWidget(),
                      }),
                    });
                  } else {
                    allDecos.push({
                      from: nFrom,
                      to: nTo,
                      deco: Decoration.mark({ class: "cm-live-syntax-mark" }),
                    });
                  }
                }
              }

              // 5. StrongEmphasis (**bold** or __bold__)
              else if (name === "StrongEmphasis") {
                const mark1 = node.node.firstChild;
                const mark2 = node.node.lastChild;
                if (mark1 && mark2 && mark1 !== mark2) {
                  if (!isCursorInNode) {
                    allDecos.push({ from: mark1.from, to: mark1.to, deco: Decoration.replace({}) });
                    allDecos.push({
                      from: mark1.to,
                      to: mark2.from,
                      deco: Decoration.mark({ class: "cm-live-strong" }),
                    });
                    allDecos.push({ from: mark2.from, to: mark2.to, deco: Decoration.replace({}) });
                  } else {
                    allDecos.push({
                      from: mark1.from,
                      to: mark1.to,
                      deco: Decoration.mark({ class: "cm-live-syntax-mark" }),
                    });
                    allDecos.push({
                      from: mark2.from,
                      to: mark2.to,
                      deco: Decoration.mark({ class: "cm-live-syntax-mark" }),
                    });
                  }
                }
              }

              // 6. Emphasis (*italic* or _italic_)
              else if (name === "Emphasis") {
                const mark1 = node.node.firstChild;
                const mark2 = node.node.lastChild;
                if (mark1 && mark2 && mark1 !== mark2) {
                  if (!isCursorInNode) {
                    allDecos.push({ from: mark1.from, to: mark1.to, deco: Decoration.replace({}) });
                    allDecos.push({
                      from: mark1.to,
                      to: mark2.from,
                      deco: Decoration.mark({ class: "cm-live-em" }),
                    });
                    allDecos.push({ from: mark2.from, to: mark2.to, deco: Decoration.replace({}) });
                  } else {
                    allDecos.push({
                      from: mark1.from,
                      to: mark1.to,
                      deco: Decoration.mark({ class: "cm-live-syntax-mark" }),
                    });
                    allDecos.push({
                      from: mark2.from,
                      to: mark2.to,
                      deco: Decoration.mark({ class: "cm-live-syntax-mark" }),
                    });
                  }
                }
              }

              // 7. Strikethrough (~~strike~~)
              else if (name === "Strikethrough") {
                const mark1 = node.node.firstChild;
                const mark2 = node.node.lastChild;
                if (mark1 && mark2 && mark1 !== mark2) {
                  if (!isCursorInNode) {
                    allDecos.push({ from: mark1.from, to: mark1.to, deco: Decoration.replace({}) });
                    allDecos.push({
                      from: mark1.to,
                      to: mark2.from,
                      deco: Decoration.mark({ class: "cm-live-strike" }),
                    });
                    allDecos.push({ from: mark2.from, to: mark2.to, deco: Decoration.replace({}) });
                  }
                }
              }

              // 8. InlineCode (`code`) or Secret (`🔒[enc:v1:...]`)
              else if (name === "InlineCode") {
                const text = state.sliceDoc(nFrom, nTo);
                // Check if this inline code is an encrypted secret
                const secretMatch = text.match(/^`?(🔒\[enc:v1:[^\]]+\])`?$/);
                if (secretMatch) {
                  const token = secretMatch[1];
                  allDecos.push({
                    from: nFrom,
                    to: nTo,
                    deco: Decoration.replace({
                      widget: new SecretWidget(token, options.onPassphraseNeeded),
                    }),
                  });
                  return;
                }

                // Normal inline code
                const mark1 = node.node.firstChild;
                const mark2 = node.node.lastChild;
                if (mark1 && mark2 && mark1 !== mark2) {
                  if (!isCursorInNode) {
                    allDecos.push({ from: mark1.from, to: mark1.to, deco: Decoration.replace({}) });
                    allDecos.push({
                      from: mark1.to,
                      to: mark2.from,
                      deco: Decoration.mark({ class: "cm-live-inline-code" }),
                    });
                    allDecos.push({ from: mark2.from, to: mark2.to, deco: Decoration.replace({}) });
                  }
                }
              }

              // 9. TaskMarker ([ ] or [x])
              else if (name === "TaskMarker") {
                const text = state.sliceDoc(nFrom, nTo);
                const isChecked = text.toLowerCase().includes("x");
                allDecos.push({
                  from: nFrom,
                  to: nTo,
                  deco: Decoration.replace({
                    widget: new TaskCheckboxWidget(isChecked, nFrom, text.length),
                  }),
                });
              }

              // 10. HorizontalRule (---)
              else if (name === "HorizontalRule") {
                if (!isCursorOnLine) {
                  allDecos.push({
                    from: nFrom,
                    to: nTo,
                    deco: Decoration.replace({
                      widget: new HorizontalRuleWidget(),
                    }),
                  });
                }
              }

              // 11. Blockquote (>)
              else if (name === "Blockquote") {
                const lineStart = state.doc.lineAt(nFrom).from;
                addLineClass(lineStart, "cm-live-quote");
              }
            },
          });

          // Check for Wikilinks: [[Target|Label]] or [[Target]]
          const viewDoc = state.sliceDoc(from, to);
          const wikiRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
          let match: RegExpExecArray | null;
          while ((match = wikiRegex.exec(viewDoc)) !== null) {
            const start = from + match.index;
            const end = start + match[0].length;
            const target = match[1].trim();
            const label = (match[2] || match[1]).trim();
            const isCursorInWiki = selectionIntersects(sel.from, sel.to, start, end);

            if (!isCursorInWiki) {
              allDecos.push({
                from: start,
                to: end,
                deco: Decoration.replace({
                  widget: new WikilinkWidget(target, label, options.onOpenNote),
                }),
              });
            }
          }

          // Check for raw secret strings outside inline code (e.g. 🔒[enc:v1:...])
          const rawSecretRegex = /(?<!`)🔒\[enc:v1:[^\]]+\](?!`)/g;
          while ((match = rawSecretRegex.exec(viewDoc)) !== null) {
            const start = from + match.index;
            const end = start + match[0].length;
            const token = match[0];
            allDecos.push({
              from: start,
              to: end,
              deco: Decoration.replace({
                widget: new SecretWidget(token, options.onPassphraseNeeded),
              }),
            });
          }
        }

        // Add merged line decorations
        for (const [lineStart, classes] of lineDecorations.entries()) {
          allDecos.push({
            from: lineStart,
            to: lineStart,
            deco: Decoration.line({ class: Array.from(classes).join(" ") }),
          });
        }

        // Sort all decorations strictly by from ascending, then startSide, then to
        allDecos.sort((a, b) => {
          if (a.from !== b.from) return a.from - b.from;
          if (a.deco.startSide !== b.deco.startSide) return a.deco.startSide - b.deco.startSide;
          return a.to - b.to;
        });

        // Filter out overlapping replacements (CodeMirror throws error if replacements overlap)
        let lastReplaceTo = -1;
        for (const d of allDecos) {
          const isLine = d.from === d.to && d.deco.startSide < 0;
          const isPoint = Boolean((d.deco as any).point || (d.deco as any).isReplace || (d.deco.spec && d.deco.spec.widget));

          if (!isLine && d.from < lastReplaceTo) {
            continue;
          }

          if (d.to <= state.doc.length) {
            builder.add(d.from, d.to, d.deco);
            if (isPoint) {
              lastReplaceTo = Math.max(lastReplaceTo, d.to);
            }
          }
        }

        return builder.finish();
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  ),
];
}
