use notify_debouncer_mini::{
    new_debouncer,
    notify::{RecommendedWatcher, RecursiveMode},
    DebounceEventResult, Debouncer,
};
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

pub struct VaultWatcherState(pub Arc<Mutex<Option<Debouncer<RecommendedWatcher>>>>);

impl Default for VaultWatcherState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(None)))
    }
}

pub fn start_vault_watcher(app_handle: AppHandle, root_path: &Path) -> Result<(), String> {
    let state = app_handle.state::<VaultWatcherState>();
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    // Stop existing watcher if any
    *guard = None;

    let app_clone = app_handle.clone();
    let mut debouncer = new_debouncer(Duration::from_millis(250), move |res: DebounceEventResult| {
        match res {
            Ok(events) => {
                let relevant = events.iter().any(|e| {
                    let s = e.path.to_string_lossy();
                    !s.contains("/.git/") && !s.contains("/.obsidian/")
                });
                if relevant {
                    let _ = app_clone.emit("vault:fs-change", ());
                }
            }
            Err(err) => {
                eprintln!("Vault watcher error: {:?}", err);
            }
        }
    })
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    debouncer
        .watcher()
        .watch(root_path, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch path: {}", e))?;

    *guard = Some(debouncer);
    Ok(())
}

pub fn stop_vault_watcher(app_handle: &AppHandle) -> Result<(), String> {
    let state = app_handle.state::<VaultWatcherState>();
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}
