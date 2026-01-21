import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { ClaudeMessage } from "@/types";
import { useMessageStore } from "@/contexts";

interface ClaudeOutput {
  process_id: string;
  data: string;
}

interface ClaudeExit {
  process_id: string;
  code: number;
}

interface ClaudeError {
  process_id: string;
  error: string;
}

interface ProcessInfo {
  sessionId: string;
  buffer: string;
  onExit?: (messages: ClaudeMessage[]) => void;
}

interface UseClaudeSessionOptions {
  onClaudeExit?: (messages: ClaudeMessage[], sessionId: string) => void;
  onSessionIdReceived?: (processId: string, sessionId: string) => void;
}

export function useClaudeSession(options: UseClaudeSessionOptions = {}) {
  const { onClaudeExit, onSessionIdReceived } = options;
  const store = useMessageStore();

  // Track process_id -> session info mapping
  const processesRef = useRef<Map<string, ProcessInfo>>(new Map());
  const onClaudeExitRef = useRef(onClaudeExit);
  const onSessionIdReceivedRef = useRef(onSessionIdReceived);

  // Keep the callback refs up to date
  useEffect(() => {
    onClaudeExitRef.current = onClaudeExit;
  }, [onClaudeExit]);

  useEffect(() => {
    onSessionIdReceivedRef.current = onSessionIdReceived;
  }, [onSessionIdReceived]);

  // Set up event listeners
  useEffect(() => {
    let unlisteners: UnlistenFn[] = [];
    let mounted = true;

    const setupListeners = async () => {
      const outputUnlisten = await listen<ClaudeOutput>("claude-output", (event) => {
        if (!mounted) return;

        const { process_id, data } = event.payload;
        const processInfo = processesRef.current.get(process_id);
        if (!processInfo) return;

        processInfo.buffer += data;
        const lines = processInfo.buffer.split("\n");
        processInfo.buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as ClaudeMessage;
            // Extract session ID from init message
            if (parsed.type === "system" && parsed.subtype === "init" && parsed.session_id) {
              // Update session ID if we got it from init (for new sessions)
              if (processInfo.sessionId !== parsed.session_id) {
                processInfo.sessionId = parsed.session_id;
                store.setLiveSessionId(parsed.session_id, process_id);
                // Notify listeners so they can persist the session ID immediately
                onSessionIdReceivedRef.current?.(process_id, parsed.session_id);
              }
            }
            store.addMessage(parsed, process_id);
          } catch {
            // Not valid JSON, ignore
          }
        }
      });

      const exitUnlisten = await listen<ClaudeExit>("claude-exit", (event) => {
        if (!mounted) return;

        const { process_id } = event.payload;
        const processInfo = processesRef.current.get(process_id);
        if (!processInfo) return;

        // Call the exit callback with messages for this session
        // Use getViewedMessagesRef since we only cache the viewed session
        const messages = store.getViewedMessagesRef();
        if (processInfo.onExit) {
          processInfo.onExit(messages);
        } else if (onClaudeExitRef.current) {
          onClaudeExitRef.current(messages, processInfo.sessionId);
        }

        store.endProcess(process_id);
        processesRef.current.delete(process_id);
      });

      const errorUnlisten = await listen<ClaudeError>("claude-error", (event) => {
        if (!mounted) return;

        const { process_id, error } = event.payload;
        const processInfo = processesRef.current.get(process_id);
        if (processInfo) {
          store.addMessage({ type: "system", content: `Error: ${error}` }, process_id);
          store.endProcess(process_id);
          processesRef.current.delete(process_id);
        }
      });

      unlisteners = [outputUnlisten, exitUnlisten, errorUnlisten];
    };

    setupListeners();

    return () => {
      mounted = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [store]);

  const runClaude = useCallback(
    async (
      message: string,
      folderPath: string,
      sessionId: string | null,
      userMessageToShow?: string,
      onExit?: (messages: ClaudeMessage[]) => void
    ): Promise<string> => {
      // Start the process and get process_id
      const processId = await invoke<string>("run_claude", {
        message,
        folderPath,
        sessionId,
      });

      // Track this process
      processesRef.current.set(processId, {
        sessionId: sessionId || "__pending__",
        buffer: "",
        onExit,
      });

      // Start live session in store
      store.startProcess(processId, sessionId ?? undefined);

      // Add the user message to display
      if (userMessageToShow) {
        store.addMessage({ type: "user", content: userMessageToShow }, processId);
      }

      return processId;
    },
    [store]
  );

  const stopClaude = useCallback(async (processId?: string) => {
    try {
      await invoke("stop_claude", { processId: processId || null });
      if (processId) {
        store.endProcess(processId);
        processesRef.current.delete(processId);
      } else {
        // Stop all - clear all processes
        for (const pid of processesRef.current.keys()) {
          store.endProcess(pid);
        }
        processesRef.current.clear();
      }
    } catch (err) {
      console.error("Failed to stop Claude:", err);
    }
  }, [store]);

  return {
    runClaude,
    stopClaude,
    isSessionRunning: store.isSessionRunning,
    hasAnyRunning: store.hasAnyRunning,
  };
}
