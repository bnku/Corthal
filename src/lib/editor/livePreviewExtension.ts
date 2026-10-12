import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { RangeSetBuilder, type Range } from "@codemirror/state";
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

export function createLivePreviewPlugin(options: LivePreviewOptions) {
  return ViewPlugin.fromClass(
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

        // Detect YAML Frontmatter at document start
        const headDoc = state.doc.sliceString(0, Math.min(state.doc.length, 5000));
        const fmMatch = headDoc.match(/^---\r?\n([\s\S]*?\r?\n---\r?\n?)/);
        const fmEnd = fmMatch ? fmMatch[0].length : 0;

        if (fmEnd > 0) {
          allDecos.push({
            from: 0,
            to: fmEnd,
            deco: Decoration.replace({}),
          });
        }

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
                allDecos.push({
                  from: lineStart,
                  to: lineStart,
                  deco: Decoration.line({ class: `cm-live-h${level}` }),
                });

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

              // 2. StrongEmphasis (**bold** or __bold__)
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

              // 3. Emphasis (*italic* or _italic_)
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

              // 4. Strikethrough (~~strike~~)
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

              // 5. InlineCode (`code`) or Secret (`🔒[enc:v1:...]`)
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

              // 6. TaskMarker ([ ] or [x])
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

              // 7. HorizontalRule (---)
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

              // 8. Blockquote (>)
              else if (name === "Blockquote") {
                const lineStart = state.doc.lineAt(nFrom).from;
                allDecos.push({
                  from: lineStart,
                  to: lineStart,
                  deco: Decoration.line({ class: "cm-live-quote" }),
                });
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
  );
}
