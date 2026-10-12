import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export const cortexEditorTheme = EditorView.theme({
  "&": {
    color: "var(--cortex-fg-primary, #e2e8f0)",
    backgroundColor: "transparent",
    fontSize: "15px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
    height: "100%",
  },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "1.75",
    overflow: "auto",
  },
  ".cm-content": {
    padding: "16px 28px 120px 28px",
    caretColor: "var(--cortex-accent, #38bdf8)",
    maxWidth: "880px",
    margin: "0 auto",
  },
  "&.cm-focused": {
    outline: "none",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--cortex-accent, #38bdf8)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "rgba(56, 189, 248, 0.25) !important",
  },
  ".cm-activeLine": {
    backgroundColor: "rgba(255, 255, 255, 0.02)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--cortex-fg-muted, #64748b)",
    border: "none",
    paddingRight: "8px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    fontSize: "12px",
    paddingLeft: "8px",
    minWidth: "30px",
    textAlign: "right",
    opacity: "0.6",
  },
  ".cm-activeLineGutter": {
    color: "var(--cortex-accent, #38bdf8)",
    backgroundColor: "transparent",
    opacity: "1",
    fontWeight: "600",
  },

  /* Live Preview Typography Styles */
  ".cm-live-h1": {
    fontSize: "1.9rem",
    fontWeight: "700",
    color: "var(--cortex-fg-primary, #f8fafc)",
    lineHeight: "1.3",
    marginTop: "20px",
    marginBottom: "10px",
    letterSpacing: "-0.02em",
  },
  ".cm-live-h2": {
    fontSize: "1.5rem",
    fontWeight: "650",
    color: "var(--cortex-fg-primary, #f8fafc)",
    lineHeight: "1.35",
    marginTop: "16px",
    marginBottom: "8px",
    letterSpacing: "-0.01em",
  },
  ".cm-live-h3": {
    fontSize: "1.25rem",
    fontWeight: "600",
    color: "var(--cortex-fg-primary, #f8fafc)",
    lineHeight: "1.4",
    marginTop: "14px",
    marginBottom: "6px",
  },
  ".cm-live-h4": {
    fontSize: "1.1rem",
    fontWeight: "600",
    color: "var(--cortex-fg-primary, #f8fafc)",
    marginTop: "12px",
    marginBottom: "4px",
  },
  ".cm-live-h5, .cm-live-h6": {
    fontSize: "1rem",
    fontWeight: "600",
    color: "var(--cortex-fg-secondary, #94a3b8)",
    marginTop: "10px",
    marginBottom: "4px",
  },
  ".cm-live-strong": {
    fontWeight: "700",
    color: "var(--cortex-fg-primary, #ffffff)",
  },
  ".cm-live-em": {
    fontStyle: "italic",
    color: "var(--cortex-fg-primary, #f1f5f9)",
  },
  ".cm-live-strike": {
    textDecoration: "line-through",
    opacity: "0.6",
  },
  ".cm-live-inline-code": {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    fontSize: "0.88em",
    padding: "2px 6px",
    borderRadius: "4px",
    backgroundColor: "var(--cortex-bg-card, rgba(30, 41, 59, 0.7))",
    color: "var(--cortex-accent, #38bdf8)",
    border: "1px solid var(--cortex-border, rgba(255, 255, 255, 0.1))",
  },
  ".cm-live-fenced-code": {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    fontSize: "0.9em",
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    padding: "0 10px",
  },
  ".cm-live-quote": {
    borderLeft: "3px solid var(--cortex-accent, #38bdf8)",
    paddingLeft: "14px",
    color: "var(--cortex-fg-secondary, #94a3b8)",
    fontStyle: "italic",
  },
  ".cm-live-wikilink": {
    color: "var(--cortex-accent, #38bdf8)",
    textDecoration: "none",
    borderBottom: "1px dashed var(--cortex-accent, #38bdf8)",
    cursor: "pointer",
    transition: "opacity 0.15s",
  },
  ".cm-live-wikilink:hover": {
    opacity: "0.8",
  },
  ".cm-live-link": {
    color: "var(--cortex-accent, #38bdf8)",
    textDecoration: "underline",
    textUnderlineOffset: "3px",
    cursor: "pointer",
  },
  ".cm-live-dim": {
    opacity: "0.35",
    fontSize: "0.85em",
  },
  ".cm-live-syntax-mark": {
    color: "var(--cortex-fg-muted, #64748b)",
    opacity: "0.7",
    fontWeight: "normal",
    userSelect: "none",
  },
});

export const cortexHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, color: "var(--cortex-fg-primary, #ffffff)", fontWeight: "bold" },
  { tag: tags.heading2, color: "var(--cortex-fg-primary, #ffffff)", fontWeight: "bold" },
  { tag: tags.heading3, color: "var(--cortex-fg-primary, #ffffff)", fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.keyword, color: "#c084fc" },
  { tag: tags.atom, color: "#f472b6" },
  { tag: tags.number, color: "#fb923c" },
  { tag: tags.definition(tags.variableName), color: "#38bdf8" },
  { tag: tags.variableName, color: "#e2e8f0" },
  { tag: tags.function(tags.variableName), color: "#60a5fa" },
  { tag: tags.string, color: "#34d399" },
  { tag: tags.comment, color: "#64748b", fontStyle: "italic" },
  { tag: tags.link, color: "#38bdf8", textDecoration: "underline" },
  { tag: tags.meta, color: "#94a3b8" },
]);

export const cortexSyntax = syntaxHighlighting(cortexHighlightStyle);
