# CORTHAL: Knowledge Vault Specification

## 1. Vault Location & Hubs
По умолчанию Corthal работает с директорией:
`$HOME/knowledge/`

Каталог строго структурирован по хабам:
* `00-Inbox/` — входящие заметки, временные мысли.
* `10-System/` — системные решения Arch Linux, артефакты, шаблоны.
* `20-Work/` — проекты и работа.
* `30-Life/` — личные домены (`Auto/`, `Real-Estate/`, `Finance/`, `Health/`).
* `40-Resources/` — общие ресурсы, выжимки, шпаргалки.
* `90-Archive/` — архив.

---

## 2. File System Watching & Metadata Contract
1. **FS Watcher**: Бэкенд на Rust (`notify` crate) мониторит изменения в `$HOME/knowledge/` в реальном времени.
2. **File Tree & Metadata**:
   * Бэкенд генерирует иерархическое дерево каталогов и файлов (`VaultNode`).
   * Игнорируются `.git/`, `.obsidian/` и скрытые файлы (кроме `.meta.json`).
3. **Метаданные директорий (`.meta.json`)**:
   В любой директории может лежать файл `.meta.json` со следующей схемой:
   ```json
   {
     "title": "Человекочитаемое имя",
     "icon": "🖥️",
     "order": 1,
     "color": "#3b82f6",
     "description": "Описание назначения раздела"
   }
   ```
   Если файл отсутствует, бэкенд использует имя папки, отсекая цифровые префиксы (например `10-System` -> `System` / `10-System`).
4. **Метаданные заметок (YAML Frontmatter)**:
   * Кодировка: UTF-8.
   * Формат: Стандартный CommonMark / GFM с блоком YAML Frontmatter в начале файла:
     ```yaml
     ---
     title: "Человекочитаемое название заметки"
     tags: [tag1, tag2]
     status: active
     date: "2026-10-09"
     ---
     ```
   * Бэкенд извлекает `title` из frontmatter (или первого `# Заголовка`) для отображения в дереве файлов.
   * Фронтенд скрывает блок `---` из тела и отображает его в интерактивном компоненте Properties.
5. **Внутренние ссылки**: Формат `[[path/to/note]]` или стандартный Markdown `[text](path)`.
