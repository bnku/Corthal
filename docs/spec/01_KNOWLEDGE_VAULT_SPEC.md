# CORTEX: Knowledge Vault Specification

## 1. Vault Location & Hubs
По умолчанию Cortex работает с директорией:
`$HOME/knowledge/`

Каталог строго структурирован по хабам:
* `00-Inbox/` — входящие заметки, временные мысли.
* `10-System/` — системные решения Arch Linux, артефакты, шаблоны.
* `20-Work/` — проекты и работа.
* `30-Life/` — личные домены (`Auto/`, `Real-Estate/`, `Finance/`, `Health/`).
* `40-Resources/` — общие ресурсы, выжимки, шпаргалки.
* `90-Archive/` — архив.

---

## 2. File System Watching & Indexing
1. **FS Watcher**: Бэкенд на Rust (`notify` crate) мониторит изменения в `$HOME/knowledge/` в реальном времени.
2. **File Tree**:
   * Бэкенд генерирует плоское и иерархическое дерево каталогов и файлов.
   * Игнорируются `.git/`, `.obsidian/` и скрытые файлы.
3. **Markdown File Contract**:
   * Кодировка: UTF-8.
   * Формат: Стандартный CommonMark / GFM с поддержкой YAML Frontmatter.
   * Внутренние ссылки: Формат `[[path/to/note]]` или стандартный Markdown `[text](path)`.
