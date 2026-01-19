use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

static PROCESS_RUNNING: AtomicBool = AtomicBool::new(false);

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
async fn run_claude(app: AppHandle, message: String, folder_path: String) -> Result<(), String> {
    if PROCESS_RUNNING.swap(true, Ordering::SeqCst) {
        return Err("A process is already running".to_string());
    }

    let app_clone = app.clone();

    std::thread::spawn(move || {
        let result = run_claude_process(&app_clone, &message, &folder_path);
        PROCESS_RUNNING.store(false, Ordering::SeqCst);

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

fn run_claude_process(app: &AppHandle, message: &str, folder_path: &str) -> Result<i32, String> {
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
    cmd.args(["-p", "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions", message]);
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

    // Stream output in real-time
    let mut buf = [0u8; 256];
    loop {
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
        .invoke_handler(tauri::generate_handler![run_claude, setup_folder])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            #[allow(deprecated)]
            {
                use cocoa::appkit::{NSColor, NSWindow};
                use cocoa::base::{id, nil};
                use tauri::Manager;

                let window = app.get_webview_window("main").unwrap();
                let ns_window = window.ns_window().unwrap() as id;
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
