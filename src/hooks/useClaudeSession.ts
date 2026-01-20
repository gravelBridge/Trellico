import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { ClaudeMessage } from "@/types";
import { useMessageStore } from "@/contexts";

interface UseClaudeSessionOptions {
  onClaudeExit?: (messages: ClaudeMessage[]) => void;
}

export function useClaudeSession(options: UseClaudeSessionOptions = {}) {
  const { onClaudeExit } = options;
  const store = useMessageStore();
  const bufferRef = useRef("");
  const onClaudeExitRef = useRef(onClaudeExit);

  // Keep the callback ref up to date
  useEffect(() => {
    onClaudeExitRef.current = onClaudeExit;
  }, [onClaudeExit]);

  // Set up event listeners
  useEffect(() => {
    let unlisteners: UnlistenFn[] = [];
    let mounted = true;

    const setupListeners = async () => {
      const outputUnlisten = await listen<string>("claude-output", (event) => {
        if (!mounted) return;

        bufferRef.current += event.payload;
        const lines = bufferRef.current.split("\n");
        bufferRef.current = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as ClaudeMessage;
            // Extract session ID from init message and update the store
            if (parsed.type === "system" && parsed.subtype === "init" && parsed.session_id) {
              store.setLiveSessionId(parsed.session_id);
            }
            store.addMessage(parsed);
          } catch {
            // Not valid JSON, ignore
          }
        }
      });

      const exitUnlisten = await listen<number>("claude-exit", () => {
        if (mounted) {
          // Call the exit callback with current live messages
          if (onClaudeExitRef.current) {
            onClaudeExitRef.current(store.getLiveMessagesRef());
          }
          store.endLiveSession();
        }
      });

      const errorUnlisten = await listen<string>("claude-error", (event) => {
        if (mounted) {
          store.addMessage({ type: "system", content: `Error: ${event.payload}` });
          store.endLiveSession();
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
      userMessageToShow?: string
    ) => {
      bufferRef.current = "";
      // If resuming an existing session, pass its ID to keep messages
      store.startLiveSession(sessionId ?? undefined);

      // Add the user message to display after starting the session
      if (userMessageToShow) {
        store.addMessage({ type: "user", content: userMessageToShow });
      }

      try {
        await invoke("run_claude", {
          message,
          folderPath,
          sessionId,
        });
      } catch (err) {
        store.addMessage({ type: "system", content: `Error: ${err}` });
        store.endLiveSession();
        throw err;
      }
    },
    [store]
  );

  const stopClaude = useCallback(async () => {
    try {
      await invoke("stop_claude");
      store.setRunning(false);
    } catch (err) {
      console.error("Failed to stop Claude:", err);
    }
  }, [store]);

  return {
    runClaude,
    stopClaude,
    isRunning: store.state.isRunning,
  };
}
