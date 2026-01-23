pub mod iterations;
pub mod links;
pub mod messages;
pub mod schema;
pub mod sessions;
pub mod settings;

use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub type DbConnection = Arc<Mutex<Connection>>;

/// Get the path to the trellico database file (~/.trellico/trellico.db)
pub fn get_db_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let trellico_dir = home.join(".trellico");

    // Create directory if it doesn't exist
    if !trellico_dir.exists() {
        std::fs::create_dir_all(&trellico_dir)
            .map_err(|e| format!("Failed to create .trellico directory: {}", e))?;
    }

    Ok(trellico_dir.join("trellico.db"))
}

/// Initialize the database connection and run migrations
pub fn init_db() -> Result<DbConnection, String> {
    let db_path = get_db_path()?;

    let conn =
        Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

    // Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

    // Run migrations
    schema::run_migrations(&conn)?;

    let db_conn = Arc::new(Mutex::new(conn));

    // Mark any running iterations as stopped (app may have quit unexpectedly)
    iterations::mark_running_iterations_stopped(&db_conn)?;

    Ok(db_conn)
}
