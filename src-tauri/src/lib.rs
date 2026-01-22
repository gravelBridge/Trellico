mod commands;
mod models;
mod platform;
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
            commands::claude::run_claude,
            commands::claude::stop_claude,
            commands::claude::check_claude_available,
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
            commands::watchers::watch_ralph_iterations,
            commands::watchers::stop_watching_folder
        ])
        .setup(|app| {
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
