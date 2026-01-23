mod commands;
mod db;
mod models;
mod platform;
mod providers;
mod state;
mod utils;

use tauri::menu::{Menu, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_decorum::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            // Provider commands
            commands::provider::run_provider,
            commands::provider::stop_provider,
            commands::provider::check_provider_available,
            // Plan file commands (filesystem)
            commands::plans::setup_folder,
            commands::plans::list_plans,
            commands::plans::read_plan,
            commands::watchers::watch_plans,
            // Ralph PRD file commands (filesystem)
            commands::ralph::list_ralph_prds,
            commands::ralph::read_ralph_prd,
            commands::watchers::watch_ralph_prds,
            commands::watchers::stop_watching_folder,
            // Database commands
            commands::db::db_save_message,
            commands::db::db_get_session_messages,
            commands::db::db_get_next_sequence,
            commands::db::db_create_session,
            commands::db::db_get_folder_sessions,
            commands::db::db_save_session_link,
            commands::db::db_get_link_by_plan,
            commands::db::db_get_link_by_ralph_prd,
            commands::db::db_update_plan_link_filename,
            commands::db::db_save_ralph_iteration,
            commands::db::db_update_ralph_iteration_session_id,
            commands::db::db_update_ralph_iteration_status,
            commands::db::db_get_ralph_iterations,
            commands::db::db_get_all_ralph_iterations,
            commands::db::db_get_folder_provider,
            commands::db::db_set_folder_provider
        ])
        .setup(|app| {
            // Initialize database
            match db::init_db() {
                Ok(conn) => {
                    let _ = state::DB_CONNECTION.set(conn);
                }
                Err(e) => {
                    eprintln!("Failed to initialize database: {}", e);
                }
            }

            let main_window = app.get_webview_window("main").unwrap();
            platform::setup_macos_window(&main_window);

            // Build custom menu with "Check for Updates"
            let check_updates = MenuItemBuilder::with_id("check-for-updates", "Check for Updates...")
                .build(app)?;

            let app_submenu = SubmenuBuilder::new(app, "Trellico")
                .about(None)
                .separator()
                .item(&check_updates)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            let edit_submenu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let view_submenu = SubmenuBuilder::new(app, "View")
                .fullscreen()
                .build()?;

            let window_submenu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .separator()
                .close_window()
                .build()?;

            let menu = Menu::with_items(
                app,
                &[&app_submenu, &edit_submenu, &view_submenu, &window_submenu],
            )?;

            app.set_menu(menu)?;

            // Handle menu events
            app.on_menu_event(move |app_handle, event| {
                if event.id().as_ref() == "check-for-updates" {
                    let _ = app_handle.emit("check-for-updates", ());
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
