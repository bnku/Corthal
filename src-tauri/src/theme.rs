use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SystemThemeInfo {
    pub is_dark: bool,
    pub gtk_theme_name: String,
    pub system_accent: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GtkThemeSummary {
    pub name: String,
    pub path: String,
    pub is_dark: bool,
    pub accent_hint: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ParsedGtkColors {
    pub name: String,
    pub is_dark: bool,
    pub bg_main: String,
    pub bg_sidebar: String,
    pub bg_input: String,
    pub fg_primary: String,
    pub fg_muted: String,
    pub accent: String,
    pub border: String,
}

/// Detects active Linux GTK theme, dark/light mode, and system accent color
pub fn detect_system_theme() -> SystemThemeInfo {
    let mut theme_name = "Adwaita".to_string();
    let mut is_dark = true;

    // 1. Check ~/.config/gtk-3.0/settings.ini
    if let Some(home) = dirs::home_dir() {
        let gtk3_ini = home.join(".config/gtk-3.0/settings.ini");
        if let Ok(content) = fs::read_to_string(&gtk3_ini) {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("gtk-theme-name") {
                    if let Some((_, val)) = trimmed.split_once('=') {
                        theme_name = val.trim().to_string();
                    }
                } else if trimmed.starts_with("gtk-application-prefer-dark-theme") {
                    if let Some((_, val)) = trimmed.split_once('=') {
                        let v = val.trim().to_lowercase();
                        is_dark = v == "1" || v == "true";
                    }
                }
            }
        }
    }

    // 2. Try gsettings if theme_name is default or to verify
    if let Ok(output) = std::process::Command::new("gsettings")
        .args(["get", "org.cinnamon.desktop.interface", "gtk-theme"])
        .output()
    {
        if output.status.success() {
            let out_str = String::from_utf8_lossy(&output.stdout).trim().trim_matches('\'').to_string();
            if !out_str.is_empty() {
                theme_name = out_str;
            }
        }
    } else if let Ok(output) = std::process::Command::new("gsettings")
        .args(["get", "org.gnome.desktop.interface", "gtk-theme"])
        .output()
    {
        if output.status.success() {
            let out_str = String::from_utf8_lossy(&output.stdout).trim().trim_matches('\'').to_string();
            if !out_str.is_empty() {
                theme_name = out_str;
            }
        }
    }

    if theme_name.to_lowercase().contains("dark") {
        is_dark = true;
    }

    // 3. Detect system accent from theme name or gtk.css
    let system_accent = detect_accent_for_theme(&theme_name);

    SystemThemeInfo {
        is_dark,
        gtk_theme_name: theme_name,
        system_accent,
    }
}

/// Scans standard Linux directories for installed GTK themes
pub fn list_installed_gtk_themes() -> Vec<GtkThemeSummary> {
    let mut themes = Vec::new();
    let mut search_dirs = vec![PathBuf::from("/usr/share/themes")];
    if let Some(home) = dirs::home_dir() {
        search_dirs.push(home.join(".themes"));
        search_dirs.push(home.join(".local/share/themes"));
    }

    for base_dir in search_dirs {
        if !base_dir.exists() {
            continue;
        }
        if let Ok(entries) = fs::read_dir(&base_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let has_gtk3 = path.join("gtk-3.0").exists();
                    let has_gtk4 = path.join("gtk-4.0").exists();
                    if has_gtk3 || has_gtk4 {
                        let name = entry.file_name().to_string_lossy().to_string();
                        let is_dark = name.to_lowercase().contains("dark");
                        let accent_hint = detect_accent_for_theme(&name);
                        themes.push(GtkThemeSummary {
                            name,
                            path: path.to_string_lossy().to_string(),
                            is_dark,
                            accent_hint,
                        });
                    }
                }
            }
        }
    }

    themes.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    themes.dedup_by(|a, b| a.name == b.name);
    themes
}

/// Parses a GTK theme's gtk.css file into a unified color scheme
pub fn parse_gtk_theme_colors(theme_path: &str) -> Result<ParsedGtkColors, String> {
    let base = Path::new(theme_path);
    let mut css_file = base.join("gtk-3.0/gtk.css");
    if !css_file.exists() {
        css_file = base.join("gtk-4.0/gtk.css");
    }
    if !css_file.exists() && base.is_file() {
        css_file = base.to_path_buf();
    }

    let theme_name = base
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Custom GTK".to_string());

    let is_dark = theme_name.to_lowercase().contains("dark");

    // Sensible defaults in case CSS is binary or uses complicated imports
    let mut bg_main = if is_dark { "#1f2229".to_string() } else { "#f6f8fa".to_string() };
    let mut bg_sidebar = if is_dark { "#191b20".to_string() } else { "#eceff4".to_string() };
    let mut bg_input = if is_dark { "#282b34".to_string() } else { "#ffffff".to_string() };
    let mut fg_primary = if is_dark { "#e2e8f0".to_string() } else { "#1e293b".to_string() };
    let fg_muted = if is_dark { "#828d9e".to_string() } else { "#64748b".to_string() };
    let mut accent = detect_accent_for_theme(&theme_name).unwrap_or_else(|| "#3b82f6".to_string());
    let mut border = if is_dark { "rgba(255, 255, 255, 0.08)".to_string() } else { "rgba(0, 0, 0, 0.1)".to_string() };

    if css_file.exists() {
        if let Ok(content) = fs::read_to_string(&css_file) {
            // 1. Try to find @define-color definitions
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("@define-color") {
                    let parts: Vec<&str> = trimmed.split_whitespace().collect();
                    if parts.len() >= 3 {
                        let color_name = parts[1];
                        let val = parts[2].trim_end_matches(';');
                        if val.starts_with('#') || val.starts_with("rgb") {
                            match color_name {
                                "theme_bg_color" | "bg_color" => bg_main = val.to_string(),
                                "theme_base_color" | "base_color" => bg_input = val.to_string(),
                                "theme_fg_color" | "fg_color" => fg_primary = val.to_string(),
                                "theme_text_color" | "text_color" => fg_primary = val.to_string(),
                                "theme_selected_bg_color" | "selected_bg_color" => accent = val.to_string(),
                                "borders" | "theme_borders" => border = val.to_string(),
                                _ => {}
                            }
                        }
                    }
                }
            }

            // 2. Try to find background-color in .background or .gtkstyle-fallback
            if let Some(pos) = content.find(".background {") {
                let slice = &content[pos..content.len().min(pos + 300)];
                if let Some(bg_line) = slice.lines().find(|l| l.contains("background-color:")) {
                    if let Some((_, val)) = bg_line.split_once(':') {
                        let cleaned = val.trim().trim_end_matches(';').trim();
                        if !cleaned.is_empty() {
                            bg_sidebar = cleaned.to_string();
                        }
                    }
                }
            }

            // 3. Try to find selected background color in .gtkstyle-fallback:selected or .view:selected
            if let Some(pos) = content.find(":selected") {
                let slice = &content[pos..content.len().min(pos + 300)];
                if let Some(bg_line) = slice.lines().find(|l| l.contains("background-color:")) {
                    if let Some((_, val)) = bg_line.split_once(':') {
                        let cleaned = val.trim().trim_end_matches(';').trim();
                        if cleaned.starts_with('#') {
                            accent = cleaned.to_string();
                        }
                    }
                }
            }
        }
    }

    Ok(ParsedGtkColors {
        name: theme_name,
        is_dark,
        bg_main,
        bg_sidebar,
        bg_input,
        fg_primary,
        fg_muted,
        accent,
        border,
    })
}

fn detect_accent_for_theme(theme_name: &str) -> Option<String> {
    let lower = theme_name.to_lowercase();
    if lower.contains("blue") {
        Some("#0c75de".to_string())
    } else if lower.contains("aqua") {
        Some("#00bcd4".to_string())
    } else if lower.contains("teal") {
        Some("#009688".to_string())
    } else if lower.contains("orange") {
        Some("#ff9800".to_string())
    } else if lower.contains("pink") {
        Some("#e91e63".to_string())
    } else if lower.contains("purple") {
        Some("#9c27b0".to_string())
    } else if lower.contains("red") {
        Some("#f44336".to_string())
    } else if lower.contains("sand") || lower.contains("brown") {
        Some("#a1887f".to_string())
    } else if lower.contains("green") {
        Some("#4caf50".to_string())
    } else if lower.contains("grey") || lower.contains("gray") {
        Some("#78909c".to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_system_theme() {
        let info = detect_system_theme();
        println!("Detected theme: {:?}", info);
        assert!(!info.gtk_theme_name.is_empty());
    }

    #[test]
    fn test_list_installed_gtk_themes() {
        let list = list_installed_gtk_themes();
        println!("Found {} themes", list.len());
        assert!(!list.is_empty());
        let names: Vec<String> = list.iter().map(|t| t.name.clone()).collect();
        assert!(names.iter().any(|n| n.contains("Mint") || n.contains("Adwaita")));
    }

    #[test]
    fn test_parse_mint_y_dark_blue() {
        let res = parse_gtk_theme_colors("/usr/share/themes/Mint-Y-Dark-Blue");
        assert!(res.is_ok());
        let colors = res.unwrap();
        println!("Parsed colors: {:?}", colors);
        assert_eq!(colors.accent, "#0c75de");
        assert!(colors.is_dark);
    }
}
