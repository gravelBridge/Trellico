use super::DbConnection;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionLink {
    pub id: i64,
    pub folder_path: String,
    pub session_id: String,
    pub file_name: String,
    pub link_type: String,
    pub created_at: String,
    pub updated_at: String,
    pub provider: String,
}

/// Save or update a session link
pub fn save_session_link(
    conn: &DbConnection,
    folder_path: &str,
    session_id: &str,
    file_name: &str,
    link_type: &str,
) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| format!("Lock error: {}", e))?;
    let now = Utc::now().to_rfc3339();

    // Use INSERT OR REPLACE with the unique constraint
    conn.execute(
        "INSERT INTO session_links (folder_path, session_id, file_name, link_type, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)
         ON CONFLICT(folder_path, file_name, link_type) DO UPDATE SET
            session_id = excluded.session_id,
            updated_at = excluded.updated_at",
        params![folder_path, session_id, file_name, link_type, now],
    )
    .map_err(|e| format!("Failed to save session link: {}", e))?;

    Ok(())
}

/// Get link by plan name
pub fn get_link_by_plan(
    conn: &DbConnection,
    folder_path: &str,
    plan_name: &str,
) -> Result<Option<SessionLink>, String> {
    get_link_by_file(conn, folder_path, plan_name, "plan")
}

/// Get link by Ralph PRD name
pub fn get_link_by_ralph_prd(
    conn: &DbConnection,
    folder_path: &str,
    prd_name: &str,
) -> Result<Option<SessionLink>, String> {
    get_link_by_file(conn, folder_path, prd_name, "ralph_prd")
}

/// Get link by file name and type
fn get_link_by_file(
    conn: &DbConnection,
    folder_path: &str,
    file_name: &str,
    link_type: &str,
) -> Result<Option<SessionLink>, String> {
    let conn = conn.lock().map_err(|e| format!("Lock error: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT sl.id, sl.folder_path, sl.session_id, sl.file_name, sl.link_type, sl.created_at, sl.updated_at, s.provider
             FROM session_links sl
             JOIN sessions s ON sl.session_id = s.id
             WHERE sl.folder_path = ?1 AND sl.file_name = ?2 AND sl.link_type = ?3",
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let result = stmt
        .query_row(params![folder_path, file_name, link_type], |row| {
            Ok(SessionLink {
                id: row.get(0)?,
                folder_path: row.get(1)?,
                session_id: row.get(2)?,
                file_name: row.get(3)?,
                link_type: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                provider: row.get(7)?,
            })
        })
        .optional()
        .map_err(|e| format!("Failed to get link: {}", e))?;

    Ok(result)
}

/// Update plan link filename (for renames)
pub fn update_plan_link_filename(
    conn: &DbConnection,
    folder_path: &str,
    old_name: &str,
    new_name: &str,
) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| format!("Lock error: {}", e))?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE session_links SET file_name = ?1, updated_at = ?2
         WHERE folder_path = ?3 AND file_name = ?4 AND link_type = 'plan'",
        params![new_name, now, folder_path, old_name],
    )
    .map_err(|e| format!("Failed to update link filename: {}", e))?;

    Ok(())
}

