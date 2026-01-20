use crate::state::{MASTER_PTY, PROCESS_RUNNING, STOP_REQUESTED};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::Read;
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn run_claude(
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
pub fn stop_claude() -> Result<(), String> {
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

    Ok(status.exit_code().try_into().unwrap_or(-1))
}
