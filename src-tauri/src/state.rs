use notify::RecommendedWatcher;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, LazyLock, Mutex};

// Claude processes - maps process_id to stop flag
pub static CLAUDE_PROCESSES: LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

// File watchers
pub static PLANS_WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);
pub static RALPH_ITERATIONS_WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);
pub static RALPH_PRD_WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);

// Known files tracking for change detection
pub static KNOWN_PLANS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));
pub static KNOWN_RALPH_PRDS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));
