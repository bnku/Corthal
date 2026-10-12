import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder, type Range, type Extension, StateField } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { mount, unmount } from "svelte";
import SecretPill from "$lib/components/SecretPill.svelte";

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

// 2c. Table Divider Widget for markdown table header delimiter
class TableDividerWidget extends WidgetType {
  toDOM(): HTMLElement {
    const el = document.createElement("div");
    el.className = "cm-live-table-divider";
    return el;
  }
}

// 2d. Code Header Widget for fenced code blocks
class CodeHeaderWidget extends WidgetType {
  constructor(readonly lang: string, readonly codeContent: string) {
    super();
  }

  eq(other: CodeHeaderWidget) {
    return this.lang === other.lang && this.codeContent === other.codeContent;
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

    const copyBtn = document.createElement("button");
    copyBtn.className = "cm-live-code-copy-btn";
    copyBtn.type = "button";
    copyBtn.title = "Копировать код";
    copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>Копировать</span>`;
    const doCopy = async (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(this.codeContent);
        } else {
          const textarea = document.createElement("textarea");
          textarea.value = this.codeContent;
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        }
        copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span style="color:#22c55e">Скопировано</span>`;
        setTimeout(() => {
          copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg><span>Копировать</span>`;
        }, 1500);
      } catch (err) {
        console.error("Failed to copy code:", err);
      }
    };
    copyBtn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    copyBtn.addEventListener("click", doCopy);
    bar.appendChild(copyBtn);

    return bar;
  }

  ignoreEvent(event: Event) {
    if ((event.target as HTMLElement)?.closest(".cm-live-code-copy-btn")) {
      return true;
    }
    return false;
  }
}

// 2e. Code Footer Widget for fenced code blocks
class CodeFooterWidget extends WidgetType {
  toDOM(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "cm-live-code-footer-bar";
    return bar;
  }
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
  constructor(
    readonly target: string,
    readonly label: string,
    readonly onOpenNote?: (target: string) => void
  ) {
    super();
  }

  eq(other: WikilinkWidget) {
    return this.target === other.target && this.label === other.label;
  }

  toDOM(): HTMLElement {
    const a = document.createElement("span");
    a.className = "cm-live-wikilink";
    a.textContent = this.label;
    a.title = `Открыть: ${this.target}`;
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
                  addLineClass(firstLine.from, "cm-live-code-line");
                  return false;
                }

                // 2a. Opening Header line
                if (curLine === firstLine.number) {
                  addLineClass(firstLine.from, "cm-live-code-header-active");
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
                      deco: Decoration.mark({ class: "cm-live-code-badge" }),
                    });
                  }
                } else {
                  addLineClass(firstLine.from, "cm-live-code-header");
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
                  addLineClass(lastLine.from, "cm-live-code-footer-active");
                  const closeMark = node.node.lastChild;
                  if (closeMark && closeMark.name === "CodeMark") {
                    allDecos.push({
                      from: closeMark.from,
                      to: closeMark.to,
                      deco: Decoration.mark({ class: "cm-live-syntax-mark" }),
                    });
                  }
                } else {
                  addLineClass(lastLine.from, "cm-live-code-footer");
                  allDecos.push({
                    from: lastLine.from,
                    to: lastLine.to,
                    deco: Decoration.replace({
                      widget: new CodeFooterWidget(),
                    }),
                  });
                }

                return false;
              }

              // 3. Tables
              else if (name === "Table") {
                // descend into rows
              }
              else if (name === "TableHeader") {
                const line = state.doc.lineAt(nFrom);
                addLineClass(line.from, "cm-live-table-header");
              }
              else if (name === "TableRow") {
                const line = state.doc.lineAt(nFrom);
                const isLastRow = node.node.nextSibling === null || node.node.nextSibling.name !== "TableRow";
                if (isLastRow) {
                  addLineClass(line.from, "cm-live-table-row cm-live-table-row-last");
                } else {
                  addLineClass(line.from, "cm-live-table-row");
                }
              }
              else if (name === "TableDelimiter") {
                const parentName = node.node.parent?.name;
                if (parentName === "Table") {
                  // Delimiter row (| --- | --- |)
                  const line = state.doc.lineAt(nFrom);
                  const isCursorOnDelim = line.number === curLine;
                  if (!isCursorOnDelim) {
                    addLineClass(line.from, "cm-live-table-delimiter-line");
                    allDecos.push({
                      from: nFrom,
                      to: nTo,
                      deco: Decoration.replace({
                        widget: new TableDividerWidget(),
                      }),
                    });
                  } else {
                    addLineClass(line.from, "cm-live-table-delimiter-active");
                    allDecos.push({
                      from: nFrom,
                      to: nTo,
                      deco: Decoration.mark({ class: "cm-live-syntax-mark" }),
                    });
                  }
                  return false;
                } else if (parentName === "TableHeader" || parentName === "TableRow") {
                  allDecos.push({
                    from: nFrom,
                    to: nTo,
                    deco: Decoration.mark({ class: "cm-live-table-pipe" }),
                  });
                }
              }
              else if (name === "TableCell") {
                const parentName = node.node.parent?.name;
                if (parentName === "TableHeader") {
                  allDecos.push({
                    from: nFrom,
                    to: nTo,
                    deco: Decoration.mark({ class: "cm-live-table-header-cell" }),
                  });
                } else {
                  allDecos.push({
                    from: nFrom,
                    to: nTo,
                    deco: Decoration.mark({ class: "cm-live-table-cell" }),
                  });
                }
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
