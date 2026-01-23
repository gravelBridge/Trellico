// Ralph iteration type (used by db commands)
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct RalphIteration {
    pub iteration_number: u32,
    pub session_id: String,
    pub status: String, // "running" | "completed" | "stopped"
    pub created_at: String,
    pub provider: Option<String>,
}

// Plan change event type
#[derive(serde::Serialize, Clone)]
pub struct PlanChangeEvent {
    pub change_type: String, // "created" | "modified" | "removed" | "renamed"
    pub file_name: String,
    pub old_file_name: Option<String>,
    pub folder_path: String,
}

// Ralph PRD change event type
#[derive(serde::Serialize, Clone)]
pub struct RalphPrdChangeEvent {
    pub folder_path: String,
}

// Plans changed event type (general refresh event)
#[derive(serde::Serialize, Clone)]
pub struct PlansChangedEvent {
    pub folder_path: String,
}
