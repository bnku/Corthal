export interface IconDefinition {
  id: string;
  label: string;
  category: "system" | "work" | "life" | "resources" | "general";
}

export const AVAILABLE_ICONS: IconDefinition[] = [
  // Primary Hubs & Personal Sections (First Row)
  { id: "folder", label: "Папка", category: "general" },
  { id: "monitor", label: "Система", category: "system" },
  { id: "briefcase", label: "Работа / Бизнес", category: "work" },
  { id: "home", label: "Дом / Жизнь", category: "life" },
  { id: "car", label: "Автомобиль", category: "life" },
  { id: "building", label: "Недвижимость", category: "life" },
  { id: "dollar-sign", label: "Финансы", category: "life" },
  { id: "heart", label: "Здоровье", category: "life" },

  // General & Documents
  { id: "book-open", label: "Ресурсы / Книги", category: "resources" },
  { id: "inbox", label: "Входящие", category: "general" },
  { id: "archive", label: "Архив", category: "general" },
  { id: "file-text", label: "Заметка", category: "general" },
  { id: "folder-open", label: "Открытая папка", category: "general" },
  { id: "globe", label: "Сеть / Всё", category: "general" },
  { id: "pin", label: "Закреп", category: "general" },
  { id: "tag", label: "Тег", category: "general" },

  // System & Dev
  { id: "terminal", label: "Терминал", category: "system" },
  { id: "cpu", label: "Процессор", category: "system" },
  { id: "network", label: "Сеть и VPN", category: "system" },
  { id: "shield", label: "Безопасность", category: "system" },
  { id: "database", label: "База данных", category: "system" },
  { id: "settings", label: "Настройки", category: "system" },
  { id: "wrench", label: "Инструменты", category: "system" },
  { id: "lightbulb", label: "Рецепты / Грабли", category: "system" },

  // Work & Productivity
  { id: "landmark", label: "Архитектура", category: "work" },
  { id: "calendar", label: "Календарь", category: "work" },
  { id: "users", label: "Команда / Люди", category: "work" },
  { id: "coffee", label: "Отдых / Лайфстайл", category: "life" },
  { id: "music", label: "Медиа / Музыка", category: "life" },
  { id: "plane", label: "Путешествия", category: "life" },
];

export const COLOR_PALETTE = [
  { name: "Синий", value: "#3b82f6" },
  { name: "Зеленый", value: "#10b981" },
  { name: "Фиолетовый", value: "#8b5cf6" },
  { name: "Янтарный", value: "#f59e0b" },
  { name: "Розовый", value: "#ec4899" },
  { name: "Бирюзовый", value: "#06b6d4" },
  { name: "Серый", value: "#64748b" },
];
