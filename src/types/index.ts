export interface ClaudeMessage {
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
}

export interface SessionPlanLink {
  session_id: string;
  plan_file_name: string;
  link_type: "plan" | "ralph_prd";
  created_at: string;
  updated_at: string;
}
