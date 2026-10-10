pub mod assistant;
pub mod crypto;
pub mod theme;
pub mod vault;
pub mod watcher;

use tauri::Emitter;
use vault::VaultNode;

#[tauri::command]
fn assistant_get_config() -> assistant::AssistantConfig {
    assistant::load_assistant_config()
}

#[tauri::command]
fn assistant_save_config(app: tauri::AppHandle, config: assistant::AssistantConfig) -> Result<(), String> {
    assistant::save_assistant_config(&config)?;
    let _ = app.emit("assistant:config-changed", &config);
    Ok(())
}

#[tauri::command]
async fn assistant_check_codex_status() -> assistant::CodexStatus {
    assistant::check_codex_status().await
}

#[tauri::command]
async fn assistant_send_message(
    app: tauri::AppHandle,
    session_id: String,
    prompt: String,
    messages: Vec<assistant::ChatMessage>,
    active_note_context: Option<String>,
) -> Result<(), String> {
    assistant::send_assistant_message(app, session_id, prompt, messages, active_note_context).await
}

#[tauri::command]
fn assistant_cancel_stream(session_id: String) -> bool {
    assistant::cancel_assistant_stream(&session_id)
}

#[tauri::command]
async fn assistant_fetch_models(base_url: String, api_key: Option<String>) -> Result<Vec<String>, String> {
    assistant::fetch_models(base_url, api_key).await
}

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
fn crypto_decrypt_secret(app: tauri::AppHandle, token: String, passphrase: Option<String>) -> Result<String, String> {
    // 1. If explicit passphrase was given, try decrypting and cache it if successful
    if let Some(ref p) = passphrase {
        let res = crypto::decrypt_secret(&token, None, Some(p)).map_err(|e| e.to_string())?;
        crypto::set_session_passphrase(p);
        if crypto::is_session_unlocked() {
            let _ = app.emit("crypto:session-unlocked", ());
        }
        return Ok(res);
    }

    // 2. If no passphrase provided, try cached session passphrase
    if let Some(cached) = crypto::get_session_passphrase() {
        if let Ok(res) = crypto::decrypt_secret(&token, None, Some(&cached)) {
            return Ok(res);
        }
    }

    // 3. Fallback to unencrypted SSH key attempt
    crypto::decrypt_secret(&token, None, None).map_err(|e| e.to_string())
}

#[tauri::command]
fn crypto_is_session_unlocked() -> bool {
    crypto::is_session_unlocked()
}

#[tauri::command]
fn crypto_clear_session_passphrase(app: tauri::AppHandle) -> Result<(), String> {
    crypto::clear_session_passphrase();
    let _ = app.emit("crypto:session-locked", ());
    Ok(())
}

#[tauri::command]
fn crypto_get_security_config() -> crypto::SecurityConfig {
    crypto::load_security_config()
}

#[tauri::command]
fn crypto_save_security_config(app: tauri::AppHandle, config: crypto::SecurityConfig) -> Result<(), String> {
    crypto::save_security_config(&config)?;
    let _ = app.emit("crypto:security-config-changed", &config);
    if !crypto::is_session_unlocked() {
        let _ = app.emit("crypto:session-locked", ());
    }
    Ok(())
}

#[tauri::command]
fn crypto_get_session_status() -> crypto::SessionStatus {
    crypto::get_session_status()
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

#[tauri::command]
fn vault_get_active() -> Result<vault::VaultInfo, String> {
    vault::get_active_vault_info().map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_switch(app: tauri::AppHandle, path: String) -> Result<vault::VaultInfo, String> {
    let info = vault::set_active_vault_root(&path).map_err(|e| e.to_string())?;
    let target = vault::expand_path(&path);
    let _ = watcher::start_vault_watcher(app.clone(), &target);
    crypto::clear_session_passphrase();
    let _ = app.emit("crypto:session-locked", ());
    Ok(info)
}

#[tauri::command]
fn vault_watch_start(app: tauri::AppHandle, path: Option<String>) -> Result<(), String> {
    let watch_path = match path {
        Some(p) => vault::expand_path(&p),
        None => vault::get_vault_root().map_err(|e| e.to_string())?,
    };
    watcher::start_vault_watcher(app, &watch_path)
}

#[tauri::command]
fn vault_watch_stop(app: tauri::AppHandle) -> Result<(), String> {
    watcher::stop_vault_watcher(&app)
}

#[tauri::command]
fn vault_list_recents() -> Result<Vec<vault::VaultSummary>, String> {
    Ok(vault::list_recent_vaults())
}

#[tauri::command]
fn vault_remove_recent(path: String) -> Result<(), String> {
    vault::remove_recent_vault(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn vault_pick_directory() -> Result<Option<String>, String> {
    vault::pick_directory().map_err(|e| e.to_string())
}

#[tauri::command]
fn crypto_list_ssh_keys() -> Result<Vec<crypto::SshKeyInfo>, String> {
    crypto::list_system_ssh_keys().map_err(|e| e.to_string())
}

#[tauri::command]
fn crypto_get_vault_key() -> Result<crypto::SshKeyInfo, String> {
    crypto::get_vault_key_info().map_err(|e| e.to_string())
}

#[tauri::command]
fn crypto_set_vault_key(key_path: String) -> Result<crypto::SshKeyInfo, String> {
    crypto::set_vault_ssh_key(&key_path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(watcher::VaultWatcherState::default())
        .setup(|app| {
            let app_handle = app.handle().clone();
            if let Ok(root) = vault::get_vault_root() {
                let _ = watcher::start_vault_watcher(app_handle, &root);
            }

            // Background session timeout monitor
            let timer_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut was_unlocked = false;
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                    let status = crypto::get_session_status();
                    if was_unlocked && !status.is_unlocked {
                        let _ = timer_handle.emit("crypto:session-locked", ());
                    }
                    was_unlocked = status.is_unlocked;
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            assistant_get_config,
            assistant_save_config,
            assistant_check_codex_status,
            assistant_send_message,
            assistant_cancel_stream,
            assistant_fetch_models,
            vault_get_tree,
            vault_read_file,
            vault_write_file,
            vault_create_note,
            vault_create_dir,
            vault_save_dir_meta,
            vault_create_dir_with_meta,
            vault_get_active,
            vault_switch,
            vault_watch_start,
            vault_watch_stop,
            vault_list_recents,
            vault_remove_recent,
            vault_pick_directory,
            crypto_encrypt_secret,
            crypto_decrypt_secret,
            crypto_is_session_unlocked,
            crypto_clear_session_passphrase,
            crypto_get_security_config,
            crypto_save_security_config,
            crypto_get_session_status,
            crypto_list_ssh_keys,
            crypto_get_vault_key,
            crypto_set_vault_key,
            theme_detect_system,
            theme_list_gtk_themes,
            theme_parse_gtk_theme,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
