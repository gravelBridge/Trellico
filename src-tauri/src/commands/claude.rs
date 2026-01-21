use crate::state::CLAUDE_PROCESSES;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Clone, Serialize)]
struct ClaudeOutput {
    process_id: String,
    data: String,
}

#[derive(Clone, Serialize)]
struct ClaudeExit {
    process_id: String,
    code: i32,
}

#[derive(Clone, Serialize)]
struct ClaudeError {
    process_id: String,
    error: String,
}

#[tauri::command]
pub async fn run_claude(
    app: AppHandle,
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
        let mut processes = CLAUDE_PROCESSES.lock().map_err(|e| e.to_string())?;
        processes.insert(process_id.clone(), stop_flag);
    }

    let app_clone = app.clone();

    std::thread::spawn(move || {
        let result = run_claude_process(
            &app_clone,
            &message,
            &folder_path,
            session_id.as_deref(),
            &process_id_clone,
            stop_flag_clone,
        );

        // Remove process from tracking
        if let Ok(mut processes) = CLAUDE_PROCESSES.lock() {
            processes.remove(&process_id_clone);
        }

        match result {
            Ok(code) => {
                let _ = app_clone.emit(
                    "claude-exit",
                    ClaudeExit {
                        process_id: process_id_clone,
                        code,
                    },
                );
            }
            Err(e) => {
                let _ = app_clone.emit(
                    "claude-error",
                    ClaudeError {
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
pub fn stop_claude(process_id: Option<String>) -> Result<(), String> {
    let processes = CLAUDE_PROCESSES.lock().map_err(|e| e.to_string())?;

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

fn run_claude_process(
    app: &AppHandle,
    message: &str,
    folder_path: &str,
    session_id: Option<&str>,
    process_id: &str,
    stop_flag: Arc<AtomicBool>,
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
    let mut args: Vec<&str> = vec![
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
    ];

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
                        "claude-output",
                        ClaudeOutput {
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
                        "claude-error",
                        ClaudeError {
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
