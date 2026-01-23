use super::DbConnection;
use chrono::Utc;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbRalphIteration {
    pub id: i64,
    pub folder_path: String,
    pub prd_name: String,
    pub iteration_number: i32,
    pub session_id: Option<String>,
    pub status: String,
    pub created_at: String,
    pub provider: Option<String>,
}

/// Save a new Ralph iteration
pub fn save_ralph_iteration(
    conn: &DbConnection,
    folder_path: &str,
    prd_name: &str,
    iteration_number: i32,
    status: &str,
) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| format!("Lock error: {}", e))?;
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO ralph_iterations (folder_path, prd_name, iteration_number, status, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(folder_path, prd_name, iteration_number) DO UPDATE SET
            status = excluded.status",
        params![folder_path, prd_name, iteration_number, status, now],
    )
    .map_err(|e| format!("Failed to save ralph iteration: {}", e))?;

    Ok(())
}

/// Update Ralph iteration session ID
pub fn update_ralph_iteration_session_id(
    conn: &DbConnection,
    folder_path: &str,
    prd_name: &str,
    iteration_number: i32,
    session_id: &str,
) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| format!("Lock error: {}", e))?;

    conn.execute(
        "UPDATE ralph_iterations SET session_id = ?1
         WHERE folder_path = ?2 AND prd_name = ?3 AND iteration_number = ?4",
        params![session_id, folder_path, prd_name, iteration_number],
    )
    .map_err(|e| format!("Failed to update ralph iteration session_id: {}", e))?;

    Ok(())
}

/// Update Ralph iteration status
pub fn update_ralph_iteration_status(
    conn: &DbConnection,
    folder_path: &str,
    prd_name: &str,
    iteration_number: i32,
    status: &str,
) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| format!("Lock error: {}", e))?;

    conn.execute(
        "UPDATE ralph_iterations SET status = ?1
         WHERE folder_path = ?2 AND prd_name = ?3 AND iteration_number = ?4",
        params![status, folder_path, prd_name, iteration_number],
    )
    .map_err(|e| format!("Failed to update ralph iteration status: {}", e))?;

    Ok(())
}

/// Get Ralph iterations for a PRD
pub fn get_ralph_iterations(
    conn: &DbConnection,
    folder_path: &str,
    prd_name: &str,
) -> Result<Vec<DbRalphIteration>, String> {
    let conn = conn.lock().map_err(|e| format!("Lock error: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT ri.id, ri.folder_path, ri.prd_name, ri.iteration_number, ri.session_id, ri.status, ri.created_at, s.provider
             FROM ralph_iterations ri
             LEFT JOIN sessions s ON ri.session_id = s.id
             WHERE ri.folder_path = ?1 AND ri.prd_name = ?2
             ORDER BY ri.iteration_number ASC",
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let iterations = stmt
        .query_map(params![folder_path, prd_name], |row| {
            Ok(DbRalphIteration {
                id: row.get(0)?,
                folder_path: row.get(1)?,
                prd_name: row.get(2)?,
                iteration_number: row.get(3)?,
                session_id: row.get(4)?,
                status: row.get(5)?,
                created_at: row.get(6)?,
                provider: row.get(7)?,
            })
        })
        .map_err(|e| format!("Failed to query iterations: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect iterations: {}", e))?;

    Ok(iterations)
}

/// Get all Ralph iterations for a folder (grouped by PRD name)
pub fn get_all_ralph_iterations(
    conn: &DbConnection,
    folder_path: &str,
) -> Result<HashMap<String, Vec<DbRalphIteration>>, String> {
    let conn = conn.lock().map_err(|e| format!("Lock error: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT ri.id, ri.folder_path, ri.prd_name, ri.iteration_number, ri.session_id, ri.status, ri.created_at, s.provider
             FROM ralph_iterations ri
             LEFT JOIN sessions s ON ri.session_id = s.id
             WHERE ri.folder_path = ?1
             ORDER BY ri.prd_name, ri.iteration_number ASC",
        )
        .map_err(|e| format!("Failed to prepare statement: {}", e))?;

    let mut result: HashMap<String, Vec<DbRalphIteration>> = HashMap::new();

    let iterations = stmt
        .query_map(params![folder_path], |row| {
            Ok(DbRalphIteration {
                id: row.get(0)?,
                folder_path: row.get(1)?,
                prd_name: row.get(2)?,
                iteration_number: row.get(3)?,
                session_id: row.get(4)?,
                status: row.get(5)?,
                created_at: row.get(6)?,
                provider: row.get(7)?,
            })
        })
        .map_err(|e| format!("Failed to query iterations: {}", e))?;

    for iter in iterations {
        let iter = iter.map_err(|e| format!("Failed to read iteration: {}", e))?;
        result.entry(iter.prd_name.clone()).or_default().push(iter);
    }

    Ok(result)
}
