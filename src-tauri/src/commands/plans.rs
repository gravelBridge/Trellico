use crate::utils::paths::{plans_dir, trellico_dir};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

#[tauri::command]
pub fn setup_folder(folder_path: String) -> Result<(), String> {
    let trellico_path = trellico_dir(&folder_path);
    if !trellico_path.exists() {
        fs::create_dir(&trellico_path)
            .map_err(|e| format!("Failed to create .trellico folder: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_plans(folder_path: String) -> Result<Vec<String>, String> {
    let plans_path = plans_dir(&folder_path);
    if !plans_path.exists() {
        return Ok(vec![]);
    }

    let mut plans = Vec::new();
    let entries = fs::read_dir(&plans_path)
        .map_err(|e| format!("Failed to read plans directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().is_some_and(|ext| ext == "md") {
            if let Some(stem) = path.file_stem() {
                if let Some(name) = stem.to_str() {
                    plans.push(name.to_string());
                }
            }
        }
    }

    plans.sort();
    Ok(plans)
}

#[tauri::command]
pub fn read_plan(folder_path: String, plan_name: String) -> Result<String, String> {
    let plan_path = plans_dir(&folder_path).join(format!("{}.md", plan_name));
    fs::read_to_string(&plan_path).map_err(|e| format!("Failed to read plan file: {}", e))
}

/// Get all plan file names (without extension) from the plans directory
pub fn get_plan_files(plans_path: &Path) -> HashSet<String> {
    fs::read_dir(plans_path)
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|e| {
                    let p = e.path();
                    if p.is_file() && p.extension().is_some_and(|ext| ext == "md") {
                        p.file_stem().and_then(|s| s.to_str()).map(|s| s.to_string())
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}
