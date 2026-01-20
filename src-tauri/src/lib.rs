use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher, EventKind};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashSet;
use std::sync::LazyLock;
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_decorum::WebviewWindowExt;
use chrono::Utc;

static PROCESS_RUNNING: AtomicBool = AtomicBool::new(false);
static STOP_REQUESTED: AtomicBool = AtomicBool::new(false);
static MASTER_PTY: Mutex<Option<Box<dyn MasterPty + Send>>> = Mutex::new(None);
static PLANS_WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);

// Session-Plan linking types
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct SessionPlanLink {
    session_id: String,
    plan_file_name: String,
    #[serde(default = "default_link_type")]
    link_type: String,  // "plan" or "ralph_prd"
    created_at: String,
    updated_at: String,
}

fn default_link_type() -> String {
    "plan".to_string()
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct SessionLinksStore {
    version: u32,
    links: Vec<SessionPlanLink>,
}

// Plan change event type
#[derive(serde::Serialize, Clone)]
struct PlanChangeEvent {
    change_type: String,  // "created" | "modified" | "removed" | "renamed"
    file_name: String,
    old_file_name: Option<String>,
}

#[tauri::command]
fn setup_folder(folder_path: String) -> Result<(), String> {
    let trellico_path = Path::new(&folder_path).join(".trellico");
    if !trellico_path.exists() {
        fs::create_dir(&trellico_path)
            .map_err(|e| format!("Failed to create .trellico folder: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn list_plans(folder_path: String) -> Result<Vec<String>, String> {
    let plans_path = Path::new(&folder_path).join(".trellico").join("plans");
    if !plans_path.exists() {
        return Ok(vec![]);
    }

    let mut plans = Vec::new();
    let entries = fs::read_dir(&plans_path)
        .map_err(|e| format!("Failed to read plans directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().map_or(false, |ext| ext == "md") {
            if let Some(stem) = path.file_stem() {
                if let Some(name) = stem.to_str() {
                    plans.push(name.to_string());
                }
            }
        }
    }

    plans.sort();
    Ok(plans)
}

#[tauri::command]
fn read_plan(folder_path: String, plan_name: String) -> Result<String, String> {
    let plan_path = Path::new(&folder_path)
        .join(".trellico")
        .join("plans")
        .join(format!("{}.md", plan_name));

    fs::read_to_string(&plan_path)
        .map_err(|e| format!("Failed to read plan file: {}", e))
}

#[tauri::command]
fn list_ralph_prds(folder_path: String) -> Result<Vec<String>, String> {
    let ralph_prd_path = Path::new(&folder_path).join(".trellico").join("ralph-prd");
    if !ralph_prd_path.exists() {
        return Ok(vec![]);
    }

    let mut prds = Vec::new();
    let entries = fs::read_dir(&ralph_prd_path)
        .map_err(|e| format!("Failed to read ralph-prd directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().map_or(false, |ext| ext == "json") {
            if let Some(stem) = path.file_stem() {
                if let Some(name) = stem.to_str() {
                    prds.push(name.to_string());
                }
            }
        }
    }

    prds.sort();
    Ok(prds)
}

#[tauri::command]
fn read_ralph_prd(folder_path: String, prd_name: String) -> Result<String, String> {
    let prd_path = Path::new(&folder_path)
        .join(".trellico")
        .join("ralph-prd")
        .join(format!("{}.json", prd_name));

    fs::read_to_string(&prd_path)
        .map_err(|e| format!("Failed to read ralph prd file: {}", e))
}

fn get_session_links_path(folder_path: &str) -> PathBuf {
    Path::new(folder_path).join(".trellico").join("session-links.json")
}

#[tauri::command]
fn read_session_links(folder_path: String) -> Result<SessionLinksStore, String> {
    let links_path = get_session_links_path(&folder_path);

    if !links_path.exists() {
        return Ok(SessionLinksStore::default());
    }

    let content = fs::read_to_string(&links_path)
        .map_err(|e| format!("Failed to read session links: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse session links: {}", e))
}

#[tauri::command]
fn save_session_link(folder_path: String, session_id: String, plan_file_name: String) -> Result<(), String> {
    let links_path = get_session_links_path(&folder_path);

    // Load existing store or create new
    let mut store = if links_path.exists() {
        let content = fs::read_to_string(&links_path)
            .map_err(|e| format!("Failed to read session links: {}", e))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        SessionLinksStore { version: 1, links: vec![] }
    };

    let now = Utc::now().to_rfc3339();

    // Check if link already exists (for plans)
    if let Some(existing) = store.links.iter_mut().find(|l| l.plan_file_name == plan_file_name && l.link_type == "plan") {
        existing.session_id = session_id;
        existing.updated_at = now;
    } else {
        store.links.push(SessionPlanLink {
            session_id,
            plan_file_name,
            link_type: "plan".to_string(),
            created_at: now.clone(),
            updated_at: now,
        });
    }

    // Write back
    let content = serde_json::to_string_pretty(&store)
        .map_err(|e| format!("Failed to serialize session links: {}", e))?;

    fs::write(&links_path, content)
        .map_err(|e| format!("Failed to write session links: {}", e))
}

#[tauri::command]
fn get_link_by_plan(folder_path: String, plan_file_name: String) -> Result<Option<SessionPlanLink>, String> {
    let store = read_session_links(folder_path)?;
    Ok(store.links.into_iter().find(|l| l.plan_file_name == plan_file_name && l.link_type == "plan"))
}

#[tauri::command]
fn update_plan_link_filename(folder_path: String, old_name: String, new_name: String) -> Result<(), String> {
    let links_path = get_session_links_path(&folder_path);

    if !links_path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&links_path)
        .map_err(|e| format!("Failed to read session links: {}", e))?;

    let mut store: SessionLinksStore = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse session links: {}", e))?;

    let now = Utc::now().to_rfc3339();

    if let Some(link) = store.links.iter_mut().find(|l| l.plan_file_name == old_name && l.link_type == "plan") {
        link.plan_file_name = new_name;
        link.updated_at = now;

        let content = serde_json::to_string_pretty(&store)
            .map_err(|e| format!("Failed to serialize session links: {}", e))?;

        fs::write(&links_path, content)
            .map_err(|e| format!("Failed to write session links: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
fn save_ralph_link(folder_path: String, session_id: String, prd_file_name: String) -> Result<(), String> {
    let links_path = get_session_links_path(&folder_path);

    // Load existing store or create new
    let mut store = if links_path.exists() {
        let content = fs::read_to_string(&links_path)
            .map_err(|e| format!("Failed to read session links: {}", e))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        SessionLinksStore { version: 1, links: vec![] }
    };

    let now = Utc::now().to_rfc3339();

    // Check if link already exists (for ralph_prd)
    if let Some(existing) = store.links.iter_mut().find(|l| l.plan_file_name == prd_file_name && l.link_type == "ralph_prd") {
        existing.session_id = session_id;
        existing.updated_at = now;
    } else {
        store.links.push(SessionPlanLink {
            session_id,
            plan_file_name: prd_file_name,
            link_type: "ralph_prd".to_string(),
            created_at: now.clone(),
            updated_at: now,
        });
    }

    // Write back
    let content = serde_json::to_string_pretty(&store)
        .map_err(|e| format!("Failed to serialize session links: {}", e))?;

    fs::write(&links_path, content)
        .map_err(|e| format!("Failed to write session links: {}", e))
}

#[tauri::command]
fn get_link_by_ralph_prd(folder_path: String, prd_file_name: String) -> Result<Option<SessionPlanLink>, String> {
    let store = read_session_links(folder_path)?;
    Ok(store.links.into_iter().find(|l| l.plan_file_name == prd_file_name && l.link_type == "ralph_prd"))
}

#[tauri::command]
fn load_session_history(folder_path: String, session_id: String) -> Result<Vec<serde_json::Value>, String> {
    // Convert folder path to Claude project dir name (replace / with -)
    let project_dir_name = folder_path.replace("/", "-");

    // Build path: ~/.claude/projects/<project_dir_name>/<session_id>.jsonl
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let session_file = home
        .join(".claude")
        .join("projects")
        .join(&project_dir_name)
        .join(format!("{}.jsonl", session_id));

    if !session_file.exists() {
        return Ok(vec![]);
    }

    let file = fs::File::open(&session_file)
        .map_err(|e| format!("Failed to open session file: {}", e))?;

    let reader = BufReader::new(file);
    let messages: Vec<serde_json::Value> = reader
        .lines()
        .filter_map(|line| line.ok())
        .filter_map(|line| serde_json::from_str(&line).ok())
        .filter(|msg: &serde_json::Value| {
            matches!(
                msg.get("type").and_then(|t| t.as_str()),
                Some("user") | Some("assistant")
            )
        })
        .collect();

    Ok(messages)
}

// Track known plans for detecting new files
static KNOWN_PLANS: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

// Track known ralph PRDs for detecting new files
static RALPH_PRD_WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);
static KNOWN_RALPH_PRDS: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));

fn get_plan_files(plans_path: &Path) -> HashSet<String> {
    fs::read_dir(plans_path)
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|e| {
                    let p = e.path();
                    if p.is_file() && p.extension().map_or(false, |ext| ext == "md") {
                        p.file_stem().and_then(|s| s.to_str()).map(|s| s.to_string())
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

fn get_ralph_prd_files(ralph_prd_path: &Path) -> HashSet<String> {
    fs::read_dir(ralph_prd_path)
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|e| {
                    let p = e.path();
                    if p.is_file() && p.extension().map_or(false, |ext| ext == "json") {
                        p.file_stem().and_then(|s| s.to_str()).map(|s| s.to_string())
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
fn watch_plans(app: AppHandle, folder_path: String) -> Result<(), String> {
    let plans_path = PathBuf::from(&folder_path).join(".trellico").join("plans");

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
                    EventKind::Create(_)
                    | EventKind::Modify(_)
                    | EventKind::Remove(_) => {
                        // Scan current files and compare with known to detect what changed
                        let current_files = get_plan_files(&plans_path_clone);

                        if let Ok(mut known) = KNOWN_PLANS.lock() {
                            // Find new files (in current but not in known)
                            let added: Vec<_> = current_files.difference(&known).cloned().collect();
                            // Find removed files (in known but not in current)
                            let removed: Vec<_> = known.difference(&current_files).cloned().collect();

                            // If exactly one added and one removed, it's likely a rename
                            if added.len() == 1 && removed.len() == 1 {
                                let _ = app_clone.emit("plan-change", PlanChangeEvent {
                                    change_type: "renamed".to_string(),
                                    file_name: added[0].clone(),
                                    old_file_name: Some(removed[0].clone()),
                                });
                            } else {
                                // Emit individual events
                                for file in &added {
                                    let _ = app_clone.emit("plan-change", PlanChangeEvent {
                                        change_type: "created".to_string(),
                                        file_name: file.clone(),
                                        old_file_name: None,
                                    });
                                }
                                for file in &removed {
                                    let _ = app_clone.emit("plan-change", PlanChangeEvent {
                                        change_type: "removed".to_string(),
                                        file_name: file.clone(),
                                        old_file_name: None,
                                    });
                                }
                            }

                            // For modifications, check if the event path is an existing .md file
                            if let EventKind::Modify(_) = event.kind {
                                if let Some(path) = event.paths.first() {
                                    if path.extension().map_or(false, |ext| ext == "md") {
                                        if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                                            if current_files.contains(name) && known.contains(name) {
                                                let _ = app_clone.emit("plan-change", PlanChangeEvent {
                                                    change_type: "modified".to_string(),
                                                    file_name: name.to_string(),
                                                    old_file_name: None,
                                                });
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
fn watch_ralph_prds(app: AppHandle, folder_path: String) -> Result<(), String> {
    let ralph_prd_path = PathBuf::from(&folder_path).join(".trellico").join("ralph-prd");

    // Create ralph-prd directory if it doesn't exist
    if !ralph_prd_path.exists() {
        fs::create_dir_all(&ralph_prd_path)
            .map_err(|e| format!("Failed to create ralph-prd directory: {}", e))?;
    }

    // Initialize known ralph PRDs
    if let Ok(mut known) = KNOWN_RALPH_PRDS.lock() {
        *known = get_ralph_prd_files(&ralph_prd_path);
    }

    let app_clone = app.clone();
    let ralph_prd_path_clone = ralph_prd_path.clone();
    let watcher = RecommendedWatcher::new(
        move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                match event.kind {
                    EventKind::Create(_)
                    | EventKind::Modify(_)
                    | EventKind::Remove(_) => {
                        let current_files = get_ralph_prd_files(&ralph_prd_path_clone);

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
            w.watch(&ralph_prd_path, RecursiveMode::Recursive)
                .map_err(|e| format!("Failed to watch directory: {}", e))?;
        }
    }

    Ok(())
}

#[tauri::command]
async fn run_claude(
    app: AppHandle,
    message: String,
    folder_path: String,
    session_id: Option<String>,
) -> Result<(), String> {
    if PROCESS_RUNNING.swap(true, Ordering::SeqCst) {
        return Err("A process is already running".to_string());
    }

    // Reset stop flag
    STOP_REQUESTED.store(false, Ordering::SeqCst);

    let app_clone = app.clone();

    std::thread::spawn(move || {
        let result = run_claude_process(&app_clone, &message, &folder_path, session_id.as_deref());
        PROCESS_RUNNING.store(false, Ordering::SeqCst);

        // Clear the master PTY
        if let Ok(mut master) = MASTER_PTY.lock() {
            *master = None;
        }

        match result {
            Ok(code) => {
                let _ = app_clone.emit("claude-exit", code);
            }
            Err(e) => {
                let _ = app_clone.emit("claude-error", e);
            }
        }
    });

    Ok(())
}

#[tauri::command]
fn stop_claude() -> Result<(), String> {
    STOP_REQUESTED.store(true, Ordering::SeqCst);

    // Drop the master PTY to close the connection and signal EOF to the child
    if let Ok(mut master) = MASTER_PTY.lock() {
        *master = None;
    }

    // Reset the running flag so new processes can start
    PROCESS_RUNNING.store(false, Ordering::SeqCst);

    Ok(())
}

fn run_claude_process(
    app: &AppHandle,
    message: &str,
    folder_path: &str,
    session_id: Option<&str>,
) -> Result<i32, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open pty: {}", e))?;

    let mut cmd = CommandBuilder::new("claude");

    // Build args based on whether we're resuming a session
    let mut args: Vec<&str> = vec!["-p", "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions"];

    if let Some(sid) = session_id {
        args.push("--resume");
        args.push(sid);
    }

    args.push(message);
    cmd.args(&args);
    cmd.cwd(folder_path);

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn claude: {}", e))?;

    // Drop slave so EOF is sent when master closes
    drop(pair.slave);

    // Get reader from master
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;

    // Store master PTY for potential cancellation
    if let Ok(mut master) = MASTER_PTY.lock() {
        *master = Some(pair.master);
    }

    // Stream output in real-time
    let mut buf = [0u8; 256];
    loop {
        // Check if stop was requested
        if STOP_REQUESTED.load(Ordering::SeqCst) {
            break;
        }

        match reader.read(&mut buf) {
            Ok(0) => break, // EOF
            Ok(n) => {
                if let Ok(text) = std::str::from_utf8(&buf[..n]) {
                    let _ = app.emit("claude-output", text);
                }
            }
            Err(e) => {
                // EIO is expected when process exits
                if e.kind() != std::io::ErrorKind::Other {
                    let _ = app.emit("claude-error", format!("Read error: {}", e));
                }
                break;
            }
        }
    }

    let status = child
        .wait()
        .map_err(|e| format!("Failed to wait for process: {}", e))?;

    Ok(status
        .exit_code()
        .try_into()
        .unwrap_or(-1))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_decorum::init())
        .invoke_handler(tauri::generate_handler![
            run_claude,
            stop_claude,
            setup_folder,
            list_plans,
            read_plan,
            watch_plans,
            read_session_links,
            save_session_link,
            get_link_by_plan,
            update_plan_link_filename,
            load_session_history,
            list_ralph_prds,
            read_ralph_prd,
            watch_ralph_prds,
            save_ralph_link,
            get_link_by_ralph_prd
        ])
        .setup(|app| {
            let main_window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "macos")]
            {
                // Set traffic light position
                main_window.set_traffic_lights_inset(16.0, 20.0).unwrap();
            }

            #[cfg(target_os = "macos")]
            #[allow(deprecated)]
            {
                use cocoa::appkit::{NSColor, NSWindow};
                use cocoa::base::{id, nil};

                let ns_window = main_window.ns_window().unwrap() as id;
                unsafe {
                    // Match the app background color: oklch(0.985 0.002 90) ≈ rgb(250, 249, 247)
                    let bg_color = NSColor::colorWithRed_green_blue_alpha_(
                        nil,
                        250.0 / 255.0,
                        249.0 / 255.0,
                        247.0 / 255.0,
                        1.0,
                    );
                    ns_window.setBackgroundColor_(bg_color);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
