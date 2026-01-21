import { createContext } from "react";
import type { ClaudeMessage } from "@/types";

// Process info including session and folder
export interface ProcessInfo {
  sessionId: string;
  folderPath: string;
}

// State shape - cache running sessions so they accumulate in background
export interface MessageStoreState {
  // Currently viewed session ID
  activeSessionId: string | null;
  // Messages for the active session (derived from runningSessions or loaded from disk)
  messages: ClaudeMessage[];
  // All running processes: processId -> { sessionId, folderPath } (for tracking what's running)
  runningProcesses: Record<string, ProcessInfo>;
  // Messages for all running sessions (so they accumulate even when not viewed)
  runningSessions: Record<string, ClaudeMessage[]>;
}

// Context value type
export interface MessageStoreContextValue {
  state: MessageStoreState;
  // Get messages for the currently viewed session
  viewedMessages: ClaudeMessage[];
  // Check if the viewed session is running
  isViewingRunningSession: boolean;
  // Check if a specific session is running
  isSessionRunning: (sessionId: string | null) => boolean;
  // Check if any process is running
  hasAnyRunning: () => boolean;
  // Check if a folder has any running processes
  hasFolderRunning: (folderPath: string) => boolean;
  // Get all process IDs running in a folder
  getFolderProcesses: (folderPath: string) => string[];
  // Actions
  startProcess: (processId: string, folderPath: string, sessionId?: string) => void;
  setLiveSessionId: (sessionId: string, processId: string) => void;
  endProcess: (processId: string) => void;
  addMessage: (message: ClaudeMessage, processId: string) => void;
  viewSession: (sessionId: string | null, messages?: ClaudeMessage[]) => void;
  clearView: () => void;
  // Get current state synchronously (always up-to-date, even before React re-renders)
  getStateRef: () => MessageStoreState;
  // Convenience getters
  getViewedMessagesRef: () => ClaudeMessage[];
  getProcessSessionId: (processId: string) => string | null;
  getProcessFolderPath: (processId: string) => string | null;
  getSessionProcessId: (sessionId: string) => string | null;
  getRunningSessionMessages: (sessionId: string) => ClaudeMessage[] | null;
}

export const MessageStoreContext = createContext<MessageStoreContextValue | null>(null);
