import React, { useCallback, useState, useSyncExternalStore } from "react";
import type { ClaudeMessage } from "@/types";
import { MessageStoreContext, type MessageStoreState, type MessageStoreContextValue } from "./MessageStoreContext";

// Action types
type MessageAction =
  | { type: "START_PROCESS"; processId: string; sessionId?: string }
  | { type: "SET_LIVE_SESSION_ID"; sessionId: string; processId: string }
  | { type: "END_PROCESS"; processId: string }
  | { type: "ADD_MESSAGE"; message: ClaudeMessage; processId: string }
  | { type: "VIEW_SESSION"; sessionId: string | null; messages?: ClaudeMessage[] }
  | { type: "CLEAR_VIEW" };

const initialState: MessageStoreState = {
  activeSessionId: null,
  messages: [],
  runningProcesses: {},
  runningSessions: {},
};

// Temporary session ID for sessions that haven't received their ID yet
const PENDING_PREFIX = "__pending__";

function messageReducer(state: MessageStoreState, action: MessageAction): MessageStoreState {
  switch (action.type) {
    case "START_PROCESS": {
      const sessionId = action.sessionId || `${PENDING_PREFIX}${action.processId}`;
      // If continuing the same session, preserve messages from runningSessions or current
      const existingMessages = state.runningSessions[sessionId] ||
        (action.sessionId === state.activeSessionId ? state.messages : []);

      return {
        ...state,
        runningProcesses: {
          ...state.runningProcesses,
          [action.processId]: sessionId,
        },
        runningSessions: {
          ...state.runningSessions,
          [sessionId]: existingMessages,
        },
        activeSessionId: sessionId,
        messages: existingMessages,
      };
    }

    case "SET_LIVE_SESSION_ID": {
      const oldSessionId = state.runningProcesses[action.processId];
      if (!oldSessionId || oldSessionId === action.sessionId) {
        // Session ID unchanged or process not found
        return state;
      }

      // Migrate messages from pending session to real session
      const pendingMessages = state.runningSessions[oldSessionId] || [];
      const newRunningSessions = { ...state.runningSessions };
      delete newRunningSessions[oldSessionId];
      newRunningSessions[action.sessionId] = [
        ...(newRunningSessions[action.sessionId] || []),
        ...pendingMessages,
      ];

      // Update the process mapping
      const newRunningProcesses = {
        ...state.runningProcesses,
        [action.processId]: action.sessionId,
      };

      // If we're viewing the old (pending) session, switch to the new session ID
      const isViewingPending = state.activeSessionId === oldSessionId;

      return {
        ...state,
        runningProcesses: newRunningProcesses,
        runningSessions: newRunningSessions,
        activeSessionId: isViewingPending ? action.sessionId : state.activeSessionId,
        messages: isViewingPending ? newRunningSessions[action.sessionId] : state.messages,
      };
    }

    case "END_PROCESS": {
      const sessionId = state.runningProcesses[action.processId];
      const remainingProcesses = { ...state.runningProcesses };
      delete remainingProcesses[action.processId];

      // Remove from runningSessions (messages are persisted to disk by Claude)
      const newRunningSessions = { ...state.runningSessions };
      if (sessionId) {
        delete newRunningSessions[sessionId];
      }

      return {
        ...state,
        runningProcesses: remainingProcesses,
        runningSessions: newRunningSessions,
      };
    }

    case "ADD_MESSAGE": {
      const sessionId = state.runningProcesses[action.processId];
      if (!sessionId) return state;

      // Always add to runningSessions so messages accumulate even when not viewed
      const newRunningSessions = {
        ...state.runningSessions,
        [sessionId]: [...(state.runningSessions[sessionId] || []), action.message],
      };

      // Also update messages if this is the active session
      const newMessages = sessionId === state.activeSessionId
        ? [...state.messages, action.message]
        : state.messages;

      return {
        ...state,
        runningSessions: newRunningSessions,
        messages: newMessages,
      };
    }

    case "VIEW_SESSION": {
      if (action.sessionId === null) {
        return {
          ...state,
          activeSessionId: null,
          messages: [],
        };
      }

      // If viewing a running session, use its cached messages
      const runningMessages = state.runningSessions[action.sessionId];
      if (runningMessages !== undefined) {
        return {
          ...state,
          activeSessionId: action.sessionId,
          messages: runningMessages,
        };
      }

      // Otherwise use provided messages (for historical sessions loaded from disk)
      return {
        ...state,
        activeSessionId: action.sessionId,
        messages: action.messages ?? [],
      };
    }

    case "CLEAR_VIEW":
      return {
        ...state,
        activeSessionId: null,
        messages: [],
      };

    default:
      return state;
  }
}

// Create a simple external store
function createStore() {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    dispatch: (action: MessageAction) => {
      state = messageReducer(state, action);
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function MessageStoreProvider({ children }: { children: React.ReactNode }) {
  // Create store once using useState initializer (lint-approved lazy initialization)
  const [store] = useState(createStore);

  // Use useSyncExternalStore to properly subscribe to our store
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  // Actions
  const startProcess = useCallback(
    (processId: string, sessionId?: string) => {
      store.dispatch({ type: "START_PROCESS", processId, sessionId });
    },
    [store]
  );

  const setLiveSessionId = useCallback(
    (sessionId: string, processId: string) => {
      store.dispatch({ type: "SET_LIVE_SESSION_ID", sessionId, processId });
    },
    [store]
  );

  const endProcess = useCallback(
    (processId: string) => {
      store.dispatch({ type: "END_PROCESS", processId });
    },
    [store]
  );

  const addMessage = useCallback(
    (message: ClaudeMessage, processId: string) => {
      store.dispatch({ type: "ADD_MESSAGE", message, processId });
    },
    [store]
  );

  const viewSession = useCallback(
    (sessionId: string | null, messages?: ClaudeMessage[]) => {
      store.dispatch({ type: "VIEW_SESSION", sessionId, messages });
    },
    [store]
  );

  const clearView = useCallback(() => {
    store.dispatch({ type: "CLEAR_VIEW" });
  }, [store]);

  // Synchronous state access
  const getStateRef = useCallback(() => store.getState(), [store]);

  const getViewedMessagesRef = useCallback(() => {
    return store.getState().messages;
  }, [store]);

  const getProcessSessionId = useCallback(
    (processId: string) => {
      return store.getState().runningProcesses[processId] || null;
    },
    [store]
  );

  const getRunningSessionMessages = useCallback(
    (sessionId: string) => {
      return store.getState().runningSessions[sessionId] || null;
    },
    [store]
  );

  // Check if a session is running
  const isSessionRunning = useCallback(
    (sessionId: string | null) => {
      if (!sessionId) return false;
      const s = store.getState();
      return Object.values(s.runningProcesses).includes(sessionId);
    },
    [store]
  );

  // Check if any process is running
  const hasAnyRunning = useCallback(() => {
    return Object.keys(store.getState().runningProcesses).length > 0;
  }, [store]);

  // Derived values for rendering
  const viewedMessages = state.messages;
  const isViewingRunningSession = state.activeSessionId
    ? Object.values(state.runningProcesses).includes(state.activeSessionId)
    : false;

  const value: MessageStoreContextValue = {
    state,
    viewedMessages,
    isViewingRunningSession,
    isSessionRunning,
    hasAnyRunning,
    startProcess,
    setLiveSessionId,
    endProcess,
    addMessage,
    viewSession,
    clearView,
    getStateRef,
    getViewedMessagesRef,
    getProcessSessionId,
    getRunningSessionMessages,
  };

  return <MessageStoreContext.Provider value={value}>{children}</MessageStoreContext.Provider>;
}
