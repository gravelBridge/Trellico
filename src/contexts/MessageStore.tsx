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
  | { type: "LOAD_SESSION_HISTORY"; sessionId: string; messages: ClaudeMessage[] }
  | { type: "CLEAR_VIEW" };

const initialState: MessageStoreState = {
  sessions: {},
  runningProcesses: {},
  viewedSessionId: null,
};

// Temporary session ID for sessions that haven't received their ID yet
const PENDING_PREFIX = "__pending__";

function messageReducer(state: MessageStoreState, action: MessageAction): MessageStoreState {
  switch (action.type) {
    case "START_PROCESS": {
      const sessionId = action.sessionId || `${PENDING_PREFIX}${action.processId}`;
      return {
        ...state,
        runningProcesses: {
          ...state.runningProcesses,
          [action.processId]: sessionId,
        },
        viewedSessionId: sessionId,
        sessions: {
          ...state.sessions,
          [sessionId]: state.sessions[sessionId] || [],
        },
      };
    }

    case "SET_LIVE_SESSION_ID": {
      const oldSessionId = state.runningProcesses[action.processId];
      if (!oldSessionId || oldSessionId === action.sessionId) {
        // Session ID unchanged or process not found
        return {
          ...state,
          runningProcesses: {
            ...state.runningProcesses,
            [action.processId]: action.sessionId,
          },
        };
      }

      // Migrate from pending session to real session ID
      const pendingMessages = state.sessions[oldSessionId] || [];
      const newSessions = { ...state.sessions };

      // Only delete if it was a pending session
      if (oldSessionId.startsWith(PENDING_PREFIX)) {
        delete newSessions[oldSessionId];
      }

      newSessions[action.sessionId] = [
        ...(newSessions[action.sessionId] || []),
        ...pendingMessages,
      ];

      return {
        ...state,
        runningProcesses: {
          ...state.runningProcesses,
          [action.processId]: action.sessionId,
        },
        viewedSessionId: state.viewedSessionId === oldSessionId ? action.sessionId : state.viewedSessionId,
        sessions: newSessions,
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

      return {
        ...state,
        sessions: {
          ...state.sessions,
          [sessionId]: [...(state.sessions[sessionId] || []), action.message],
        },
      };
    }

    case "VIEW_SESSION":
      // Switch which session is being viewed, optionally loading messages
      if (action.messages && action.sessionId) {
        return {
          ...state,
          viewedSessionId: action.sessionId,
          sessions: {
            ...state.sessions,
            [action.sessionId]: action.messages,
          },
        };
      }
      return {
        ...state,
        viewedSessionId: action.sessionId,
      };

    case "LOAD_SESSION_HISTORY":
      // Load historical messages for a session
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.sessionId]: action.messages,
        },
      };

    case "CLEAR_VIEW":
      // Clear the current view (for starting new conversations)
      return {
        ...state,
        viewedSessionId: null,
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

  const loadSessionHistory = useCallback(
    (sessionId: string, messages: ClaudeMessage[]) => {
      store.dispatch({ type: "LOAD_SESSION_HISTORY", sessionId, messages });
    },
    [store]
  );

  const clearView = useCallback(() => {
    store.dispatch({ type: "CLEAR_VIEW" });
  }, [store]);

  // Synchronous state access
  const getStateRef = useCallback(() => store.getState(), [store]);

  const getViewedMessagesRef = useCallback(() => {
    const s = store.getState();
    if (!s.viewedSessionId) return [];
    return s.sessions[s.viewedSessionId] || [];
  }, [store]);

  const getSessionMessagesRef = useCallback(
    (sessionId: string) => {
      const s = store.getState();
      return s.sessions[sessionId] || [];
    },
    [store]
  );

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
  const viewedMessages = state.viewedSessionId ? state.sessions[state.viewedSessionId] || [] : [];
  const isViewingRunningSession = state.viewedSessionId
    ? Object.values(state.runningProcesses).includes(state.viewedSessionId)
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
    loadSessionHistory,
    clearView,
    getStateRef,
    getViewedMessagesRef,
    getSessionMessagesRef,
    getProcessSessionId,
  };

  return <MessageStoreContext.Provider value={value}>{children}</MessageStoreContext.Provider>;
}
