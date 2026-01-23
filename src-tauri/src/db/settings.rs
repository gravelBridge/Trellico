use super::DbConnection;
use crate::providers::Provider;
use chrono::Utc;
use rusqlite::{params, OptionalExtension};

/// Get the provider for a folder
pub fn get_folder_provider(conn: &DbConnection, folder_path: &str) -> Result<Provider, String> {
    let conn = conn.lock().map_err(|e| format!("Lock error: {}", e))?;

    let result: Option<String> = conn
        .query_row(
            "SELECT provider FROM folder_settings WHERE folder_path = ?1",
            params![folder_path],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Failed to get folder provider: {}", e))?;

    match result {
        Some(provider_str) => {
            // Parse the provider string
            let provider_json = format!("\"{}\"", provider_str);
            serde_json::from_str(&provider_json).map_err(|e| format!("Invalid provider: {}", e))
        }
        None => Ok(Provider::default()),
    }
}

/// Set the provider for a folder
pub fn set_folder_provider(
    conn: &DbConnection,
    folder_path: &str,
    provider: Provider,
) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| format!("Lock error: {}", e))?;
    let now = Utc::now().to_rfc3339();
    let provider_str = serde_json::to_string(&provider)
        .map_err(|e| format!("Serialize error: {}", e))?
        .trim_matches('"')
        .to_string();

    conn.execute(
        "INSERT INTO folder_settings (folder_path, provider, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(folder_path) DO UPDATE SET
            provider = excluded.provider,
            updated_at = excluded.updated_at",
        params![folder_path, provider_str, now],
    )
    .map_err(|e| format!("Failed to set folder provider: {}", e))?;

    Ok(())
}
