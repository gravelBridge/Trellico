import React, { useCallback, useState, useSyncExternalStore } from "react";
import type { AIMessage, Provider } from "@/types";
import { MessageStoreContext, type MessageStoreState, type MessageStoreContextValue } from "./MessageStoreContext";

// Action types
type MessageAction =
  | { type: "START_PROCESS"; processId: string; folderPath: string; sessionId?: string; provider?: Provider }
  | { type: "SET_LIVE_SESSION_ID"; sessionId: string; processId: string }
  | { type: "END_PROCESS"; processId: string }
  | { type: "ADD_MESSAGE"; message: AIMessage; processId: string }
  | { type: "VIEW_SESSION"; sessionId: string | null; messages?: AIMessage[]; provider?: Provider }
  | { type: "CLEAR_VIEW" };

const initialState: MessageStoreState = {
  activeSessionId: null,
  activeSessionProvider: null,
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
      // Use provided provider, or preserve existing provider if continuing same session
      const provider = action.provider ?? (action.sessionId === state.activeSessionId ? state.activeSessionProvider : null);

      return {
        ...state,
        runningProcesses: {
          ...state.runningProcesses,
          [action.processId]: {
            sessionId,
            folderPath: action.folderPath,
            provider: provider ?? "claude_code",
          },
        },
        runningSessions: {
          ...state.runningSessions,
          [sessionId]: existingMessages,
        },
        activeSessionId: sessionId,
        activeSessionProvider: provider,
        messages: existingMessages,
      };
    }

    case "SET_LIVE_SESSION_ID": {
      const processInfo = state.runningProcesses[action.processId];
      if (!processInfo || processInfo.sessionId === action.sessionId) {
        // Session ID unchanged or process not found
        return state;
      }

      const oldSessionId = processInfo.sessionId;

      // Migrate messages from pending session to real session
      const pendingMessages = state.runningSessions[oldSessionId] || [];
      const newRunningSessions = { ...state.runningSessions };
      delete newRunningSessions[oldSessionId];
      newRunningSessions[action.sessionId] = [
        ...(newRunningSessions[action.sessionId] || []),
        ...pendingMessages,
      ];

      // Update the process mapping (keep the same folderPath)
      const newRunningProcesses = {
        ...state.runningProcesses,
        [action.processId]: {
          ...processInfo,
          sessionId: action.sessionId,
        },
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
      const processInfo = state.runningProcesses[action.processId];
      const remainingProcesses = { ...state.runningProcesses };
      delete remainingProcesses[action.processId];

      // Remove from runningSessions (messages are persisted to disk by Claude)
      const newRunningSessions = { ...state.runningSessions };
      if (processInfo?.sessionId) {
        delete newRunningSessions[processInfo.sessionId];
      }

      return {
        ...state,
        runningProcesses: remainingProcesses,
        runningSessions: newRunningSessions,
      };
    }

    case "ADD_MESSAGE": {
      const processInfo = state.runningProcesses[action.processId];
      if (!processInfo) return state;

      const sessionId = processInfo.sessionId;

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
          activeSessionProvider: null,
          messages: [],
        };
      }

      // If viewing a running session, use its cached messages
      const runningMessages = state.runningSessions[action.sessionId];
      if (runningMessages !== undefined) {
        return {
          ...state,
          activeSessionId: action.sessionId,
          activeSessionProvider: action.provider ?? state.activeSessionProvider,
          messages: runningMessages,
        };
      }

      // Otherwise use provided messages (for historical sessions loaded from disk)
      return {
        ...state,
        activeSessionId: action.sessionId,
        activeSessionProvider: action.provider ?? null,
        messages: action.messages ?? [],
      };
    }

    case "CLEAR_VIEW":
      return {
        ...state,
        activeSessionId: null,
        activeSessionProvider: null,
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
    (processId: string, folderPath: string, sessionId?: string, provider?: Provider) => {
      store.dispatch({ type: "START_PROCESS", processId, folderPath, sessionId, provider });
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
    (message: AIMessage, processId: string) => {
      store.dispatch({ type: "ADD_MESSAGE", message, processId });
    },
    [store]
  );

  const viewSession = useCallback(
    (sessionId: string | null, messages?: AIMessage[], provider?: Provider) => {
      store.dispatch({ type: "VIEW_SESSION", sessionId, messages, provider });
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
      return store.getState().runningProcesses[processId]?.sessionId || null;
    },
    [store]
  );

  const getProcessFolderPath = useCallback(
    (processId: string) => {
      return store.getState().runningProcesses[processId]?.folderPath || null;
    },
    [store]
  );

  const getRunningSessionMessages = useCallback(
    (sessionId: string) => {
      return store.getState().runningSessions[sessionId] || null;
    },
    [store]
  );

  // Reverse lookup: sessionId -> processId
  const getSessionProcessId = useCallback(
    (sessionId: string) => {
      const processes = store.getState().runningProcesses;
      for (const [processId, info] of Object.entries(processes)) {
        if (info.sessionId === sessionId) return processId;
      }
      return null;
    },
    [store]
  );

  // Check if a session is running
  const isSessionRunning = useCallback(
    (sessionId: string | null) => {
      if (!sessionId) return false;
      const s = store.getState();
      return Object.values(s.runningProcesses).some((info) => info.sessionId === sessionId);
    },
    [store]
  );

  // Check if any process is running
  const hasAnyRunning = useCallback(() => {
    return Object.keys(store.getState().runningProcesses).length > 0;
  }, [store]);

  // Check if a folder has any running processes
  const hasFolderRunning = useCallback(
    (folderPath: string) => {
      const processes = store.getState().runningProcesses;
      return Object.values(processes).some((info) => info.folderPath === folderPath);
    },
    [store]
  );

  // Get all process IDs running in a folder
  const getFolderProcesses = useCallback(
    (folderPath: string) => {
      const processes = store.getState().runningProcesses;
      return Object.entries(processes)
        .filter(([, info]) => info.folderPath === folderPath)
        .map(([processId]) => processId);
    },
    [store]
  );

  // Derived values for rendering
  const viewedMessages = state.messages;
  const isViewingRunningSession = state.activeSessionId
    ? Object.values(state.runningProcesses).some((info) => info.sessionId === state.activeSessionId)
    : false;

  const value: MessageStoreContextValue = {
    state,
    viewedMessages,
    isViewingRunningSession,
    isSessionRunning,
    hasAnyRunning,
    hasFolderRunning,
    getFolderProcesses,
    startProcess,
    setLiveSessionId,
    endProcess,
    addMessage,
    viewSession,
    clearView,
    getStateRef,
    getViewedMessagesRef,
    getProcessSessionId,
    getProcessFolderPath,
    getSessionProcessId,
    getRunningSessionMessages,
  };

  return <MessageStoreContext.Provider value={value}>{children}</MessageStoreContext.Provider>;
}
