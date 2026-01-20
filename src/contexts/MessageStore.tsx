import React, { useCallback, useState, useSyncExternalStore } from "react";
import type { ClaudeMessage } from "@/types";
import { MessageStoreContext, type MessageStoreState, type MessageStoreContextValue } from "./MessageStoreContext";

// Action types
type MessageAction =
  | { type: "START_LIVE_SESSION"; resumeSessionId?: string }
  | { type: "SET_LIVE_SESSION_ID"; sessionId: string }
  | { type: "END_LIVE_SESSION" }
  | { type: "ADD_MESSAGE"; message: ClaudeMessage }
  | { type: "VIEW_SESSION"; sessionId: string | null; messages?: ClaudeMessage[] }
  | { type: "LOAD_SESSION_HISTORY"; sessionId: string; messages: ClaudeMessage[] }
  | { type: "CLEAR_VIEW" }
  | { type: "SET_RUNNING"; isRunning: boolean };

const initialState: MessageStoreState = {
  sessions: {},
  liveSessionId: null,
  viewedSessionId: null,
  isRunning: false,
};

// Temporary session ID for sessions that haven't received their ID yet
const PENDING_SESSION = "__pending__";

function messageReducer(state: MessageStoreState, action: MessageAction): MessageStoreState {
  switch (action.type) {
    case "START_LIVE_SESSION":
      // If resuming an existing session, keep its messages and use its ID
      if (action.resumeSessionId) {
        return {
          ...state,
          liveSessionId: action.resumeSessionId,
          viewedSessionId: action.resumeSessionId,
          isRunning: true,
        };
      }
      // Start a new live session with pending ID
      return {
        ...state,
        liveSessionId: PENDING_SESSION,
        viewedSessionId: PENDING_SESSION,
        sessions: {
          ...state.sessions,
          [PENDING_SESSION]: [],
        },
        isRunning: true,
      };

    case "SET_LIVE_SESSION_ID": {
      // If we're resuming an existing session (not pending), just update the ID if needed
      if (state.liveSessionId !== PENDING_SESSION) {
        // Session was resumed, no migration needed
        return state;
      }

      // Migrate from pending session to real session ID
      const pendingMessages = state.sessions[PENDING_SESSION] || [];
      const newSessions = { ...state.sessions };
      delete newSessions[PENDING_SESSION];
      newSessions[action.sessionId] = pendingMessages;

      return {
        ...state,
        liveSessionId: action.sessionId,
        viewedSessionId: state.viewedSessionId === PENDING_SESSION ? action.sessionId : state.viewedSessionId,
        sessions: newSessions,
      };
    }

    case "END_LIVE_SESSION":
      return {
        ...state,
        liveSessionId: null,
        isRunning: false,
      };

    case "ADD_MESSAGE": {
      // Add message to the live session
      const targetSession = state.liveSessionId;
      if (!targetSession) return state;

      return {
        ...state,
        sessions: {
          ...state.sessions,
          [targetSession]: [...(state.sessions[targetSession] || []), action.message],
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

    case "SET_RUNNING":
      return {
        ...state,
        isRunning: action.isRunning,
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

  // Actions - all dispatch to store
  const startLiveSession = useCallback(
    (resumeSessionId?: string) => {
      store.dispatch({ type: "START_LIVE_SESSION", resumeSessionId });
    },
    [store]
  );

  const setLiveSessionId = useCallback(
    (sessionId: string) => {
      store.dispatch({ type: "SET_LIVE_SESSION_ID", sessionId });
    },
    [store]
  );

  const endLiveSession = useCallback(() => {
    store.dispatch({ type: "END_LIVE_SESSION" });
  }, [store]);

  const addMessage = useCallback(
    (message: ClaudeMessage) => {
      store.dispatch({ type: "ADD_MESSAGE", message });
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

  const setRunning = useCallback(
    (isRunning: boolean) => {
      store.dispatch({ type: "SET_RUNNING", isRunning });
    },
    [store]
  );

  // Synchronous state access - always returns current state from store
  const getStateRef = useCallback(() => store.getState(), [store]);

  const getViewedMessagesRef = useCallback(() => {
    const s = store.getState();
    if (!s.viewedSessionId) return [];
    return s.sessions[s.viewedSessionId] || [];
  }, [store]);

  const getLiveMessagesRef = useCallback(() => {
    const s = store.getState();
    if (!s.liveSessionId) return [];
    return s.sessions[s.liveSessionId] || [];
  }, [store]);

  const getLiveSessionIdRef = useCallback(() => {
    return store.getState().liveSessionId;
  }, [store]);

  const getIsRunningRef = useCallback(() => {
    return store.getState().isRunning;
  }, [store]);

  // Derived values for rendering
  const viewedMessages = state.viewedSessionId ? state.sessions[state.viewedSessionId] || [] : [];
  const isViewingLiveSession = state.viewedSessionId === state.liveSessionId && state.liveSessionId !== null;

  const value: MessageStoreContextValue = {
    state,
    viewedMessages,
    isViewingLiveSession,
    startLiveSession,
    setLiveSessionId,
    endLiveSession,
    addMessage,
    viewSession,
    loadSessionHistory,
    clearView,
    setRunning,
    getStateRef,
    getViewedMessagesRef,
    getLiveMessagesRef,
    getLiveSessionIdRef,
    getIsRunningRef,
  };

  return <MessageStoreContext.Provider value={value}>{children}</MessageStoreContext.Provider>;
}
