import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { ClaudeMessage } from "@/types";

export function useClaudeSession() {
  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const bufferRef = useRef("");

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
            // Extract session ID from init message
            if (parsed.type === "system" && parsed.subtype === "init" && parsed.session_id) {
              setSessionId(parsed.session_id);
            }
            setMessages((prev) => [...prev, parsed]);
          } catch {
            // Not valid JSON, ignore
          }
        }
      });

      const exitUnlisten = await listen<number>("claude-exit", () => {
        if (mounted) {
          setIsRunning(false);
        }
      });

      const errorUnlisten = await listen<string>("claude-error", (event) => {
        if (mounted) {
          setMessages((prev) => [...prev, { type: "system", content: `Error: ${event.payload}` }]);
          setIsRunning(false);
        }
      });

      unlisteners = [outputUnlisten, exitUnlisten, errorUnlisten];
    };

    setupListeners();

    return () => {
      mounted = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  const runClaude = useCallback(
    async (message: string, folderPath: string, currentSessionId: string | null) => {
      bufferRef.current = "";
      setIsRunning(true);

      try {
        await invoke("run_claude", {
          message,
          folderPath,
          sessionId: currentSessionId,
        });
      } catch (err) {
        setMessages((prev) => [...prev, { type: "system", content: `Error: ${err}` }]);
        setIsRunning(false);
        throw err;
      }
    },
    []
  );

  const stopClaude = useCallback(async () => {
    try {
      await invoke("stop_claude");
      setIsRunning(false);
    } catch (err) {
      console.error("Failed to stop Claude:", err);
    }
  }, []);

  return {
    messages,
    setMessages,
    sessionId,
    setSessionId,
    isRunning,
    setIsRunning,
    runClaude,
    stopClaude,
  };
}
