use crate::utils::paths::ralph_dir;
use std::collections::HashSet;
use std::fs;
use std::path::Path;

#[tauri::command]
pub fn list_ralph_prds(folder_path: String) -> Result<Vec<String>, String> {
    let ralph_path = ralph_dir(&folder_path);
    if !ralph_path.exists() {
        return Ok(vec![]);
    }

    let mut prds_with_time: Vec<(String, std::time::SystemTime)> = Vec::new();
    let entries = fs::read_dir(&ralph_path)
        .map_err(|e| format!("Failed to read ralph directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        // Check if it's a directory containing prd.json
        if path.is_dir() {
            let prd_file = path.join("prd.json");
            if prd_file.exists() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    let modified = prd_file
                        .metadata()
                        .and_then(|m| m.modified())
                        .unwrap_or(std::time::UNIX_EPOCH);
                    prds_with_time.push((name.to_string(), modified));
                }
            }
        }
    }

    // Sort by modification time, newest first
    prds_with_time.sort_by(|a, b| b.1.cmp(&a.1));
    Ok(prds_with_time.into_iter().map(|(name, _)| name).collect())
}

#[tauri::command]
pub fn read_ralph_prd(folder_path: String, prd_name: String) -> Result<String, String> {
    let prd_path = ralph_dir(&folder_path).join(&prd_name).join("prd.json");
    fs::read_to_string(&prd_path).map_err(|e| format!("Failed to read ralph prd file: {}", e))
}

/// Get all ralph PRD directory names (used by file watcher)
pub fn get_ralph_prd_files(ralph_path: &Path) -> HashSet<String> {
    fs::read_dir(ralph_path)
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|e| {
                    let p = e.path();
                    // Check if it's a directory containing prd.json
                    if p.is_dir() && p.join("prd.json").exists() {
                        p.file_name().and_then(|s| s.to_str()).map(|s| s.to_string())
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}
