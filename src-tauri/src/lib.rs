mod commands;
mod models;
mod platform;
mod state;
mod utils;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_decorum::init())
        .invoke_handler(tauri::generate_handler![
            commands::claude::run_claude,
            commands::claude::stop_claude,
            commands::plans::setup_folder,
            commands::plans::list_plans,
            commands::plans::read_plan,
            commands::watchers::watch_plans,
            commands::session::read_session_links,
            commands::session::save_session_link,
            commands::session::get_link_by_plan,
            commands::session::update_plan_link_filename,
            commands::session::load_session_history,
            commands::ralph::list_ralph_prds,
            commands::ralph::read_ralph_prd,
            commands::watchers::watch_ralph_prds,
            commands::session::save_ralph_link,
            commands::session::get_link_by_ralph_prd,
            commands::ralph::get_ralph_iterations,
            commands::ralph::get_all_ralph_iterations,
            commands::ralph::save_ralph_iteration,
            commands::ralph::update_ralph_iteration_status,
            commands::ralph::update_ralph_iteration_session_id,
            commands::watchers::watch_ralph_iterations
        ])
        .setup(|app| {
            let main_window = app.get_webview_window("main").unwrap();
            platform::setup_macos_window(&main_window);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
