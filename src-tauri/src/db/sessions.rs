use super::DbConnection;
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderSession {
    pub id: String,
    pub provider: String,
    pub created_at: String,
    pub linked_plan: Option<String>,
}

/// Create a new session
pub fn create_session(
    conn: &DbConnection,
    session_id: &str,
    folder_path: &str,
    provider: &str,
) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| format!("Lock error: {}", e))?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR IGNORE INTO sessions (id, folder_path, provider, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)",
        params![session_id, folder_path, provider, now],
    )
    .map_err(|e| format!("Failed to create session: {}", e))?;

    Ok(())
}

/// Get all sessions for a folder with their linked plan (if any)
pub fn get_folder_sessions(
    conn: &DbConnection,
    folder_path: &str,
) -> Result<Vec<FolderSession>, String> {
    let conn = conn.lock().map_err(|e| format!("Lock error: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.provider, s.created_at, sl.file_name
             FROM sessions s
             LEFT JOIN session_links sl ON s.id = sl.session_id AND sl.link_type = 'plan'
             WHERE s.folder_path = ?1
             ORDER BY s.created_at DESC",
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let sessions = stmt
        .query_map(params![folder_path], |row| {
            Ok(FolderSession {
                id: row.get(0)?,
                provider: row.get(1)?,
                created_at: row.get(2)?,
                linked_plan: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to query sessions: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect sessions: {}", e))?;

    Ok(sessions)
}
