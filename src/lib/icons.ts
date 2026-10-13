import { i18n } from "$lib/i18n";

export interface IconDefinition {
  id: string;
  label: string;
  category: "system" | "work" | "life" | "resources" | "general";
}

const RAW_ICONS: Array<{ id: string; ru: string; en: string; category: IconDefinition["category"] }> = [
  // Primary Hubs & Personal Sections (First Row)
  { id: "folder", ru: "Папка", en: "Folder", category: "general" },
  { id: "monitor", ru: "Система", en: "System", category: "system" },
  { id: "briefcase", ru: "Работа / Бизнес", en: "Work / Business", category: "work" },
  { id: "home", ru: "Дом / Жизнь", en: "Home / Life", category: "life" },
  { id: "car", ru: "Автомобиль", en: "Car / Vehicle", category: "life" },
  { id: "building", ru: "Недвижимость", en: "Real Estate", category: "life" },
  { id: "dollar-sign", ru: "Финансы", en: "Finance", category: "life" },
  { id: "heart", ru: "Здоровье", en: "Health", category: "life" },

  // General & Documents
  { id: "book-open", ru: "Ресурсы / Книги", en: "Resources / Books", category: "resources" },
  { id: "inbox", ru: "Входящие", en: "Inbox", category: "general" },
  { id: "archive", ru: "Архив", en: "Archive", category: "general" },
  { id: "file-text", ru: "Заметка", en: "Note", category: "general" },
  { id: "folder-open", ru: "Открытая папка", en: "Open Folder", category: "general" },
  { id: "globe", ru: "Сеть / Всё", en: "Network / All", category: "general" },
  { id: "pin", ru: "Закреп", en: "Pinned", category: "general" },
  { id: "tag", ru: "Тег", en: "Tag", category: "general" },

  // System & Dev
  { id: "terminal", ru: "Терминал", en: "Terminal", category: "system" },
  { id: "cpu", ru: "Процессор", en: "CPU / Hardware", category: "system" },
  { id: "network", ru: "Сеть и VPN", en: "Network & VPN", category: "system" },
  { id: "shield", ru: "Безопасность", en: "Security", category: "system" },
  { id: "database", ru: "База данных", en: "Database", category: "system" },
  { id: "settings", ru: "Настройки", en: "Settings", category: "system" },
  { id: "wrench", ru: "Инструменты", en: "Tools", category: "system" },
  { id: "lightbulb", ru: "Рецепты / Грабли", en: "Tips & Tricks", category: "system" },

  // Work & Productivity
  { id: "landmark", ru: "Архитектура", en: "Architecture", category: "work" },
  { id: "calendar", ru: "Календарь", en: "Calendar", category: "work" },
  { id: "users", ru: "Команда / Люди", en: "Team / People", category: "work" },
  { id: "coffee", ru: "Отдых / Лайфстайл", en: "Lifestyle", category: "life" },
  { id: "music", ru: "Медиа / Музыка", en: "Media / Music", category: "life" },
  { id: "plane", ru: "Путешествия", en: "Travel", category: "life" },
];

export const AVAILABLE_ICONS: IconDefinition[] = RAW_ICONS.map((item) => ({
  id: item.id,
  category: item.category,
  get label(): string {
    return i18n.locale === "en" ? item.en : item.ru;
  },
}));

const RAW_COLORS = [
  { ru: "Синий", en: "Blue", value: "#3b82f6" },
  { ru: "Зеленый", en: "Green", value: "#10b981" },
  { ru: "Фиолетовый", en: "Purple", value: "#8b5cf6" },
  { ru: "Янтарный", en: "Amber", value: "#f59e0b" },
  { ru: "Розовый", en: "Pink", value: "#ec4899" },
  { ru: "Бирюзовый", en: "Cyan", value: "#06b6d4" },
  { ru: "Серый", en: "Gray", value: "#64748b" },
];

export const COLOR_PALETTE = RAW_COLORS.map((c) => ({
  value: c.value,
  get name(): string {
    return i18n.locale === "en" ? c.en : c.ru;
  },
}));
