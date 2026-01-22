use notify::RecommendedWatcher;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, LazyLock, Mutex};

// Claude processes - maps process_id to stop flag
pub static CLAUDE_PROCESSES: LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

// Per-folder watchers and known files tracking
#[derive(Default)]
pub struct FolderWatchers {
    pub plans_watcher: Option<RecommendedWatcher>,
    pub ralph_prd_watcher: Option<RecommendedWatcher>,
    pub ralph_iterations_watcher: Option<RecommendedWatcher>,
    pub known_plans: HashSet<String>,
    pub known_ralph_prds: HashSet<String>,
}

// Map of folder_path -> FolderWatchers
pub static FOLDER_WATCHERS: LazyLock<Mutex<HashMap<String, FolderWatchers>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
