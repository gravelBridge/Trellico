use chrono::Utc;
use rusqlite::Connection;

const CURRENT_VERSION: i32 = 1;

/// Run database migrations
pub fn run_migrations(conn: &Connection) -> Result<(), String> {
    // Create schema_version table if it doesn't exist
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create schema_version table: {}", e))?;

    // Get current version
    let current_version: i32 = conn
        .query_row(
            "SELECT MAX(version) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Run migrations for versions not yet applied
    if current_version < 1 {
        migrate_v1(conn)?;
    }

    Ok(())
}

/// Version 1: Initial schema
fn migrate_v1(conn: &Connection) -> Result<(), String> {
    // Sessions table - created when we receive session ID from Claude
    conn.execute(
        "CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            folder_path TEXT NOT NULL,
            provider TEXT NOT NULL DEFAULT 'claude_code',
            display_name TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create sessions table: {}", e))?;

    // Index for finding sessions by folder
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_sessions_folder_path ON sessions(folder_path)",
        [],
    )
    .map_err(|e| format!("Failed to create sessions folder index: {}", e))?;

    // Messages (stored as JSON blobs for flexibility)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            sequence INTEGER NOT NULL,
            message_type TEXT NOT NULL,
            message_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(session_id, sequence)
        )",
        [],
    )
    .map_err(|e| format!("Failed to create messages table: {}", e))?;

    // Create index on session_id for faster message lookups
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)",
        [],
    )
    .map_err(|e| format!("Failed to create messages index: {}", e))?;

    // Session-plan links
    conn.execute(
        "CREATE TABLE IF NOT EXISTS session_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_path TEXT NOT NULL,
            session_id TEXT NOT NULL,
            file_name TEXT NOT NULL,
            link_type TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(folder_path, file_name, link_type)
        )",
        [],
    )
    .map_err(|e| format!("Failed to create session_links table: {}", e))?;

    // Ralph iterations
    conn.execute(
        "CREATE TABLE IF NOT EXISTS ralph_iterations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_path TEXT NOT NULL,
            prd_name TEXT NOT NULL,
            iteration_number INTEGER NOT NULL,
            session_id TEXT,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(folder_path, prd_name, iteration_number)
        )",
        [],
    )
    .map_err(|e| format!("Failed to create ralph_iterations table: {}", e))?;

    // Folder settings
    conn.execute(
        "CREATE TABLE IF NOT EXISTS folder_settings (
            folder_path TEXT PRIMARY KEY,
            provider TEXT NOT NULL DEFAULT 'claude_code',
            updated_at TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| format!("Failed to create folder_settings table: {}", e))?;

    // Record migration
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)",
        [&CURRENT_VERSION.to_string(), &now],
    )
    .map_err(|e| format!("Failed to record migration: {}", e))?;

    Ok(())
}
