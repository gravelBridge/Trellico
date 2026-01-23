use crate::db::{iterations, links, messages, sessions, settings};
use crate::models::RalphIteration;
use crate::providers::Provider;
use crate::state::DB_CONNECTION;
use std::collections::HashMap;

// Helper to get the database connection
fn get_db() -> Result<&'static crate::db::DbConnection, String> {
    DB_CONNECTION
        .get()
        .ok_or_else(|| "Database not initialized".to_string())
}

// ============================================================================
// Message Commands
// ============================================================================

#[tauri::command]
pub fn db_save_message(
    session_id: String,
    message_json: String,
    sequence: i32,
    message_type: String,
) -> Result<(), String> {
    let conn = get_db()?;
    messages::save_message(conn, &session_id, &message_json, sequence, &message_type)
}

#[tauri::command]
pub fn db_get_session_messages(session_id: String) -> Result<Vec<serde_json::Value>, String> {
    let conn = get_db()?;
    messages::get_session_messages(conn, &session_id)
}

#[tauri::command]
pub fn db_get_next_sequence(session_id: String) -> Result<i32, String> {
    let conn = get_db()?;
    messages::get_next_sequence(conn, &session_id)
}

// ============================================================================
// Session Commands
// ============================================================================

#[tauri::command]
pub fn db_create_session(
    session_id: String,
    folder_path: String,
    provider: String,
    session_type: String,
) -> Result<(), String> {
    let conn = get_db()?;
    sessions::create_session(conn, &session_id, &folder_path, &provider, &session_type)
}

#[tauri::command]
pub fn db_get_folder_sessions(
    folder_path: String,
) -> Result<Vec<sessions::FolderSession>, String> {
    let conn = get_db()?;
    sessions::get_folder_sessions(conn, &folder_path)
}

// ============================================================================
// Session Link Commands
// ============================================================================

#[tauri::command]
pub fn db_save_session_link(
    folder_path: String,
    session_id: String,
    file_name: String,
    link_type: String,
) -> Result<(), String> {
    let conn = get_db()?;
    links::save_session_link(conn, &folder_path, &session_id, &file_name, &link_type)
}

#[tauri::command]
pub fn db_get_link_by_plan(
    folder_path: String,
    plan_name: String,
) -> Result<Option<links::SessionLink>, String> {
    let conn = get_db()?;
    links::get_link_by_plan(conn, &folder_path, &plan_name)
}

#[tauri::command]
pub fn db_get_link_by_ralph_prd(
    folder_path: String,
    prd_name: String,
) -> Result<Option<links::SessionLink>, String> {
    let conn = get_db()?;
    links::get_link_by_ralph_prd(conn, &folder_path, &prd_name)
}

#[tauri::command]
pub fn db_update_plan_link_filename(
    folder_path: String,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    let conn = get_db()?;
    links::update_plan_link_filename(conn, &folder_path, &old_name, &new_name)
}

// ============================================================================
// Ralph Iteration Commands
// ============================================================================

#[tauri::command]
pub fn db_save_ralph_iteration(
    folder_path: String,
    prd_name: String,
    iteration_number: i32,
    status: String,
) -> Result<(), String> {
    let conn = get_db()?;
    iterations::save_ralph_iteration(conn, &folder_path, &prd_name, iteration_number, &status)
}

#[tauri::command]
pub fn db_update_ralph_iteration_session_id(
    folder_path: String,
    prd_name: String,
    iteration_number: i32,
    session_id: String,
) -> Result<(), String> {
    let conn = get_db()?;
    iterations::update_ralph_iteration_session_id(
        conn,
        &folder_path,
        &prd_name,
        iteration_number,
        &session_id,
    )
}

#[tauri::command]
pub fn db_update_ralph_iteration_status(
    folder_path: String,
    prd_name: String,
    iteration_number: i32,
    status: String,
) -> Result<(), String> {
    let conn = get_db()?;
    iterations::update_ralph_iteration_status(conn, &folder_path, &prd_name, iteration_number, &status)
}

#[tauri::command]
pub fn db_get_ralph_iterations(
    folder_path: String,
    prd_name: String,
) -> Result<Vec<RalphIteration>, String> {
    let conn = get_db()?;
    let db_iterations = iterations::get_ralph_iterations(conn, &folder_path, &prd_name)?;

    // Convert to the RalphIteration type expected by frontend
    Ok(db_iterations
        .into_iter()
        .map(|i| RalphIteration {
            iteration_number: i.iteration_number as u32,
            session_id: i.session_id.unwrap_or_default(),
            status: i.status,
            created_at: i.created_at,
            provider: i.provider,
        })
        .collect())
}

#[tauri::command]
pub fn db_get_all_ralph_iterations(
    folder_path: String,
) -> Result<HashMap<String, Vec<RalphIteration>>, String> {
    let conn = get_db()?;
    let db_iterations = iterations::get_all_ralph_iterations(conn, &folder_path)?;

    // Convert to the RalphIteration type expected by frontend
    Ok(db_iterations
        .into_iter()
        .map(|(prd_name, iters)| {
            (
                prd_name,
                iters
                    .into_iter()
                    .map(|i| RalphIteration {
                        iteration_number: i.iteration_number as u32,
                        session_id: i.session_id.unwrap_or_default(),
                        status: i.status,
                        created_at: i.created_at,
                        provider: i.provider,
                    })
                    .collect(),
            )
        })
        .collect())
}

// ============================================================================
// Session Management Commands
// ============================================================================

#[tauri::command]
pub fn db_update_session_display_name(
    session_id: String,
    display_name: String,
) -> Result<(), String> {
    let conn = get_db()?;
    sessions::update_session_display_name(conn, &session_id, &display_name)
}

#[tauri::command]
pub fn db_delete_session(session_id: String) -> Result<(), String> {
    let conn = get_db()?;
    sessions::delete_session(conn, &session_id)
}

#[tauri::command]
pub fn db_delete_ralph_prd_data(folder_path: String, prd_name: String) -> Result<(), String> {
    let conn = get_db()?;
    iterations::delete_prd_iterations(conn, &folder_path, &prd_name)
}

// ============================================================================
// Folder Settings Commands
// ============================================================================

#[tauri::command]
pub fn db_get_folder_provider(folder_path: String) -> Result<Provider, String> {
    let conn = get_db()?;
    settings::get_folder_provider(conn, &folder_path)
}

#[tauri::command]
pub fn db_set_folder_provider(folder_path: String, provider: Provider) -> Result<(), String> {
    let conn = get_db()?;
    settings::set_folder_provider(conn, &folder_path, provider)
}
