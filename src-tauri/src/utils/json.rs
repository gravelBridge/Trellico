use serde::de::DeserializeOwned;
use serde::Serialize;
use std::fs;
use std::path::Path;

/// Read and parse JSON from a file
pub fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T, String> {
    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse JSON: {}", e))
}

/// Read JSON from a file, returning default value if file doesn't exist or is invalid
pub fn read_json_or_default<T: DeserializeOwned + Default>(path: &Path) -> T {
    if !path.exists() {
        return T::default();
    }
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

/// Serialize and write data to a JSON file
pub fn write_json<T: Serialize>(path: &Path, data: &T) -> Result<(), String> {
    let content =
        serde_json::to_string_pretty(data).map_err(|e| format!("Failed to serialize JSON: {}", e))?;
    fs::write(path, content).map_err(|e| format!("Failed to write file: {}", e))
}
