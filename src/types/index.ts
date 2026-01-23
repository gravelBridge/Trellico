export interface AIMessage {
  type: string;
  subtype?: string;
  message?: {
    role?: string;
    // content can be a string (user messages from JSONL) or array (assistant messages)
    content?: string | Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
  };
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  content?: string;
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  session_id?: string;
  /** If present, this message is part of a subagent context (not a real user message) */
  parent_tool_use_id?: string;
}

export type Provider = "claude_code" | "amp";

export interface FolderSession {
  id: string;
  provider: string;
  display_name: string | null;
  created_at: string;
  linked_plan: string | null;
}

export interface SessionPlanLink {
  session_id: string;
  plan_file_name: string;
  link_type: "plan" | "ralph_prd";
  created_at: string;
  updated_at: string;
  provider: Provider;
}

export interface RalphIteration {
  iteration_number: number;
  session_id: string;
  status: "running" | "completed" | "stopped";
  created_at: string;
  provider: Provider | null;
}

export interface GeneratingItem {
  id: string;              // Unique ID (use processId)
  displayName: string;     // User message or "Converting [name]..."
  type: "plan" | "ralph_prd";
  sessionId: string;       // Session ID (starts as __pending__${id}, updated when real ID received)
  targetName?: string;     // For ralph_prd: the expected prd name (plan filename)
  provider?: Provider;     // Provider used for this session (for enforcing provider match on continue)
}
