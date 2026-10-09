use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum VaultError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("File not found: {0}")]
    NotFound(String),

    #[error("Already exists: {0}")]
    AlreadyExists(String),

    #[error("Security violation: path traversal detected ({0})")]
    PathTraversal(String),

    #[error("Vault root error: {0}")]
    RootError(String),
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct MetaJson {
    pub title: Option<String>,
    pub icon: Option<String>,
    pub order: Option<i32>,
    pub color: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct VaultNode {
    pub name: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub children: Vec<VaultNode>,
    pub size_bytes: Option<u64>,
    pub title: Option<String>,
    pub icon: Option<String>,
    pub order: Option<i32>,
    pub color: Option<String>,
    pub description: Option<String>,
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

/// Reads `.meta.json` or `_meta.json` from a directory if present
fn read_dir_meta(dir: &Path) -> Option<MetaJson> {
    for meta_name in [".meta.json", "_meta.json"] {
        let p = dir.join(meta_name);
        if p.is_file() {
            if let Ok(content) = fs::read_to_string(&p) {
                if let Ok(meta) = serde_json::from_str::<MetaJson>(&content) {
                    return Some(meta);
                }
            }
        }
    }
    None
}

/// Extracts title from YAML Frontmatter or first Markdown header `# ...`
fn extract_file_title(path: &Path) -> Option<String> {
    if path.extension().and_then(|e| e.to_str()) != Some("md") {
        return None;
    }

    let mut file = fs::File::open(path).ok()?;
    let mut buffer = [0u8; 2048];
    let n = file.read(&mut buffer).ok()?;
    let text = String::from_utf8_lossy(&buffer[..n]);

    let trimmed = text.trim_start();
    if trimmed.starts_with("---") {
        let rest = &trimmed[3..];
        if let Some(end_idx) = rest.find("\n---") {
            let frontmatter = &rest[..end_idx];
            for line in frontmatter.lines() {
                let trimmed_line = line.trim();
                if let Some(val) = trimmed_line.strip_prefix("title:") {
                    let clean = val.trim().trim_matches(|c| c == '"' || c == '\'').trim();
                    if !clean.is_empty() {
                        return Some(clean.to_string());
                    }
                }
            }
        }
    }

    // Fallback: search for first markdown heading `# ...`
    for line in text.lines() {
        let trimmed_line = line.trim();
        if let Some(header) = trimmed_line.strip_prefix("# ") {
            let clean = header.trim();
            if !clean.is_empty() {
                return Some(clean.to_string());
            }
        }
    }

    None
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

    let dir_meta = read_dir_meta(dir);
    let (dir_title, dir_icon, dir_order, dir_color, dir_desc) = match dir_meta {
        Some(m) => (m.title, m.icon, m.order, m.color, m.description),
        None => (None, None, None, None, None),
    };

    let mut children = Vec::new();

    if dir.is_dir() {
        let entries_res = fs::read_dir(dir);
        if let Ok(entries) = entries_res {
            for entry in entries.filter_map(|r| r.ok()) {
                let fname = entry.file_name();
                let name_str = fname.to_string_lossy();
                // Skip hidden files/folders (.git, .obsidian, .gitkeep, .meta.json)
                if name_str.starts_with('.') {
                    continue;
                }

                let path = entry.path();
                if path.is_dir() {
                    children.push(scan_dir_node(&path, root)?);
                } else if path.is_file() {
                    let f_rel = path.strip_prefix(root).unwrap().to_string_lossy().to_string();
                    let size = entry.metadata().ok().map(|m| m.len());
                    let title = extract_file_title(&path);

                    children.push(VaultNode {
                        name: fname.to_string_lossy().to_string(),
                        relative_path: f_rel,
                        is_dir: false,
                        children: Vec::new(),
                        size_bytes: size,
                        title,
                        icon: Some("📄".into()),
                        order: None,
                        color: None,
                        description: None,
                    });
                }
            }
        }

        // Sort children: directories first, sorted by order then name; then files sorted by name
        children.sort_by(|a, b| {
            match (!a.is_dir).cmp(&(!b.is_dir)) {
                std::cmp::Ordering::Equal => {
                    let order_a = a.order.unwrap_or(100);
                    let order_b = b.order.unwrap_or(100);
                    match order_a.cmp(&order_b) {
                        std::cmp::Ordering::Equal => {
                            let label_a = a.title.as_deref().unwrap_or(&a.name).to_lowercase();
                            let label_b = b.title.as_deref().unwrap_or(&b.name).to_lowercase();
                            label_a.cmp(&label_b)
                        }
                        other => other,
                    }
                }
                other => other,
            }
        });
    }

    Ok(VaultNode {
        name,
        relative_path,
        is_dir: true,
        children,
        size_bytes: None,
        title: dir_title,
        icon: dir_icon,
        order: dir_order,
        color: dir_color,
        description: dir_desc,
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

/// Creates a new Markdown note with frontmatter relative to ~/knowledge
pub fn create_note(relative_path: &str, title: Option<&str>) -> Result<String, VaultError> {
    let mut clean_path = relative_path.trim_start_matches('/').to_string();
    if !clean_path.ends_with(".md") {
        clean_path.push_str(".md");
    }

    let target = resolve_safe_path(&clean_path)?;
    if target.exists() {
        return Err(VaultError::AlreadyExists(format!("File already exists: {}", clean_path)));
    }

    if let Some(parent) = target.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }

    let note_title = title
        .map(|t| t.to_string())
        .or_else(|| {
            target
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| "Новая заметка".to_string());

    let date_str = chrono_date_str();
    let initial_content = format!(
        "---\ntitle: \"{}\"\ndate: \"{}\"\ntags:\n  - draft\nstatus: draft\n---\n\n# {}\n\nНачните писать здесь...\n",
        note_title, date_str, note_title
    );

    fs::write(&target, initial_content)?;
    Ok(clean_path)
}

/// Creates a new directory relative to ~/knowledge
pub fn create_dir(relative_path: &str) -> Result<(), VaultError> {
    let target = resolve_safe_path(relative_path)?;
    if !target.exists() {
        fs::create_dir_all(target)?;
    }
    Ok(())
}

fn chrono_date_str() -> String {
    // Current date format YYYY-MM-DD
    let now = std::time::SystemTime::now();
    let duration = now.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let secs = duration.as_secs();
    // Simple naive date computation without external chrono crate
    let days = secs / 86400;
    let mut year = 1970;
    let mut d = days;
    loop {
        let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
        let days_in_year = if leap { 366 } else { 365 };
        if d < days_in_year {
            break;
        }
        d -= days_in_year;
        year += 1;
    }
    let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    let days_in_months = [
        31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31
    ];
    let mut month = 1;
    for &dim in &days_in_months {
        if d < dim {
            break;
        }
        d -= dim;
        month += 1;
    }
    let day = d + 1;
    format!("{:04}-{:02}-{:02}", year, month, day)
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
    fn test_extract_file_title() {
        let root = get_vault_root().unwrap();
        let path = root.join("10-System/systems/networking/amnezia-novpn-bypass.md");
        let title = extract_file_title(&path);
        assert!(title.is_some());
        assert!(title.unwrap().contains("AmneziaVPN"));
    }

    #[test]
    fn test_prevent_path_traversal() {
        let res = resolve_safe_path("../../../etc/passwd");
        assert!(res.is_err());
    }

    #[test]
    fn test_dir_meta_parsing() {
        let tree = build_vault_tree().expect("Should read vault tree");
        let system_node = tree.children.iter().find(|c| c.name == "10-System").expect("10-System exists");
        assert_eq!(system_node.title.as_deref(), Some("Система"));
        assert_eq!(system_node.icon.as_deref(), Some("🖥️"));
    }
}
