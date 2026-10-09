pub mod crypto;
pub mod theme;
pub mod vault;

use vault::VaultNode;

#[tauri::command]
fn vault_get_tree() -> Result<VaultNode, String> {
    vault::build_vault_tree().map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_read_file(relative_path: String) -> Result<String, String> {
    vault::read_note(&relative_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_write_file(relative_path: String, content: String) -> Result<(), String> {
    vault::write_note(&relative_path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn crypto_encrypt_secret(plaintext: String, pubkey_content: Option<String>) -> Result<String, String> {
    crypto::encrypt_secret(&plaintext, pubkey_content.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn crypto_decrypt_secret(token: String, passphrase: Option<String>) -> Result<String, String> {
    crypto::decrypt_secret(&token, None, passphrase.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_create_note(relative_path: String, title: Option<String>) -> Result<String, String> {
    vault::create_note(&relative_path, title.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_create_dir(relative_path: String) -> Result<(), String> {
    vault::create_dir(&relative_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_save_dir_meta(relative_path: String, meta: vault::MetaJson) -> Result<(), String> {
    vault::save_dir_meta(&relative_path, &meta).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_create_dir_with_meta(relative_path: String, meta: Option<vault::MetaJson>) -> Result<String, String> {
    vault::create_dir_with_meta(&relative_path, meta.as_ref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn theme_detect_system() -> theme::SystemThemeInfo {
    theme::detect_system_theme()
}

#[tauri::command]
fn theme_list_gtk_themes() -> Vec<theme::GtkThemeSummary> {
    theme::list_installed_gtk_themes()
}

#[tauri::command]
fn theme_parse_gtk_theme(theme_path: String) -> Result<theme::ParsedGtkColors, String> {
    theme::parse_gtk_theme_colors(&theme_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            vault_get_tree,
            vault_read_file,
            vault_write_file,
            vault_create_note,
            vault_create_dir,
            vault_save_dir_meta,
            vault_create_dir_with_meta,
            crypto_encrypt_secret,
            crypto_decrypt_secret,
            theme_detect_system,
            theme_list_gtk_themes,
            theme_parse_gtk_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
