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
