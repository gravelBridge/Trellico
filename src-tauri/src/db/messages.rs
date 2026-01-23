use super::DbConnection;
use chrono::Utc;
use rusqlite::params;

/// Save a message to the database
pub fn save_message(
    conn: &DbConnection,
    session_id: &str,
    message_json: &str,
    sequence: i32,
    message_type: &str,
) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| format!("Lock error: {}", e))?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT OR REPLACE INTO messages (session_id, sequence, message_type, message_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![session_id, sequence, message_type, message_json, now],
    )
    .map_err(|e| format!("Failed to save message: {}", e))?;

    Ok(())
}

/// Get all messages for a session
pub fn get_session_messages(
    conn: &DbConnection,
    session_id: &str,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = conn.lock().map_err(|e| format!("Lock error: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT message_json FROM messages
             WHERE session_id = ?1
             ORDER BY sequence ASC",
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let messages = stmt
        .query_map(params![session_id], |row| {
            let json_str: String = row.get(0)?;
            Ok(json_str)
        })
        .map_err(|e| format!("Failed to query messages: {}", e))?
        .filter_map(|r| r.ok())
        .filter_map(|json_str| serde_json::from_str(&json_str).ok())
        .collect();

    Ok(messages)
}

/// Get the next sequence number for a session
pub fn get_next_sequence(conn: &DbConnection, session_id: &str) -> Result<i32, String> {
    let conn = conn.lock().map_err(|e| format!("Lock error: {}", e))?;

    let max_seq: Option<i32> = conn
        .query_row(
            "SELECT MAX(sequence) FROM messages WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to get max sequence: {}", e))?;

    Ok(max_seq.unwrap_or(0) + 1)
}

