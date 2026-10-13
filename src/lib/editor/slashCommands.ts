import { t } from "$lib/i18n";

export interface SlashCommandItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  template: string;
  cursorOffset?: number; // relative to insertion start
  requiresSecretModal?: boolean;
}

const COMMAND_DEFS: Omit<SlashCommandItem, "title" | "description">[] = [
  { id: "h1", icon: "heading-1", template: "# " },
  { id: "h2", icon: "heading-2", template: "## " },
  { id: "h3", icon: "heading-3", template: "### " },
  { id: "todo", icon: "check-square", template: "- [ ] " },
  { id: "bullet", icon: "list", template: "- " },
  { id: "numbered", icon: "list-ordered", template: "1. " },
  { id: "quote", icon: "quote", template: "> " },
  { id: "code", icon: "code", template: "```\n\n```", cursorOffset: 4 },
  {
    id: "table",
    icon: "table",
    template: "| Колонка 1 | Колонка 2 |\n|-----------|-----------|\n| Текст     | Значение  |\n",
  },
  { id: "divider", icon: "minus", template: "\n---\n\n" },
  { id: "secret", icon: "lock", template: "", requiresSecretModal: true },
];

export const SLASH_COMMANDS: SlashCommandItem[] = COMMAND_DEFS.map((cmd) => {
  return {
    ...cmd,
    get title(): string {
      return t(`live_editor.commands.${cmd.id}_title`);
    },
    get description(): string {
      return t(`live_editor.commands.${cmd.id}_desc`);
    },
  };
});
