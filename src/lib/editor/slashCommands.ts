export interface SlashCommandItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  template: string;
  cursorOffset?: number; // relative to insertion start
  requiresSecretModal?: boolean;
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: "h1",
    title: "Заголовок 1",
    description: "Крупный заголовок верхнего уровня",
    icon: "heading-1",
    template: "# ",
  },
  {
    id: "h2",
    title: "Заголовок 2",
    description: "Средний заголовок раздела",
    icon: "heading-2",
    template: "## ",
  },
  {
    id: "h3",
    title: "Заголовок 3",
    description: "Подзаголовок подраздела",
    icon: "heading-3",
    template: "### ",
  },
  {
    id: "todo",
    title: "Список задач",
    description: "Интерактивный чекбокс с галочкой",
    icon: "check-square",
    template: "- [ ] ",
  },
  {
    id: "bullet",
    title: "Маркированный список",
    description: "Простой точечный список",
    icon: "list",
    template: "- ",
  },
  {
    id: "numbered",
    title: "Нумерованный список",
    description: "Порядковый список с номерами",
    icon: "list-ordered",
    template: "1. ",
  },
  {
    id: "quote",
    title: "Цитата",
    description: "Выделенная блок-цитата",
    icon: "quote",
    template: "> ",
  },
  {
    id: "code",
    title: "Блок кода",
    description: "Блок исходного кода с подсветкой",
    icon: "code",
    template: "```\n\n```",
    cursorOffset: 4,
  },
  {
    id: "table",
    title: "Таблица",
    description: "Таблица Markdown с заголовками",
    icon: "table",
    template: "| Колонка 1 | Колонка 2 |\n|-----------|-----------|\n| Текст     | Значение  |\n",
  },
  {
    id: "divider",
    title: "Разделитель",
    description: "Горизонтальная черта",
    icon: "minus",
    template: "\n---\n\n",
  },
  {
    id: "secret",
    title: "Зашифрованный секрет",
    description: "Вставить пароль или токен через SSH-ключ",
    icon: "lock",
    template: "",
    requiresSecretModal: true,
  },
];
