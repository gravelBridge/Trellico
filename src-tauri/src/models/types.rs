use std::collections::HashMap;

// Session-Plan linking types
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SessionPlanLink {
    pub session_id: String,
    pub plan_file_name: String,
    #[serde(default = "default_link_type")]
    pub link_type: String, // "plan" or "ralph_prd"
    pub created_at: String,
    pub updated_at: String,
}

pub fn default_link_type() -> String {
    "plan".to_string()
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
pub struct SessionLinksStore {
    pub version: u32,
    pub links: Vec<SessionPlanLink>,
}

// Ralph iteration types
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct RalphIteration {
    pub iteration_number: u32,
    pub session_id: String,
    pub status: String, // "running" | "completed" | "stopped"
    pub created_at: String,
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
pub struct RalphIterationsStore {
    pub version: u32,
    pub iterations: HashMap<String, Vec<RalphIteration>>, // PRD name -> iterations
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

// Ralph iterations change event type
#[derive(serde::Serialize, Clone)]
pub struct RalphIterationsChangeEvent {
    pub folder_path: String,
}

// Plans changed event type (general refresh event)
#[derive(serde::Serialize, Clone)]
pub struct PlansChangedEvent {
    pub folder_path: String,
}
