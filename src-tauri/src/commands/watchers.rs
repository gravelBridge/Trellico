use crate::commands::plans::get_plan_files;
use crate::commands::ralph::get_ralph_prd_files;
use crate::models::PlanChangeEvent;
use crate::state::{
    KNOWN_PLANS, KNOWN_RALPH_PRDS, PLANS_WATCHER, RALPH_ITERATIONS_WATCHER, RALPH_PRD_WATCHER,
};
use crate::utils::paths::{plans_dir, ralph_dir, ralph_iterations_path, trellico_dir};
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub fn watch_plans(app: AppHandle, folder_path: String) -> Result<(), String> {
    let plans_path = plans_dir(&folder_path);

    // Create plans directory if it doesn't exist
    if !plans_path.exists() {
        fs::create_dir_all(&plans_path)
            .map_err(|e| format!("Failed to create plans directory: {}", e))?;
    }

    // Initialize known plans
    if let Ok(mut known) = KNOWN_PLANS.lock() {
        *known = get_plan_files(&plans_path);
    }

    let app_clone = app.clone();
    let plans_path_clone = plans_path.clone();
    let watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                // Always emit plans-changed for any file system event in the plans directory
                match event.kind {
                    EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {
                        // Scan current files and compare with known to detect what changed
                        let current_files = get_plan_files(&plans_path_clone);

                        if let Ok(mut known) = KNOWN_PLANS.lock() {
                            // Find new files (in current but not in known)
                            let added: Vec<_> =
                                current_files.difference(&known).cloned().collect();
                            // Find removed files (in known but not in current)
                            let removed: Vec<_> =
                                known.difference(&current_files).cloned().collect();

                            // If exactly one added and one removed, it's likely a rename
                            if added.len() == 1 && removed.len() == 1 {
                                let _ = app_clone.emit(
                                    "plan-change",
                                    PlanChangeEvent {
                                        change_type: "renamed".to_string(),
                                        file_name: added[0].clone(),
                                        old_file_name: Some(removed[0].clone()),
                                    },
                                );
                            } else {
                                // Emit individual events
                                for file in &added {
                                    let _ = app_clone.emit(
                                        "plan-change",
                                        PlanChangeEvent {
                                            change_type: "created".to_string(),
                                            file_name: file.clone(),
                                            old_file_name: None,
                                        },
                                    );
                                }
                                for file in &removed {
                                    let _ = app_clone.emit(
                                        "plan-change",
                                        PlanChangeEvent {
                                            change_type: "removed".to_string(),
                                            file_name: file.clone(),
                                            old_file_name: None,
                                        },
                                    );
                                }
                            }

                            // For modifications, check if the event path is an existing .md file
                            if let EventKind::Modify(_) = event.kind {
                                if let Some(path) = event.paths.first() {
                                    if path.extension().is_some_and(|ext| ext == "md") {
                                        if let Some(name) =
                                            path.file_stem().and_then(|s| s.to_str())
                                        {
                                            if current_files.contains(name)
                                                && known.contains(name)
                                            {
                                                let _ = app_clone.emit(
                                                    "plan-change",
                                                    PlanChangeEvent {
                                                        change_type: "modified".to_string(),
                                                        file_name: name.to_string(),
                                                        old_file_name: None,
                                                    },
                                                );
                                            }
                                        }
                                    }
                                }
                            }

                            // Update known plans
                            *known = current_files;
                        }

                        // Always emit plans-changed so the UI refreshes
                        let _ = app_clone.emit("plans-changed", ());
                    }
                    _ => {}
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    // Store the watcher
    if let Ok(mut guard) = PLANS_WATCHER.lock() {
        *guard = Some(watcher);
    }

    // Start watching
    if let Ok(mut guard) = PLANS_WATCHER.lock() {
        if let Some(ref mut w) = *guard {
            w.watch(&plans_path, RecursiveMode::Recursive)
                .map_err(|e| format!("Failed to watch directory: {}", e))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn watch_ralph_prds(app: AppHandle, folder_path: String) -> Result<(), String> {
    let ralph_path = ralph_dir(&folder_path);

    // Create ralph directory if it doesn't exist
    if !ralph_path.exists() {
        fs::create_dir_all(&ralph_path)
            .map_err(|e| format!("Failed to create ralph directory: {}", e))?;
    }

    // Initialize known ralph PRDs
    if let Ok(mut known) = KNOWN_RALPH_PRDS.lock() {
        *known = get_ralph_prd_files(&ralph_path);
    }

    let app_clone = app.clone();
    let ralph_path_clone = ralph_path.clone();
    let watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                match event.kind {
                    EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {
                        let current_files = get_ralph_prd_files(&ralph_path_clone);

                        if let Ok(mut known) = KNOWN_RALPH_PRDS.lock() {
                            *known = current_files;
                        }

                        // Emit ralph-prd-changed so the UI refreshes
                        let _ = app_clone.emit("ralph-prd-changed", ());
                    }
                    _ => {}
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    // Store the watcher
    if let Ok(mut guard) = RALPH_PRD_WATCHER.lock() {
        *guard = Some(watcher);
    }

    // Start watching
    if let Ok(mut guard) = RALPH_PRD_WATCHER.lock() {
        if let Some(ref mut w) = *guard {
            w.watch(&ralph_path, RecursiveMode::Recursive)
                .map_err(|e| format!("Failed to watch directory: {}", e))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn watch_ralph_iterations(app: AppHandle, folder_path: String) -> Result<(), String> {
    let iterations_path = ralph_iterations_path(&folder_path);
    let trellico_path = trellico_dir(&folder_path);

    // Create .trellico directory if it doesn't exist
    if !trellico_path.exists() {
        fs::create_dir_all(&trellico_path)
            .map_err(|e| format!("Failed to create .trellico directory: {}", e))?;
    }

    let app_clone = app.clone();
    let iterations_path_clone = PathBuf::from(&iterations_path);
    let watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                // Only react to changes to the iterations file
                let is_iterations_file = event.paths.iter().any(|p| p == &iterations_path_clone);
                if !is_iterations_file {
                    return;
                }

                match event.kind {
                    EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {
                        // Emit ralph-iterations-changed so the UI refreshes
                        let _ = app_clone.emit("ralph-iterations-changed", ());
                    }
                    _ => {}
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    // Store the watcher
    if let Ok(mut guard) = RALPH_ITERATIONS_WATCHER.lock() {
        *guard = Some(watcher);
    }

    // Start watching the .trellico directory (since the file might not exist yet)
    if let Ok(mut guard) = RALPH_ITERATIONS_WATCHER.lock() {
        if let Some(ref mut w) = *guard {
            w.watch(&trellico_path, RecursiveMode::NonRecursive)
                .map_err(|e| format!("Failed to watch directory: {}", e))?;
        }
    }

    Ok(())
}
