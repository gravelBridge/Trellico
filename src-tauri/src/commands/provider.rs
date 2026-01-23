use crate::providers::Provider;
use crate::state::AI_PROCESSES;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Clone, Serialize)]
struct AIOutput {
    process_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct AIExit {
    process_id: String,
    code: i32,
}

#[derive(Clone, Serialize)]
struct AIError {
    process_id: String,
    error: String,
}

#[tauri::command]
pub async fn run_provider(
    app: AppHandle,
    provider: Provider,
    message: String,
    folder_path: String,
    session_id: Option<String>,
) -> Result<String, String> {
    // Generate unique process ID
    let process_id = Uuid::new_v4().to_string();
    let process_id_clone = process_id.clone();

    // Create stop flag for this process
    let stop_flag = Arc::new(AtomicBool::new(false));
    let stop_flag_clone = stop_flag.clone();

    // Store the stop flag
    {
        let mut processes = AI_PROCESSES.lock().map_err(|e| e.to_string())?;
        processes.insert(process_id.clone(), stop_flag);
    }

    let app_clone = app.clone();

    std::thread::spawn(move || {
        let result = run_provider_process(
            &app_clone,
            provider,
            &message,
            &folder_path,
            session_id.as_deref(),
            &process_id_clone,
            stop_flag_clone,
        );

        // Remove process from tracking
        if let Ok(mut processes) = AI_PROCESSES.lock() {
            processes.remove(&process_id_clone);
        }

        match result {
            Ok(code) => {
                let _ = app_clone.emit(
                    "ai-exit",
                    AIExit {
                        process_id: process_id_clone,
                        code,
                    },
                );
            }
            Err(e) => {
                let _ = app_clone.emit(
                    "ai-error",
                    AIError {
                        process_id: process_id_clone,
                        error: e,
                    },
                );
            }
        }
    });

    Ok(process_id)
}

#[tauri::command]
pub fn stop_provider(process_id: Option<String>) -> Result<(), String> {
    let processes = AI_PROCESSES.lock().map_err(|e| e.to_string())?;

    if let Some(pid) = process_id {
        // Stop specific process
        if let Some(stop_flag) = processes.get(&pid) {
            stop_flag.store(true, Ordering::SeqCst);
        }
    } else {
        // Stop all processes
        for stop_flag in processes.values() {
            stop_flag.store(true, Ordering::SeqCst);
        }
    }

    Ok(())
}

#[derive(Clone, Serialize)]
pub struct ProviderStatus {
    pub available: bool,
    pub error: Option<String>,
    pub error_type: Option<String>, // "not_installed", "not_logged_in", "unknown"
    pub auth_instructions: Option<String>, // Instructions for authenticating
}

#[tauri::command]
pub fn check_provider_available(provider: Provider) -> ProviderStatus {
    // Find binary (GUI apps don't inherit shell PATH)
    let binary_path = match provider.find_binary() {
        Some(path) => path,
        None => {
            return ProviderStatus {
                available: false,
                error: Some(provider.not_installed_message()),
                error_type: Some("not_installed".to_string()),
                auth_instructions: None,
            };
        }
    };

    // Verify it runs
    match std::process::Command::new(&binary_path)
        .arg("--version")
        .output()
    {
        Ok(output) if output.status.success() => {
            // Binary works, now check authentication
            match provider.check_authenticated() {
                Ok(()) => ProviderStatus {
                    available: true,
                    error: None,
                    error_type: None,
                    auth_instructions: None,
                },
                Err(auth_error) => ProviderStatus {
                    available: false,
                    error: Some(auth_error),
                    error_type: Some("not_logged_in".to_string()),
                    auth_instructions: Some(provider.auth_instructions().to_string()),
                },
            }
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            let combined = format!("{} {}", stderr, stdout);

            // Check if it's an auth error
            if provider.is_auth_error(&combined) {
                ProviderStatus {
                    available: false,
                    error: Some(provider.not_logged_in_message().to_string()),
                    error_type: Some("not_logged_in".to_string()),
                    auth_instructions: Some(provider.auth_instructions().to_string()),
                }
            } else {
                ProviderStatus {
                    available: false,
                    error: Some(format!("{} error: {}", provider.display_name(), stderr)),
                    error_type: Some("unknown".to_string()),
                    auth_instructions: None,
                }
            }
        }
        Err(e) => ProviderStatus {
            available: false,
            error: Some(format!("Failed to run {}: {}", provider.display_name(), e)),
            error_type: Some("not_installed".to_string()),
            auth_instructions: None,
        },
    }
}

fn run_provider_process(
    app: &AppHandle,
    provider: Provider,
    message: &str,
    folder_path: &str,
    session_id: Option<&str>,
    process_id: &str,
    stop_flag: Arc<AtomicBool>,
) -> Result<i32, String> {
    // Find binary (GUI apps don't inherit shell PATH)
    let binary_path = provider
        .find_binary()
        .ok_or_else(|| format!("{} is not installed", provider.display_name()))?;

    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open pty: {}", e))?;

    let mut cmd = CommandBuilder::new(binary_path);

    // Build args using provider-specific logic
    let args = provider.build_args(message, session_id);
    cmd.args(&args);
    cmd.cwd(folder_path);

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn {}: {}", provider.display_name(), e))?;

    // Drop slave so EOF is sent when master closes
    drop(pair.slave);

    // Get reader from master
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;

    // Keep master alive until we're done (dropping it signals EOF to child)
    let _master = pair.master;

    // Stream output in real-time
    let mut buf = [0u8; 256];
    loop {
        // Check if stop was requested
        if stop_flag.load(Ordering::SeqCst) {
            // Kill the child process
            let _ = child.kill();
            break;
        }

        match reader.read(&mut buf) {
            Ok(0) => break, // EOF
            Ok(n) => {
                if let Ok(text) = std::str::from_utf8(&buf[..n]) {
                    let _ = app.emit(
                        "ai-output",
                        AIOutput {
                            process_id: process_id.to_string(),
                            data: text.to_string(),
                        },
                    );
                }
            }
            Err(e) => {
                // EIO is expected when process exits
                if e.kind() != std::io::ErrorKind::Other {
                    let _ = app.emit(
                        "ai-error",
                        AIError {
                            process_id: process_id.to_string(),
                            error: format!("Read error: {}", e),
                        },
                    );
                }
                break;
            }
        }
    }

    let status = child
        .wait()
        .map_err(|e| format!("Failed to wait for process: {}", e))?;

    Ok(status.exit_code().try_into().unwrap_or(-1))
}
