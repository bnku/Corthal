# CORTHAL: Tauri IPC Commands & Events Specification

## 1. Vault Commands (Работа с базой)

### `vault_get_tree`
* **Описание**: Возвращает полное дерево каталогов и заметок `~/knowledge/`.
* **Signature**: `fn vault_get_tree() -> Result<VaultNode, String>`

### `vault_read_file`
* **Описание**: Читает содержимое конкретного Markdown-файла.
* **Signature**: `fn vault_read_file(relative_path: String) -> Result<String, String>`

### `vault_write_file`
* **Описание**: Сохраняет отредактированный файл в хранилище.
* **Signature**: `fn vault_write_file(relative_path: String, content: String) -> Result<(), String>`

---

## 2. Crypto Commands (Шифрование и секреты)

### `crypto_encrypt_secret`
* **Описание**: Быстрое шифрование открытого текста публичным SSH-ключом.
* **Signature**: `fn crypto_encrypt_secret(plaintext: String) -> Result<String, String>`
* **Выход**: Готовый токен `🔒[enc:v1:...]`.

### `crypto_decrypt_secret`
* **Описание**: Расшифровка токена с использованием пасс-фразы от SSH-ключа.
* **Signature**: `fn crypto_decrypt_secret(token: String, passphrase: Option<String>) -> Result<String, String>`
* **Выход**: Открытая строка `plaintext`.

### `crypto_check_session`
* **Описание**: Проверяет, разблокирован ли ключ в текущей сессии (в памяти процесса).
* **Signature**: `fn crypto_check_session() -> Result<bool, String>`

---

## 3. Events (События от бэкенда)
* `vault://fs-change`: Сигнал об изменении файлов на диске (для автообновления дерева и редактора).
* `agent://message-chunk`: Стриминг ответа от ассистента в чат.
