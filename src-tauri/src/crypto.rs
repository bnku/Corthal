use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use std::sync::{Arc, LazyLock, RwLock};

pub const TOKEN_PREFIX: &str = "`🔒[enc:v1:";
pub const TOKEN_SUFFIX: &str = "]`";
pub const RAW_TOKEN_PREFIX: &str = "🔒[enc:v1:";
pub const RAW_TOKEN_SUFFIX: &str = "]";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SecurityConfig {
    /// "session" | "timeout" | "always"
    pub passphrase_policy: String,
    /// Timeout in minutes (used when passphrase_policy == "timeout"), default: 15
    pub passphrase_timeout_minutes: u32,
}

impl Default for SecurityConfig {
    fn default() -> Self {
        Self {
            passphrase_policy: "session".to_string(),
            passphrase_timeout_minutes: 15,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionStatus {
    pub is_unlocked: bool,
    pub policy: String,
    pub remaining_seconds: Option<u64>,
    pub timeout_minutes: u32,
}

#[derive(Clone)]
struct CachedPassphraseEntry {
    passphrase: String,
    _cached_at: std::time::Instant,
    last_used_at: std::time::Instant,
}

static SESSION_PASSPHRASE: LazyLock<Arc<RwLock<Option<CachedPassphraseEntry>>>> =
    LazyLock::new(|| Arc::new(RwLock::new(None)));

fn get_security_config_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".config").join("cortex").join("security_config.json")
}

pub fn load_security_config() -> SecurityConfig {
    let p = get_security_config_path();
    if let Ok(content) = std::fs::read_to_string(&p) {
        if let Ok(cfg) = serde_json::from_str::<SecurityConfig>(&content) {
            return cfg;
        }
    }
    SecurityConfig::default()
}

pub fn save_security_config(cfg: &SecurityConfig) -> Result<(), String> {
    let p = get_security_config_path();
    if let Some(parent) = p.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let data = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(&p, data).map_err(|e| e.to_string())?;

    if cfg.passphrase_policy == "always" {
        clear_session_passphrase();
    }
    Ok(())
}

pub fn set_session_passphrase(passphrase: &str) {
    let cfg = load_security_config();
    if cfg.passphrase_policy == "always" {
        clear_session_passphrase();
        return;
    }

    let now = std::time::Instant::now();
    if let Ok(mut lock) = SESSION_PASSPHRASE.write() {
        *lock = Some(CachedPassphraseEntry {
            passphrase: passphrase.to_string(),
            _cached_at: now,
            last_used_at: now,
        });
    }
}

pub fn get_session_passphrase() -> Option<String> {
    let cfg = load_security_config();
    if cfg.passphrase_policy == "always" {
        clear_session_passphrase();
        return None;
    }

    let mut lock = SESSION_PASSPHRASE.write().ok()?;
    if let Some(ref mut entry) = *lock {
        let now = std::time::Instant::now();
        if cfg.passphrase_policy == "timeout" {
            let timeout_secs = (cfg.passphrase_timeout_minutes.max(1) as u64) * 60;
            if now.duration_since(entry.last_used_at).as_secs() >= timeout_secs {
                *lock = None;
                return None;
            }
        }
        entry.last_used_at = now;
        Some(entry.passphrase.clone())
    } else {
        None
    }
}

pub fn clear_session_passphrase() {
    if let Ok(mut lock) = SESSION_PASSPHRASE.write() {
        *lock = None;
    }
}

pub fn is_session_unlocked() -> bool {
    get_session_passphrase().is_some()
}

pub fn get_session_status() -> SessionStatus {
    let cfg = load_security_config();
    if cfg.passphrase_policy == "always" {
        return SessionStatus {
            is_unlocked: false,
            policy: cfg.passphrase_policy,
            remaining_seconds: None,
            timeout_minutes: cfg.passphrase_timeout_minutes,
        };
    }

    let lock = SESSION_PASSPHRASE.read().ok();
    if let Some(Some(ref entry)) = lock.as_deref() {
        let now = std::time::Instant::now();
        if cfg.passphrase_policy == "timeout" {
            let timeout_secs = (cfg.passphrase_timeout_minutes.max(1) as u64) * 60;
            let elapsed = now.duration_since(entry.last_used_at).as_secs();
            if elapsed >= timeout_secs {
                drop(lock);
                clear_session_passphrase();
                return SessionStatus {
                    is_unlocked: false,
                    policy: cfg.passphrase_policy,
                    remaining_seconds: None,
                    timeout_minutes: cfg.passphrase_timeout_minutes,
                };
            } else {
                return SessionStatus {
                    is_unlocked: true,
                    policy: cfg.passphrase_policy,
                    remaining_seconds: Some(timeout_secs - elapsed),
                    timeout_minutes: cfg.passphrase_timeout_minutes,
                };
            }
        }
        SessionStatus {
            is_unlocked: true,
            policy: cfg.passphrase_policy,
            remaining_seconds: None,
            timeout_minutes: cfg.passphrase_timeout_minutes,
        }
    } else {
        SessionStatus {
            is_unlocked: false,
            policy: cfg.passphrase_policy,
            remaining_seconds: None,
            timeout_minutes: cfg.passphrase_timeout_minutes,
        }
    }
}

#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Base64 decode error: {0}")]
    Base64(#[from] base64::DecodeError),

    #[error("Encryption error: {0}")]
    Encrypt(String),

    #[error("Decryption error: {0}")]
    Decrypt(String),

    #[error("Invalid token format: {0}")]
    InvalidToken(String),

    #[error("SSH key error: {0}")]
    SshKey(String),

    #[error("Key file not found: {0}")]
    KeyNotFound(String),
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SshKeyInfo {
    pub path: String,
    pub filename: String,
    pub key_type: String,
    pub comment: Option<String>,
    pub fingerprint: String,
    pub is_active: bool,
}

#[derive(Clone)]
struct StaticPassphraseCallbacks {
    passphrase: Option<secrecy::SecretBox<str>>,
}

impl age::Callbacks for StaticPassphraseCallbacks {
    fn display_message(&self, _: &str) {}

    fn confirm(&self, _: &str, _: &str, _: Option<&str>) -> Option<bool> {
        None
    }

    fn request_public_string(&self, _: &str) -> Option<String> {
        None
    }

    fn request_passphrase(&self, _: &str) -> Option<secrecy::SecretBox<str>> {
        self.passphrase.clone()
    }
}

/// Returns the default path to the user's SSH public key (~/.ssh/id_ed25519.pub)
pub fn get_default_ssh_pubkey_path() -> Result<PathBuf, CryptoError> {
    let home = dirs::home_dir()
        .ok_or_else(|| CryptoError::KeyNotFound("Could not determine home directory".into()))?;
    
    let ed25519_pub = home.join(".ssh").join("id_ed25519.pub");
    if ed25519_pub.exists() {
        return Ok(ed25519_pub);
    }

    let rsa_pub = home.join(".ssh").join("id_rsa.pub");
    if rsa_pub.exists() {
        return Ok(rsa_pub);
    }

    Err(CryptoError::KeyNotFound("No SSH public key found in ~/.ssh/ (tried id_ed25519.pub, id_rsa.pub)".into()))
}

/// Returns the default path to the user's SSH private key (~/.ssh/id_ed25519)
pub fn get_default_ssh_privkey_path() -> Result<PathBuf, CryptoError> {
    let home = dirs::home_dir()
        .ok_or_else(|| CryptoError::KeyNotFound("Could not determine home directory".into()))?;
    
    let ed25519 = home.join(".ssh").join("id_ed25519");
    if ed25519.exists() {
        return Ok(ed25519);
    }

    let rsa = home.join(".ssh").join("id_rsa");
    if rsa.exists() {
        return Ok(rsa);
    }

    Err(CryptoError::KeyNotFound("No SSH private key found in ~/.ssh/ (tried id_ed25519, id_rsa)".into()))
}

/// Returns the active vault's configured SSH public key, or the default system SSH key
pub fn get_vault_ssh_pubkey_path() -> Result<PathBuf, CryptoError> {
    if let Ok(vault_root) = crate::vault::get_vault_root() {
        if let Some(meta) = crate::vault::read_dir_meta(&vault_root) {
            if let Some(key_path_str) = meta.ssh_key {
                let resolved = crate::vault::expand_path(&key_path_str);
                if resolved.exists() {
                    return Ok(resolved);
                }
            }
        }
    }
    get_default_ssh_pubkey_path()
}

/// Returns the active vault's configured SSH private key, or the default system SSH private key
pub fn get_vault_ssh_privkey_path() -> Result<PathBuf, CryptoError> {
    if let Ok(pubkey_path) = get_vault_ssh_pubkey_path() {
        let pubkey_str = pubkey_path.to_string_lossy();
        if let Some(priv_str) = pubkey_str.strip_suffix(".pub") {
            let priv_path = PathBuf::from(priv_str);
            if priv_path.exists() {
                return Ok(priv_path);
            }
        }
    }
    get_default_ssh_privkey_path()
}

/// Lists all detected SSH public keys in ~/.ssh/
pub fn list_system_ssh_keys() -> Result<Vec<SshKeyInfo>, CryptoError> {
    let home = dirs::home_dir()
        .ok_or_else(|| CryptoError::KeyNotFound("Could not determine home directory".into()))?;
    let ssh_dir = home.join(".ssh");
    if !ssh_dir.is_dir() {
        return Ok(Vec::new());
    }

    let active_key_path = get_vault_ssh_pubkey_path().ok();

    let mut keys = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&ssh_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("pub") {
                let filename = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                if let Ok(content) = std::fs::read_to_string(&path) {
                    let trimmed = content.trim();
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    if !parts.is_empty() {
                        let raw_type = parts[0];
                        let key_type = match raw_type {
                            "ssh-ed25519" => "ED25519",
                            "ssh-rsa" => "RSA",
                            "ecdsa-sha2-nistp256" | "ecdsa-sha2-nistp384" | "ecdsa-sha2-nistp521" => "ECDSA",
                            "sk-ssh-ed25519@openssh.com" => "ED25519-SK",
                            other => other,
                        }.to_string();

                        let comment = if parts.len() >= 3 {
                            Some(parts[2..].join(" "))
                        } else {
                            None
                        };

                        let fingerprint = if parts.len() >= 2 {
                            let key_b64 = parts[1];
                            if key_b64.len() > 16 {
                                format!("{}...", &key_b64[..16])
                            } else {
                                key_b64.to_string()
                            }
                        } else {
                            "SHA256".to_string()
                        };

                        let is_active = active_key_path.as_ref().map(|p| p == &path).unwrap_or(false);

                        keys.push(SshKeyInfo {
                            path: path.to_string_lossy().to_string(),
                            filename,
                            key_type,
                            comment,
                            fingerprint,
                            is_active,
                        });
                    }
                }
            }
        }
    }

    keys.sort_by(|a, b| {
        b.is_active.cmp(&a.is_active)
            .then_with(|| (a.filename != "id_ed25519.pub").cmp(&(b.filename != "id_ed25519.pub")))
            .then_with(|| a.filename.cmp(&b.filename))
    });

    Ok(keys)
}

/// Returns the currently active SshKeyInfo for the vault
pub fn get_vault_key_info() -> Result<SshKeyInfo, CryptoError> {
    let active_path = get_vault_ssh_pubkey_path()?;
    let keys = list_system_ssh_keys()?;
    if let Some(found) = keys.into_iter().find(|k| k.path == active_path.to_string_lossy()) {
        Ok(found)
    } else {
        let filename = active_path.file_name().unwrap_or_default().to_string_lossy().to_string();
        Ok(SshKeyInfo {
            path: active_path.to_string_lossy().to_string(),
            filename,
            key_type: "SSH".to_string(),
            comment: None,
            fingerprint: "SSH".to_string(),
            is_active: true,
        })
    }
}

/// Sets the SSH key for the active vault in its root .meta.json
pub fn set_vault_ssh_key(key_path_str: &str) -> Result<SshKeyInfo, CryptoError> {
    let key_path = crate::vault::expand_path(key_path_str);
    if !key_path.exists() {
        return Err(CryptoError::KeyNotFound(format!("SSH key file does not exist: {}", key_path.display())));
    }

    let vault_root = crate::vault::get_vault_root()
        .map_err(|e| CryptoError::KeyNotFound(e.to_string()))?;

    let mut meta = crate::vault::read_dir_meta(&vault_root).unwrap_or_default();
    meta.ssh_key = Some(key_path.to_string_lossy().to_string());

    crate::vault::save_dir_meta("", &meta)
        .map_err(|e| CryptoError::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))?;

    let _ = crate::vault::update_recent_vault_ssh_key(&vault_root, &key_path.to_string_lossy());

    get_vault_key_info()
}

/// Encrypts plaintext using an SSH public key and wraps into `🔒[enc:v1:...]`
pub fn encrypt_secret(plaintext: &str, pubkey_content: Option<&str>) -> Result<String, CryptoError> {
    let pubkey_str = match pubkey_content {
        Some(content) => content.to_string(),
        None => {
            let path = get_vault_ssh_pubkey_path()?;
            std::fs::read_to_string(&path)
                .map_err(|e| CryptoError::KeyNotFound(format!("Failed to read {}: {}", path.display(), e)))?
        }
    };

    let recipient = age::ssh::Recipient::from_str(pubkey_str.trim())
        .map_err(|e| CryptoError::SshKey(format!("Failed to parse SSH public key: {:?}", e)))?;

    let encryptor = age::Encryptor::with_recipients(std::iter::once(&recipient as &dyn age::Recipient))
        .map_err(|e| CryptoError::Encrypt(format!("Failed to initialize encryptor: {}", e)))?;

    let mut ciphertext = Vec::new();
    let mut writer = encryptor.wrap_output(&mut ciphertext)
        .map_err(|e| CryptoError::Encrypt(format!("Failed to initialize encryption output: {}", e)))?;

    writer.write_all(plaintext.as_bytes())?;
    writer.finish()
        .map_err(|e| CryptoError::Encrypt(format!("Failed to complete encryption: {}", e)))?;

    let encoded = BASE64.encode(&ciphertext);
    Ok(format!("{}{}{}", TOKEN_PREFIX, encoded, TOKEN_SUFFIX))
}

/// Extracts the raw Base64 payload from an encrypted token
pub fn extract_token_payload(token: &str) -> Result<String, CryptoError> {
    let trimmed = token.trim();
    
    // Check with backticks: `🔒[enc:v1:...]`
    if let Some(rest) = trimmed.strip_prefix(TOKEN_PREFIX) {
        if let Some(payload) = rest.strip_suffix(TOKEN_SUFFIX) {
            return Ok(payload.to_string());
        }
    }

    // Check without backticks: 🔒[enc:v1:...]
    if let Some(rest) = trimmed.strip_prefix(RAW_TOKEN_PREFIX) {
        if let Some(payload) = rest.strip_suffix(RAW_TOKEN_SUFFIX) {
            return Ok(payload.to_string());
        }
    }

    Err(CryptoError::InvalidToken(format!(
        "Token does not match expected format `🔒[enc:v1:PAYLOAD]`"
    )))
}

/// Decrypts a token using an SSH private key and passphrase
pub fn decrypt_secret(
    token: &str,
    privkey_path: Option<&Path>,
    passphrase: Option<&str>,
) -> Result<String, CryptoError> {
    let payload = extract_token_payload(token)?;
    let ciphertext = BASE64.decode(payload)?;

    let path_buf;
    let path = match privkey_path {
        Some(p) => p,
        None => {
            path_buf = get_vault_ssh_privkey_path()?;
            &path_buf
        }
    };

    let key_file = std::fs::File::open(path)
        .map_err(|e| CryptoError::KeyNotFound(format!("Cannot open private key file {}: {}", path.display(), e)))?;
    let mut key_reader = std::io::BufReader::new(key_file);

    let parsed_identity = age::ssh::Identity::from_buffer(&mut key_reader, None)
        .map_err(|e| CryptoError::SshKey(format!("Failed to parse private key: {}", e)))?;

    let identity = parsed_identity.with_callbacks(StaticPassphraseCallbacks {
        passphrase: passphrase.map(|p| secrecy::SecretBox::new(p.to_string().into_boxed_str())),
    });

    let decryptor = age::Decryptor::new_buffered(&ciphertext[..])
        .map_err(|e| CryptoError::Decrypt(format!("Failed to parse age header: {}", e)))?;

    let mut decrypted_reader = decryptor.decrypt(std::iter::once(&identity as &dyn age::Identity))
        .map_err(|e| CryptoError::Decrypt(format!("Decryption failed: {}", e)))?;

    let mut plaintext = String::new();
    decrypted_reader.read_to_string(&mut plaintext)?;

    Ok(plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_token_payload() {
        let token = "`🔒[enc:v1:SGVsbG8gV29ybGQ=]`";
        let payload = extract_token_payload(token).unwrap();
        assert_eq!(payload, "SGVsbG8gV29ybGQ=");

        let raw_token = "🔒[enc:v1:SGVsbG8gV29ybGQ=]";
        let payload2 = extract_token_payload(raw_token).unwrap();
        assert_eq!(payload2, "SGVsbG8gV29ybGQ=");
    }

    #[test]
    fn test_encrypt_with_user_ssh_pubkey() {
        let secret = "MySuperSecretPassword123!";
        let token = encrypt_secret(secret, None).expect("Should encrypt using user's ~/.ssh/id_ed25519.pub");
        assert!(token.starts_with(TOKEN_PREFIX));
        assert!(token.ends_with(TOKEN_SUFFIX));
        println!("Encrypted token: {}", token);
    }

    #[test]
    fn test_security_config_defaults() {
        let cfg = SecurityConfig::default();
        assert_eq!(cfg.passphrase_policy, "session");
        assert_eq!(cfg.passphrase_timeout_minutes, 15);
    }

    #[test]
    fn test_session_passphrase_lifecycle() {
        clear_session_passphrase();
        assert!(!is_session_unlocked());
        assert_eq!(get_session_passphrase(), None);
        let status = get_session_status();
        assert!(!status.is_unlocked);

        set_session_passphrase("test_pass");
        assert!(is_session_unlocked());
        assert_eq!(get_session_passphrase(), Some("test_pass".to_string()));
        let status2 = get_session_status();
        assert!(status2.is_unlocked);

        clear_session_passphrase();
        assert!(!is_session_unlocked());
        assert_eq!(get_session_passphrase(), None);
        let status3 = get_session_status();
        assert!(!status3.is_unlocked);
    }
}
