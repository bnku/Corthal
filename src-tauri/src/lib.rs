pub mod crypto;
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
            crypto_encrypt_secret,
            crypto_decrypt_secret,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
