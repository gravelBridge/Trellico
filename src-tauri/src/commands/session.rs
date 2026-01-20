use crate::models::{SessionLinksStore, SessionPlanLink};
use crate::utils::json::{read_json_or_default, write_json};
use crate::utils::paths::session_links_path;
use chrono::Utc;
use std::fs;
use std::io::{BufRead, BufReader};

#[tauri::command]
pub fn read_session_links(folder_path: String) -> Result<SessionLinksStore, String> {
    let links_path = session_links_path(&folder_path);

    if !links_path.exists() {
        return Ok(SessionLinksStore::default());
    }

    let content =
        fs::read_to_string(&links_path).map_err(|e| format!("Failed to read session links: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse session links: {}", e))
}

/// Internal helper to save a session link with a given link_type
fn save_link_internal(
    folder_path: &str,
    session_id: String,
    file_name: String,
    link_type: &str,
) -> Result<(), String> {
    let links_path = session_links_path(folder_path);

    let mut store: SessionLinksStore = read_json_or_default(&links_path);
    if store.version == 0 {
        store.version = 1;
    }

    let now = Utc::now().to_rfc3339();

    // Check if link already exists
    if let Some(existing) = store
        .links
        .iter_mut()
        .find(|l| l.plan_file_name == file_name && l.link_type == link_type)
    {
        existing.session_id = session_id;
        existing.updated_at = now;
    } else {
        store.links.push(SessionPlanLink {
            session_id,
            plan_file_name: file_name,
            link_type: link_type.to_string(),
            created_at: now.clone(),
            updated_at: now,
        });
    }

    write_json(&links_path, &store)
}

#[tauri::command]
pub fn save_session_link(
    folder_path: String,
    session_id: String,
    plan_file_name: String,
) -> Result<(), String> {
    save_link_internal(&folder_path, session_id, plan_file_name, "plan")
}

#[tauri::command]
pub fn save_ralph_link(
    folder_path: String,
    session_id: String,
    prd_file_name: String,
) -> Result<(), String> {
    save_link_internal(&folder_path, session_id, prd_file_name, "ralph_prd")
}

#[tauri::command]
pub fn get_link_by_plan(
    folder_path: String,
    plan_file_name: String,
) -> Result<Option<SessionPlanLink>, String> {
    let store = read_session_links(folder_path)?;
    Ok(store
        .links
        .into_iter()
        .find(|l| l.plan_file_name == plan_file_name && l.link_type == "plan"))
}

#[tauri::command]
pub fn get_link_by_ralph_prd(
    folder_path: String,
    prd_file_name: String,
) -> Result<Option<SessionPlanLink>, String> {
    let store = read_session_links(folder_path)?;
    Ok(store
        .links
        .into_iter()
        .find(|l| l.plan_file_name == prd_file_name && l.link_type == "ralph_prd"))
}

#[tauri::command]
pub fn update_plan_link_filename(
    folder_path: String,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    let links_path = session_links_path(&folder_path);

    if !links_path.exists() {
        return Ok(());
    }

    let content =
        fs::read_to_string(&links_path).map_err(|e| format!("Failed to read session links: {}", e))?;

    let mut store: SessionLinksStore =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse session links: {}", e))?;

    let now = Utc::now().to_rfc3339();

    if let Some(link) = store
        .links
        .iter_mut()
        .find(|l| l.plan_file_name == old_name && l.link_type == "plan")
    {
        link.plan_file_name = new_name;
        link.updated_at = now;

        write_json(&links_path, &store)?;
    }

    Ok(())
}

#[tauri::command]
pub fn load_session_history(
    folder_path: String,
    session_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    // Convert folder path to Claude project dir name (replace / with -)
    let project_dir_name = folder_path.replace("/", "-");

    // Build path: ~/.claude/projects/<project_dir_name>/<session_id>.jsonl
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let session_file = home
        .join(".claude")
        .join("projects")
        .join(&project_dir_name)
        .join(format!("{}.jsonl", session_id));

    if !session_file.exists() {
        return Ok(vec![]);
    }

    let file =
        fs::File::open(&session_file).map_err(|e| format!("Failed to open session file: {}", e))?;

    let reader = BufReader::new(file);
    let messages: Vec<serde_json::Value> = reader
        .lines()
        .map_while(Result::ok)
        .filter_map(|line| serde_json::from_str(&line).ok())
        .filter(|msg: &serde_json::Value| {
            matches!(
                msg.get("type").and_then(|t| t.as_str()),
                Some("user") | Some("assistant")
            )
        })
        .collect();

    Ok(messages)
}
