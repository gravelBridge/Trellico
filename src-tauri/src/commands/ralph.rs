use crate::models::{RalphIteration, RalphIterationsStore};
use crate::utils::json::{read_json, read_json_or_default, write_json};
use crate::utils::paths::{ralph_dir, ralph_iterations_path};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

#[tauri::command]
pub fn list_ralph_prds(folder_path: String) -> Result<Vec<String>, String> {
    let ralph_path = ralph_dir(&folder_path);
    if !ralph_path.exists() {
        return Ok(vec![]);
    }

    let mut prds = Vec::new();
    let entries = fs::read_dir(&ralph_path)
        .map_err(|e| format!("Failed to read ralph directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        // Check if it's a directory containing prd.json
        if path.is_dir() {
            let prd_file = path.join("prd.json");
            if prd_file.exists() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    prds.push(name.to_string());
                }
            }
        }
    }

    prds.sort();
    Ok(prds)
}

#[tauri::command]
pub fn read_ralph_prd(folder_path: String, prd_name: String) -> Result<String, String> {
    let prd_path = ralph_dir(&folder_path).join(&prd_name).join("prd.json");
    fs::read_to_string(&prd_path).map_err(|e| format!("Failed to read ralph prd file: {}", e))
}

/// Get all ralph PRD directory names
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

#[tauri::command]
pub fn get_ralph_iterations(
    folder_path: String,
    prd_name: String,
) -> Result<Vec<RalphIteration>, String> {
    let iterations_path = ralph_iterations_path(&folder_path);
    let store: RalphIterationsStore = read_json_or_default(&iterations_path);
    Ok(store.iterations.get(&prd_name).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn get_all_ralph_iterations(
    folder_path: String,
) -> Result<HashMap<String, Vec<RalphIteration>>, String> {
    let iterations_path = ralph_iterations_path(&folder_path);
    let store: RalphIterationsStore = read_json_or_default(&iterations_path);
    Ok(store.iterations)
}

#[tauri::command]
pub fn save_ralph_iteration(
    folder_path: String,
    prd_name: String,
    iteration: RalphIteration,
) -> Result<(), String> {
    let iterations_path = ralph_iterations_path(&folder_path);

    let mut store: RalphIterationsStore = read_json_or_default(&iterations_path);
    if store.version == 0 {
        store.version = 1;
    }

    // Add iteration to the PRD's list
    store
        .iterations
        .entry(prd_name)
        .or_default()
        .push(iteration);

    write_json(&iterations_path, &store)
}

#[tauri::command]
pub fn update_ralph_iteration_status(
    folder_path: String,
    prd_name: String,
    iteration_number: u32,
    status: String,
) -> Result<(), String> {
    let iterations_path = ralph_iterations_path(&folder_path);

    if !iterations_path.exists() {
        return Err("Iterations file does not exist".to_string());
    }

    let mut store: RalphIterationsStore = read_json(&iterations_path)?;

    // Find and update the iteration
    if let Some(iterations) = store.iterations.get_mut(&prd_name) {
        if let Some(iter) = iterations
            .iter_mut()
            .find(|i| i.iteration_number == iteration_number)
        {
            iter.status = status;
        }
    }

    write_json(&iterations_path, &store)
}

#[tauri::command]
pub fn update_ralph_iteration_session_id(
    folder_path: String,
    prd_name: String,
    iteration_number: u32,
    session_id: String,
) -> Result<(), String> {
    let iterations_path = ralph_iterations_path(&folder_path);

    if !iterations_path.exists() {
        return Err("Iterations file does not exist".to_string());
    }

    let mut store: RalphIterationsStore = read_json(&iterations_path)?;

    // Find and update the iteration
    if let Some(iterations) = store.iterations.get_mut(&prd_name) {
        if let Some(iter) = iterations
            .iter_mut()
            .find(|i| i.iteration_number == iteration_number)
        {
            iter.session_id = session_id;
        }
    }

    write_json(&iterations_path, &store)
}
