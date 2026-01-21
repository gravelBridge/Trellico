import React, { useCallback, useState, useSyncExternalStore } from "react";
import type { ClaudeMessage } from "@/types";
import { MessageStoreContext, type MessageStoreState, type MessageStoreContextValue } from "./MessageStoreContext";

// Action types - simplified for single-session cache
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
};

// Temporary session ID for sessions that haven't received their ID yet
const PENDING_PREFIX = "__pending__";

function messageReducer(state: MessageStoreState, action: MessageAction): MessageStoreState {
  switch (action.type) {
    case "START_PROCESS": {
      const sessionId = action.sessionId || `${PENDING_PREFIX}${action.processId}`;
      // If continuing the same session, preserve messages; otherwise clear them
      const isContinuingSession = action.sessionId && action.sessionId === state.activeSessionId;
      return {
        ...state,
        runningProcesses: {
          ...state.runningProcesses,
          [action.processId]: sessionId,
        },
        activeSessionId: sessionId,
        messages: isContinuingSession ? state.messages : [],
      };
    }

    case "SET_LIVE_SESSION_ID": {
      const oldSessionId = state.runningProcesses[action.processId];
      if (!oldSessionId) {
        // Process not found, just update the mapping
        return {
          ...state,
          runningProcesses: {
            ...state.runningProcesses,
            [action.processId]: action.sessionId,
          },
        };
      }

      if (oldSessionId === action.sessionId) {
        // Session ID unchanged
        return state;
      }

      // Update the process mapping
      const newRunningProcesses = {
        ...state.runningProcesses,
        [action.processId]: action.sessionId,
      };

      // If we're viewing the old (pending) session, switch to the new session ID
      const newActiveSessionId =
        state.activeSessionId === oldSessionId ? action.sessionId : state.activeSessionId;

      return {
        ...state,
        runningProcesses: newRunningProcesses,
        activeSessionId: newActiveSessionId,
      };
    }

    case "END_PROCESS": {
      const remainingProcesses = { ...state.runningProcesses };
      delete remainingProcesses[action.processId];
      return {
        ...state,
        runningProcesses: remainingProcesses,
      };
    }

    case "ADD_MESSAGE": {
      const sessionId = state.runningProcesses[action.processId];
      if (!sessionId) return state;

      // Only add message if it's for the currently viewed session
      if (sessionId !== state.activeSessionId) return state;

      return {
        ...state,
        messages: [...state.messages, action.message],
      };
    }

    case "VIEW_SESSION":
      // Switch to viewing a different session
      // If messages are provided, use them (for loading historical sessions)
      // Otherwise just switch the session ID (for viewing a running session)
      return {
        ...state,
        activeSessionId: action.sessionId,
        messages: action.messages ?? [],
      };

    case "CLEAR_VIEW":
      // Clear the current view (for starting new conversations)
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
  };

  return <MessageStoreContext.Provider value={value}>{children}</MessageStoreContext.Provider>;
}
