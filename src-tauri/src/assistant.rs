use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, RwLock};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssistantConfig {
    pub provider: String, // "codex" | "openrouter" | "openai"
    pub codex_model: String,
    pub codex_sandbox: String, // "read-only" | "workspace-write"
    pub openrouter_key: Option<String>,
    pub openrouter_model: String,
    pub openrouter_temperature: f32,
    pub openai_base_url: String,
    pub openai_key: Option<String>,
    pub openai_model: String,
    pub openai_temperature: f32,
    pub system_prompt: String,
    pub include_vault_context: bool,
    pub include_active_note: bool,
}

impl Default for AssistantConfig {
    fn default() -> Self {
        Self {
            provider: "codex".to_string(),
            codex_model: "gpt-5.6-sol".to_string(),
            codex_sandbox: "read-only".to_string(),
            openrouter_key: None,
            openrouter_model: "anthropic/claude-3.5-sonnet".to_string(),
            openrouter_temperature: 0.7,
            openai_base_url: "http://localhost:11434/v1".to_string(),
            openai_key: None,
            openai_model: "llama3".to_string(),
            openai_temperature: 0.7,
            system_prompt: "Ты — встроенный AI-ассистент базы знаний Cortex. Ты помогаешь формулировать мысли, структурировать заметки и связывать концепции. Все секреты, переданные в формате 🔒[enc:...], являются защищенными токенами шифрования Age — сохраняй их в неизменном виде.".to_string(),
            include_vault_context: true,
            include_active_note: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodexStatus {
    pub installed: bool,
    pub binary_path: String,
    pub login_status: String,
    pub is_logged_in: bool,
    pub available_models: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AssistantStreamChunk {
    pub session_id: String,
    pub delta: String,
    pub full_text: String,
    pub done: bool,
    pub error: Option<String>,
}

static ACTIVE_CANCELLATIONS: LazyLock<Arc<RwLock<HashMap<String, tokio::sync::oneshot::Sender<()>>>>> =
    LazyLock::new(|| Arc::new(RwLock::new(HashMap::new())));

fn get_config_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    home.join(".config").join("cortex").join("assistant_config.json")
}

pub fn load_assistant_config() -> AssistantConfig {
    let p = get_config_path();
    if p.exists() {
        if let Ok(content) = fs::read_to_string(&p) {
            if let Ok(cfg) = serde_json::from_str::<AssistantConfig>(&content) {
                return cfg;
            }
        }
    }
    AssistantConfig::default()
}

pub fn save_assistant_config(cfg: &AssistantConfig) -> Result<(), String> {
    let p = get_config_path();
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let content = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    fs::write(p, content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Detect Codex CLI installation and ChatGPT login status
pub async fn check_codex_status() -> CodexStatus {
    let possible_paths = [
        dirs::home_dir().map(|h| h.join(".local/bin/codex")).unwrap_or_default(),
        PathBuf::from("/usr/local/bin/codex"),
        PathBuf::from("/usr/bin/codex"),
    ];

    let mut found_path = None;
    for p in &possible_paths {
        if p.exists() {
            found_path = Some(p.to_string_lossy().to_string());
            break;
        }
    }

    if found_path.is_none() {
        if let Ok(output) = std::process::Command::new("which").arg("codex").output() {
            if output.status.success() {
                let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !s.is_empty() {
                    found_path = Some(s);
                }
            }
        }
    }

    let installed = found_path.is_some();
    let binary_path = found_path.unwrap_or_else(|| "codex".to_string());

    let mut login_status = "Не установлен".to_string();
    let mut is_logged_in = false;

    if installed {
        if let Ok(output) = std::process::Command::new(&binary_path)
            .args(["login", "status"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            let combined = if stdout.is_empty() { stderr } else { stdout };
            login_status = combined.clone();
            if combined.contains("Logged in using ChatGPT") || combined.contains("Logged in") {
                is_logged_in = true;
            }
        }
    }

    let available_models = vec![
        "gpt-5.6-sol".to_string(),
        "o3-mini".to_string(),
        "o1".to_string(),
        "gpt-4o".to_string(),
    ];

    CodexStatus {
        installed,
        binary_path,
        login_status,
        is_logged_in,
        available_models,
    }
}

pub fn cancel_assistant_stream(session_id: &str) -> bool {
    if let Ok(mut map) = ACTIVE_CANCELLATIONS.write() {
        if let Some(tx) = map.remove(session_id) {
            let _ = tx.send(());
            return true;
        }
    }
    false
}

/// Send assistant query and stream output back via Tauri events
pub async fn send_assistant_message(
    app: AppHandle,
    session_id: String,
    prompt: String,
    messages: Vec<ChatMessage>,
    active_note_context: Option<String>,
) -> Result<(), String> {
    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
    {
        if let Ok(mut map) = ACTIVE_CANCELLATIONS.write() {
            map.insert(session_id.clone(), cancel_tx);
        }
    }

    let config = load_assistant_config();
    let vault_root = crate::vault::get_vault_root().unwrap_or_else(|_| PathBuf::from("."));

    // Prepare contextual prompt
    let mut full_system = config.system_prompt.clone();
    if config.include_vault_context {
        full_system.push_str(&format!(
            "\n\nТекущая рабочая база знаний: {}\n",
            vault_root.to_string_lossy()
        ));
    }
    if config.include_active_note {
        if let Some(note_ctx) = active_note_context {
            full_system.push_str(&format!("\n\nОткрытая заметка:\n{}\n", note_ctx));
        }
    }

    let result = match config.provider.as_str() {
        "codex" => {
            stream_codex(
                &app,
                &session_id,
                &config,
                &vault_root,
                &full_system,
                &prompt,
                &mut cancel_rx,
            )
            .await
        }
        "openrouter" => {
            stream_openrouter(
                &app,
                &session_id,
                &config,
                &full_system,
                &messages,
                &prompt,
                &mut cancel_rx,
            )
            .await
        }
        "openai" => {
            stream_openai(
                &app,
                &session_id,
                &config,
                &full_system,
                &messages,
                &prompt,
                &mut cancel_rx,
            )
            .await
        }
        other => Err(format!("Неизвестный провайдер AI: {}", other)),
    };

    // Remove from cancellations
    if let Ok(mut map) = ACTIVE_CANCELLATIONS.write() {
        map.remove(&session_id);
    }

    if let Err(e) = result {
        let _ = app.emit(
            "assistant:chunk",
            AssistantStreamChunk {
                session_id,
                delta: String::new(),
                full_text: String::new(),
                done: true,
                error: Some(e),
            },
        );
    }

    Ok(())
}

async fn stream_codex(
    app: &AppHandle,
    session_id: &str,
    config: &AssistantConfig,
    vault_root: &std::path::Path,
    system_prompt: &str,
    user_prompt: &str,
    cancel_rx: &mut tokio::sync::oneshot::Receiver<()>,
) -> Result<(), String> {
    let codex_status = check_codex_status().await;
    if !codex_status.installed {
        return Err("Codex CLI не установлен на данной машине (~/.local/bin/codex)".into());
    }

    let composed_prompt = format!("{}\n\nПользователь: {}", system_prompt, user_prompt);

    let sandbox_arg = if config.codex_sandbox == "workspace-write" {
        "workspace-write"
    } else {
        "read-only"
    };

    let mut cmd = tokio::process::Command::new(&codex_status.binary_path);
    cmd.args([
        "exec",
        "--skip-git-repo-check",
        "--json",
        "--ephemeral",
        "-s",
        sandbox_arg,
        "-C",
        &vault_root.to_string_lossy(),
    ]);

    if !config.codex_model.is_empty() && config.codex_model != "default" {
        cmd.args(["-m", &config.codex_model]);
    }

    cmd.arg(&composed_prompt);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Не удалось запустить codex exec: {}", e))?;
    let stdout = child.stdout.take().ok_or("Не удалось получить stdout codex")?;

    use tokio::io::{AsyncBufReadExt, BufReader};
    let mut reader = BufReader::new(stdout).lines();

    let mut full_accumulated = String::new();

    loop {
        tokio::select! {
            _ = &mut *cancel_rx => {
                let _ = child.kill().await;
                let _ = app.emit("assistant:chunk", AssistantStreamChunk {
                    session_id: session_id.to_string(),
                    delta: "\n\n*[Генерация остановлена пользователем]*".into(),
                    full_text: format!("{}\n\n*[Генерация остановлена пользователем]*", full_accumulated),
                    done: true,
                    error: None,
                });
                return Ok(());
            }
            line_res = reader.next_line() => {
                match line_res {
                    Ok(Some(line)) => {
                        let trimmed = line.trim();
                        if trimmed.is_empty() { continue; }

                        // Parse Codex JSONL events
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                            let event_type = val.get("type").and_then(|t| t.as_str()).unwrap_or("");
                            if event_type == "item.completed" {
                                if let Some(item) = val.get("item") {
                                    if item.get("type").and_then(|t| t.as_str()) == Some("agent_message") {
                                        if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                            full_accumulated = text.to_string();
                                            let _ = app.emit("assistant:chunk", AssistantStreamChunk {
                                                session_id: session_id.to_string(),
                                                delta: text.to_string(),
                                                full_text: full_accumulated.clone(),
                                                done: false,
                                                error: None,
                                            });
                                        }
                                    }
                                }
                            } else if event_type == "item.delta" {
                                if let Some(delta) = val.get("delta").and_then(|d| d.as_str()) {
                                    full_accumulated.push_str(delta);
                                    let _ = app.emit("assistant:chunk", AssistantStreamChunk {
                                        session_id: session_id.to_string(),
                                        delta: delta.to_string(),
                                        full_text: full_accumulated.clone(),
                                        done: false,
                                        error: None,
                                    });
                                }
                            }
                        }
                    }
                    Ok(None) => break,
                    Err(e) => return Err(format!("Ошибка чтения вывода codex: {}", e)),
                }
            }
        }
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    if !status.success() && full_accumulated.is_empty() {
        return Err(format!("Codex завершился с кодом ошибки {:?}", status.code()));
    }

    let _ = app.emit(
        "assistant:chunk",
        AssistantStreamChunk {
            session_id: session_id.to_string(),
            delta: String::new(),
            full_text: full_accumulated,
            done: true,
            error: None,
        },
    );

    Ok(())
}

async fn stream_openrouter(
    app: &AppHandle,
    session_id: &str,
    config: &AssistantConfig,
    system_prompt: &str,
    history: &[ChatMessage],
    user_prompt: &str,
    cancel_rx: &mut tokio::sync::oneshot::Receiver<()>,
) -> Result<(), String> {
    let key = config
        .openrouter_key
        .as_ref()
        .filter(|k| !k.trim().is_empty())
        .ok_or("Не задан API-ключ OpenRouter в настройках ассистента")?;

    let mut messages_payload = Vec::new();
    messages_payload.push(serde_json::json!({
        "role": "system",
        "content": system_prompt
    }));

    for m in history {
        messages_payload.push(serde_json::json!({
            "role": m.role,
            "content": m.content
        }));
    }

    messages_payload.push(serde_json::json!({
        "role": "user",
        "content": user_prompt
    }));

    let body = serde_json::json!({
        "model": config.openrouter_model,
        "messages": messages_payload,
        "stream": true,
        "temperature": config.openrouter_temperature
    });

    let client = reqwest::Client::new();
    let resp = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", key.trim()))
        .header("HTTP-Referer", "https://cortex.local")
        .header("X-Title", "Cortex Personal Knowledge Base")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ошибка отправки запроса в OpenRouter: {}", e))?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("OpenRouter вернул ошибку: {}", err_text));
    }

    process_sse_stream(app, session_id, resp, cancel_rx).await
}

async fn stream_openai(
    app: &AppHandle,
    session_id: &str,
    config: &AssistantConfig,
    system_prompt: &str,
    history: &[ChatMessage],
    user_prompt: &str,
    cancel_rx: &mut tokio::sync::oneshot::Receiver<()>,
) -> Result<(), String> {
    let base_url = config.openai_base_url.trim_end_matches('/');
    let endpoint = format!("{}/chat/completions", base_url);

    let mut messages_payload = Vec::new();
    messages_payload.push(serde_json::json!({
        "role": "system",
        "content": system_prompt
    }));

    for m in history {
        messages_payload.push(serde_json::json!({
            "role": m.role,
            "content": m.content
        }));
    }

    messages_payload.push(serde_json::json!({
        "role": "user",
        "content": user_prompt
    }));

    let body = serde_json::json!({
        "model": config.openai_model,
        "messages": messages_payload,
        "stream": true,
        "temperature": config.openai_temperature
    });

    let client = reqwest::Client::new();
    let mut req = client.post(&endpoint).header("Content-Type", "application/json");

    if let Some(key) = &config.openai_key {
        if !key.trim().is_empty() {
            req = req.header("Authorization", format!("Bearer {}", key.trim()));
        }
    }

    let resp = req
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ошибка запроса к OpenAI API ({}): {}", endpoint, e))?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("OpenAI API ({}) вернул ошибку: {}", endpoint, err_text));
    }

    process_sse_stream(app, session_id, resp, cancel_rx).await
}

async fn process_sse_stream(
    app: &AppHandle,
    session_id: &str,
    resp: reqwest::Response,
    cancel_rx: &mut tokio::sync::oneshot::Receiver<()>,
) -> Result<(), String> {
    let mut stream = resp.bytes_stream();
    let mut full_accumulated = String::new();
    let mut buffer = String::new();

    loop {
        tokio::select! {
            _ = &mut *cancel_rx => {
                let _ = app.emit("assistant:chunk", AssistantStreamChunk {
                    session_id: session_id.to_string(),
                    delta: "\n\n*[Генерация остановлена пользователем]*".into(),
                    full_text: format!("{}\n\n*[Генерация остановлена пользователем]*", full_accumulated),
                    done: true,
                    error: None,
                });
                return Ok(());
            }
            item_opt = stream.next() => {
                match item_opt {
                    Some(Ok(bytes)) => {
                        let text = String::from_utf8_lossy(&bytes);
                        buffer.push_str(&text);

                        while let Some(pos) = buffer.find('\n') {
                            let line = buffer[..pos].trim().to_string();
                            buffer = buffer[pos + 1..].to_string();

                            if line.starts_with("data:") {
                                let payload = line.trim_start_matches("data:").trim();
                                if payload == "[DONE]" {
                                    let _ = app.emit("assistant:chunk", AssistantStreamChunk {
                                        session_id: session_id.to_string(),
                                        delta: String::new(),
                                        full_text: full_accumulated.clone(),
                                        done: true,
                                        error: None,
                                    });
                                    return Ok(());
                                }

                                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(payload) {
                                    if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
                                        if let Some(choice) = choices.first() {
                                            if let Some(delta) = choice.get("delta") {
                                                if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                                    full_accumulated.push_str(content);
                                                    let _ = app.emit("assistant:chunk", AssistantStreamChunk {
                                                        session_id: session_id.to_string(),
                                                        delta: content.to_string(),
                                                        full_text: full_accumulated.clone(),
                                                        done: false,
                                                        error: None,
                                                    });
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Some(Err(e)) => return Err(format!("Ошибка в потоке данных: {}", e)),
                    None => break,
                }
            }
        }
    }

    let _ = app.emit(
        "assistant:chunk",
        AssistantStreamChunk {
            session_id: session_id.to_string(),
            delta: String::new(),
            full_text: full_accumulated,
            done: true,
            error: None,
        },
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_assistant_config_defaults() {
        let cfg = AssistantConfig::default();
        assert_eq!(cfg.provider, "codex");
        assert_eq!(cfg.codex_model, "gpt-5.6-sol");
        assert_eq!(cfg.codex_sandbox, "read-only");
        assert!(cfg.include_vault_context);
    }

    #[test]
    fn test_assistant_config_json_roundtrip() {
        let mut cfg = AssistantConfig::default();
        cfg.provider = "openrouter".into();
        cfg.openrouter_model = "anthropic/claude-3.7-sonnet".into();
        let json = serde_json::to_string(&cfg).unwrap();
        let back: AssistantConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back.provider, "openrouter");
        assert_eq!(back.openrouter_model, "anthropic/claude-3.7-sonnet");
    }

    #[tokio::test]
    async fn test_codex_status_detection() {
        let status = check_codex_status().await;
        // On this machine, codex is installed in ~/.local/bin/codex
        assert!(status.installed);
        assert!(status.binary_path.contains("codex"));
        assert!(status.is_logged_in);
    }

    #[test]
    fn test_cancel_nonexistent_stream() {
        assert!(!cancel_assistant_stream("non-existent-session-id"));
    }
}

