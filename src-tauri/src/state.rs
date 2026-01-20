use notify::RecommendedWatcher;
use portable_pty::MasterPty;
use std::collections::HashSet;
use std::sync::atomic::AtomicBool;
use std::sync::{LazyLock, Mutex};

// Claude process state
pub static PROCESS_RUNNING: AtomicBool = AtomicBool::new(false);
pub static STOP_REQUESTED: AtomicBool = AtomicBool::new(false);
pub static MASTER_PTY: Mutex<Option<Box<dyn MasterPty + Send>>> = Mutex::new(None);

// File watchers
pub static PLANS_WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);
pub static RALPH_ITERATIONS_WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);
pub static RALPH_PRD_WATCHER: Mutex<Option<RecommendedWatcher>> = Mutex::new(None);

// Known files tracking for change detection
pub static KNOWN_PLANS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));
pub static KNOWN_RALPH_PRDS: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));
