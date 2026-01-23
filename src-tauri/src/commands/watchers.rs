use crate::commands::plans::get_plan_files;
use crate::commands::ralph::get_ralph_prd_files;
use crate::models::{PlanChangeEvent, PlansChangedEvent, RalphPrdChangeEvent};
use crate::state::FOLDER_WATCHERS;
use crate::utils::paths::{plans_dir, ralph_dir};
use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::fs;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub fn watch_plans(app: AppHandle, folder_path: String) -> Result<(), String> {
    let plans_path = plans_dir(&folder_path);
    let folder_path_for_closure = folder_path.clone();

    // Create plans directory if it doesn't exist
    if !plans_path.exists() {
        fs::create_dir_all(&plans_path)
            .map_err(|e| format!("Failed to create plans directory: {}", e))?;
    }

    // Initialize known plans for this folder
    let initial_plans = get_plan_files(&plans_path);

    let app_clone = app.clone();
    let plans_path_clone = plans_path.clone();
    let folder_path_clone = folder_path_for_closure.clone();

    let watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                match event.kind {
                    EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {
                        let current_files = get_plan_files(&plans_path_clone);

                        // Get known plans for this folder
                        if let Ok(mut folder_watchers) = FOLDER_WATCHERS.lock() {
                            if let Some(fw) = folder_watchers.get_mut(&folder_path_clone) {
                                let known = &mut fw.known_plans;

                                // Find new files (in current but not in known)
                                let added: Vec<_> =
                                    current_files.difference(known).cloned().collect();
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
                                            folder_path: folder_path_clone.clone(),
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
                                                folder_path: folder_path_clone.clone(),
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
                                                folder_path: folder_path_clone.clone(),
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
                                                            folder_path: folder_path_clone.clone(),
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
                        }

                        // Always emit plans-changed so the UI refreshes
                        let _ = app_clone.emit("plans-changed", PlansChangedEvent {
                            folder_path: folder_path_clone.clone(),
                        });
                    }
                    _ => {}
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    // Store the watcher and start watching
    if let Ok(mut folder_watchers) = FOLDER_WATCHERS.lock() {
        let fw = folder_watchers.entry(folder_path.clone()).or_default();
        fw.known_plans = initial_plans;
        fw.plans_watcher = Some(watcher);

        // Start watching
        if let Some(ref mut w) = fw.plans_watcher {
            w.watch(&plans_path, RecursiveMode::Recursive)
                .map_err(|e| format!("Failed to watch directory: {}", e))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn watch_ralph_prds(app: AppHandle, folder_path: String) -> Result<(), String> {
    let ralph_path = ralph_dir(&folder_path);
    let folder_path_for_closure = folder_path.clone();

    // Create ralph directory if it doesn't exist
    if !ralph_path.exists() {
        fs::create_dir_all(&ralph_path)
            .map_err(|e| format!("Failed to create ralph directory: {}", e))?;
    }

    // Initialize known ralph PRDs for this folder
    let initial_prds = get_ralph_prd_files(&ralph_path);

    let app_clone = app.clone();
    let ralph_path_clone = ralph_path.clone();
    let folder_path_clone = folder_path_for_closure.clone();

    let watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                match event.kind {
                    EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_) => {
                        let current_files = get_ralph_prd_files(&ralph_path_clone);

                        // Update known PRDs for this folder
                        if let Ok(mut folder_watchers) = FOLDER_WATCHERS.lock() {
                            if let Some(fw) = folder_watchers.get_mut(&folder_path_clone) {
                                fw.known_ralph_prds = current_files;
                            }
                        }

                        // Emit ralph-prd-changed so the UI refreshes
                        let _ = app_clone.emit("ralph-prd-changed", RalphPrdChangeEvent {
                            folder_path: folder_path_clone.clone(),
                        });
                    }
                    _ => {}
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| format!("Failed to create watcher: {}", e))?;

    // Store the watcher and start watching
    if let Ok(mut folder_watchers) = FOLDER_WATCHERS.lock() {
        let fw = folder_watchers.entry(folder_path.clone()).or_default();
        fw.known_ralph_prds = initial_prds;
        fw.ralph_prd_watcher = Some(watcher);

        // Start watching
        if let Some(ref mut w) = fw.ralph_prd_watcher {
            w.watch(&ralph_path, RecursiveMode::Recursive)
                .map_err(|e| format!("Failed to watch directory: {}", e))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn stop_watching_folder(folder_path: String) -> Result<(), String> {
    if let Ok(mut folder_watchers) = FOLDER_WATCHERS.lock() {
        // Remove the folder entry, which will drop all watchers
        folder_watchers.remove(&folder_path);
    }
    Ok(())
}
