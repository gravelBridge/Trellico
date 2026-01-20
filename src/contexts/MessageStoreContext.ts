import { createContext } from "react";
import type { ClaudeMessage } from "@/types";

// State shape
export interface MessageStoreState {
  // Messages stored per session ID (empty string = unsaved session)
  sessions: Record<string, ClaudeMessage[]>;
  // The session currently receiving Claude output
  liveSessionId: string | null;
  // The session being displayed in UI
  viewedSessionId: string | null;
  // Whether Claude is currently running
  isRunning: boolean;
}

// Context value type
export interface MessageStoreContextValue {
  state: MessageStoreState;
  // Get messages for the currently viewed session
  viewedMessages: ClaudeMessage[];
  // Check if we're viewing the live session
  isViewingLiveSession: boolean;
  // Actions
  startLiveSession: (resumeSessionId?: string) => void;
  setLiveSessionId: (sessionId: string) => void;
  endLiveSession: () => void;
  addMessage: (message: ClaudeMessage) => void;
  viewSession: (sessionId: string | null, messages?: ClaudeMessage[]) => void;
  loadSessionHistory: (sessionId: string, messages: ClaudeMessage[]) => void;
  clearView: () => void;
  setRunning: (isRunning: boolean) => void;
  // Get current state synchronously (always up-to-date, even before React re-renders)
  getStateRef: () => MessageStoreState;
  // Convenience getters
  getViewedMessagesRef: () => ClaudeMessage[];
  getLiveMessagesRef: () => ClaudeMessage[];
  getLiveSessionIdRef: () => string | null;
  getIsRunningRef: () => boolean;
}

export const MessageStoreContext = createContext<MessageStoreContextValue | null>(null);
