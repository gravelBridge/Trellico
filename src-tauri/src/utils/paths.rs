use std::path::{Path, PathBuf};

/// Get the .trellico directory path
pub fn trellico_dir(folder_path: &str) -> PathBuf {
    Path::new(folder_path).join(".trellico")
}

/// Get the plans directory path
pub fn plans_dir(folder_path: &str) -> PathBuf {
    trellico_dir(folder_path).join("plans")
}

/// Get the ralph directory path
pub fn ralph_dir(folder_path: &str) -> PathBuf {
    trellico_dir(folder_path).join("ralph")
}

/// Get the session links file path
pub fn session_links_path(folder_path: &str) -> PathBuf {
    trellico_dir(folder_path).join("session-links.json")
}

/// Get the ralph iterations file path
pub fn ralph_iterations_path(folder_path: &str) -> PathBuf {
    trellico_dir(folder_path).join("ralph-iterations.json")
}
