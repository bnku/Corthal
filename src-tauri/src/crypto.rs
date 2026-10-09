use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use thiserror::Error;

pub const TOKEN_PREFIX: &str = "`🔒[enc:v1:";
pub const TOKEN_SUFFIX: &str = "]`";
pub const RAW_TOKEN_PREFIX: &str = "🔒[enc:v1:";
pub const RAW_TOKEN_SUFFIX: &str = "]";

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

/// Encrypts plaintext using an SSH public key and wraps into `🔒[enc:v1:...]`
pub fn encrypt_secret(plaintext: &str, pubkey_content: Option<&str>) -> Result<String, CryptoError> {
    let pubkey_str = match pubkey_content {
        Some(content) => content.to_string(),
        None => {
            let path = get_default_ssh_pubkey_path()?;
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
            path_buf = get_default_ssh_privkey_path()?;
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
}
