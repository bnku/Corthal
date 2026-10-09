use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum VaultError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("File not found: {0}")]
    NotFound(String),

    #[error("Security violation: path traversal detected ({0})")]
    PathTraversal(String),

    #[error("Vault root error: {0}")]
    RootError(String),
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct VaultNode {
    pub name: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub children: Vec<VaultNode>,
    pub size_bytes: Option<u64>,
}

/// Returns the absolute path to the user's ~/knowledge vault
pub fn get_vault_root() -> Result<PathBuf, VaultError> {
    let home = dirs::home_dir()
        .ok_or_else(|| VaultError::RootError("Could not determine home directory".into()))?;
    let vault = home.join("knowledge");
    if !vault.exists() {
        fs::create_dir_all(&vault)?;
    }
    Ok(vault)
}

/// Resolves a relative path safely within the vault root, preventing path traversal
pub fn resolve_safe_path(relative_path: &str) -> Result<PathBuf, VaultError> {
    let vault_root = get_vault_root()?;
    let clean_rel = relative_path.trim_start_matches('/');
    let target = vault_root.join(clean_rel);

    // Canonicalize or normalize to prevent `..` escape
    if target.components().any(|c| c == std::path::Component::ParentDir) {
        return Err(VaultError::PathTraversal(relative_path.to_string()));
    }

    Ok(target)
}

/// Recursively builds the directory tree for ~/knowledge
pub fn build_vault_tree() -> Result<VaultNode, VaultError> {
    let root = get_vault_root()?;
    scan_dir_node(&root, &root)
}

fn scan_dir_node(dir: &Path, root: &Path) -> Result<VaultNode, VaultError> {
    let name = dir
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "knowledge".to_string());

    let relative_path = dir
        .strip_prefix(root)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let mut children = Vec::new();

    if dir.is_dir() {
        let mut entries: Vec<_> = fs::read_dir(dir)?
            .filter_map(|res| res.ok())
            .filter(|e| {
                let fname = e.file_name();
                let name_str = fname.to_string_lossy();
                // Skip hidden files/folders (.git, .obsidian, .gitkeep)
                !name_str.starts_with('.')
            })
            .collect();

        // Sort: directories first, then alphabetical by name
        entries.sort_by_key(|e| {
            let is_d = e.file_type().map(|t| t.is_dir()).unwrap_or(false);
            (!is_d, e.file_name().to_string_lossy().to_lowercase())
        });

        for entry in entries {
            let path = entry.path();
            if path.is_dir() {
                children.push(scan_dir_node(&path, root)?);
            } else if path.is_file() {
                let fname = path.file_name().unwrap().to_string_lossy().to_string();
                let f_rel = path.strip_prefix(root).unwrap().to_string_lossy().to_string();
                let size = entry.metadata().ok().map(|m| m.len());
                children.push(VaultNode {
                    name: fname,
                    relative_path: f_rel,
                    is_dir: false,
                    children: Vec::new(),
                    size_bytes: size,
                });
            }
        }
    }

    Ok(VaultNode {
        name,
        relative_path,
        is_dir: true,
        children,
        size_bytes: None,
    })
}

/// Reads the contents of a Markdown file relative to ~/knowledge
pub fn read_note(relative_path: &str) -> Result<String, VaultError> {
    let target = resolve_safe_path(relative_path)?;
    if !target.exists() || !target.is_file() {
        return Err(VaultError::NotFound(format!("Note not found: {}", relative_path)));
    }
    let content = fs::read_to_string(target)?;
    Ok(content)
}

/// Writes/saves a Markdown file relative to ~/knowledge
pub fn write_note(relative_path: &str, content: &str) -> Result<(), VaultError> {
    let target = resolve_safe_path(relative_path)?;
    if let Some(parent) = target.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }
    fs::write(target, content)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_vault_tree() {
        let tree = build_vault_tree().expect("Should read vault tree from ~/knowledge");
        assert!(tree.is_dir);
        let child_names: Vec<String> = tree.children.iter().map(|c| c.name.clone()).collect();
        println!("Vault child folders: {:?}", child_names);
        assert!(child_names.contains(&"10-System".to_string()));
    }

    #[test]
    fn test_read_existing_note() {
        let content = read_note("10-System/systems/networking/amnezia-novpn-bypass.md")
            .expect("Should read amnezia-novpn-bypass.md");
        assert!(content.contains("AmneziaVPN"));
        assert!(content.contains("novpn"));
    }

    #[test]
    fn test_prevent_path_traversal() {
        let res = resolve_safe_path("../../../etc/passwd");
        assert!(res.is_err());
    }
}
