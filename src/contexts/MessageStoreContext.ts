import { createContext } from "react";
import type { ClaudeMessage } from "@/types";

// Simplified state shape - only cache the currently viewed session
export interface MessageStoreState {
  // Currently viewed session ID
  activeSessionId: string | null;
  // Messages for the active session only (not all sessions)
  messages: ClaudeMessage[];
  // All running processes: processId -> sessionId (for tracking what's running)
  runningProcesses: Record<string, string>;
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
  // Actions
  startProcess: (processId: string, sessionId?: string) => void;
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
}

export const MessageStoreContext = createContext<MessageStoreContextValue | null>(null);
