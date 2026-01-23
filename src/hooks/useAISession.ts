import { useEffect, useRef, useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { AIMessage, Provider } from "@/types";
import { useMessageStore } from "@/contexts";

interface AIOutput {
  process_id: string;
  data: string;
}

interface AIExit {
  process_id: string;
  code: number;
}

interface AIError {
  process_id: string;
  error: string;
}

interface ProcessInfo {
  sessionId: string;
  buffer: string;
  provider: string;
  sessionType: "plan" | "ralph_prd";
  onExit?: (messages: AIMessage[]) => void;
  initialUserMessage?: string; // Track user message for new sessions (saved to DB when session ID arrives)
}

interface ProviderStatus {
  available: boolean;
  error: string | null;
  error_type: string | null; // "not_installed", "not_logged_in", "unknown"
  auth_instructions: string | null; // Instructions for authenticating
}

export interface ProviderAvailabilityError {
  message: string;
  type: "not_installed" | "not_logged_in" | "unknown";
  authInstructions?: string;
}

interface UseAISessionOptions {
  onAIExit?: (messages: AIMessage[], sessionId: string) => void;
  onAIError?: (processId: string) => void;
  onSessionIdReceived?: (processId: string, sessionId: string) => void;
  folderPath?: string | null;
}

export function useAISession(options: UseAISessionOptions = {}) {
  const { onAIExit, onAIError, onSessionIdReceived, folderPath } = options;
  const store = useMessageStore();

  // Track process_id -> session info mapping
  const processesRef = useRef<Map<string, ProcessInfo>>(new Map());
  const onAIExitRef = useRef(onAIExit);
  const onAIErrorRef = useRef(onAIError);
  const onSessionIdReceivedRef = useRef(onSessionIdReceived);
  const folderPathRef = useRef(folderPath);

  // Keep folder path ref in sync
  useEffect(() => {
    folderPathRef.current = folderPath;
  }, [folderPath]);

  // Track message sequence numbers per session for DB persistence
  const sequenceCounters = useRef<Map<string, number>>(new Map());

  // Track provider availability errors
  const [aiError, setAIError] = useState<ProviderAvailabilityError | null>(null);

  // Keep the callback refs up to date
  useEffect(() => {
    onAIExitRef.current = onAIExit;
  }, [onAIExit]);

  useEffect(() => {
    onAIErrorRef.current = onAIError;
  }, [onAIError]);

  useEffect(() => {
    onSessionIdReceivedRef.current = onSessionIdReceived;
  }, [onSessionIdReceived]);

  // Check provider availability
  const checkProviderAvailable = useCallback(async (provider: Provider): Promise<ProviderStatus> => {
    return invoke<ProviderStatus>("check_provider_available", { provider });
  }, []);

  // Set up event listeners
  useEffect(() => {
    let unlisteners: UnlistenFn[] = [];
    let mounted = true;

    const setupListeners = async () => {
      const outputUnlisten = await listen<AIOutput>("ai-output", (event) => {
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
            const parsed = JSON.parse(trimmed) as AIMessage & { error?: string; is_error?: boolean; result?: string };

            // Detect errors from result messages
            if (parsed.type === "result" && parsed.is_error && parsed.error) {
              const errorLower = parsed.error.toLowerCase();

              // Detect payment/credits errors (Amp returns 402)
              if (parsed.error.includes("402") || errorLower.includes("paid credits") || errorLower.includes("add credits")) {
                setAIError({
                  message: "This provider requires paid credits. Please add credits to your account.",
                  type: "unknown",
                });
                onAIErrorRef.current?.(process_id);
                store.endProcess(process_id);
                processesRef.current.delete(process_id);
                return;
              }

              // Detect authentication errors
              if (errorLower.includes("authentication") ||
                  errorLower.includes("invalid api key") ||
                  errorLower.includes("unauthorized") ||
                  errorLower.includes("not logged in")) {
                setAIError({
                  message: "Provider is not logged in. Please run the CLI in your terminal to authenticate.",
                  type: "not_logged_in",
                });
                onAIErrorRef.current?.(process_id);
                store.endProcess(process_id);
                processesRef.current.delete(process_id);
                return;
              }
            }

            // Legacy error detection for older formats
            if (parsed.error === "authentication_failed" ||
                (parsed.is_error && parsed.result?.includes("Invalid API key"))) {
              setAIError({
                message: "Provider is not logged in. Please run the CLI in your terminal to authenticate.",
                type: "not_logged_in",
              });
              onAIErrorRef.current?.(process_id);
              store.endProcess(process_id);
              processesRef.current.delete(process_id);
              return;
            }

            // Extract session ID from init message
            if (parsed.type === "system" && parsed.subtype === "init" && parsed.session_id) {
              // Update session ID if we got it from init (for new sessions)
              if (processInfo.sessionId !== parsed.session_id) {
                processInfo.sessionId = parsed.session_id;
                store.setLiveSessionId(parsed.session_id, process_id);
                // Initialize sequence counter for this session
                // If there's an initial user message, start at 1 (user message gets sequence 1)
                const startSequence = processInfo.initialUserMessage ? 1 : 0;
                sequenceCounters.current.set(parsed.session_id, startSequence);

                // Create session in database immediately
                const folderPath = store.getProcessFolderPath(process_id);
                if (folderPath) {
                  invoke("db_create_session", {
                    sessionId: parsed.session_id,
                    folderPath,
                    provider: processInfo.provider,
                    sessionType: processInfo.sessionType,
                  }).then(() => {
                    // Save the initial user message to DB (for new sessions)
                    if (processInfo.initialUserMessage) {
                      invoke("db_save_message", {
                        sessionId: parsed.session_id,
                        messageJson: JSON.stringify({ type: "user", content: processInfo.initialUserMessage }),
                        sequence: 1,
                        messageType: "user",
                      }).catch(() => {
                        // Failed to save initial user message
                      });
                    }
                  }).catch(() => {
                    // Failed to create session in DB
                  });
                }

                // Notify listeners so they can persist the session ID immediately
                onSessionIdReceivedRef.current?.(process_id, parsed.session_id);
              }
            }

            // Skip user messages from the stream - we already add them ourselves in runAI()
            if (parsed.type === "user" && !parsed.parent_tool_use_id) {
              continue;
            }

            store.addMessage(parsed, process_id);

            // Persist message to database if we have a valid session ID
            const sessionId = processInfo.sessionId;
            if (sessionId && !sessionId.startsWith("__pending__")) {
              const seq = (sequenceCounters.current.get(sessionId) ?? 0) + 1;
              sequenceCounters.current.set(sessionId, seq);
              invoke("db_save_message", {
                sessionId,
                messageJson: JSON.stringify(parsed),
                sequence: seq,
                messageType: parsed.type,
              }).catch((err) => {
                console.error("Failed to save message to DB:", err);
              });
            }
          } catch {
            // Not valid JSON, ignore
          }
        }
      });

      const exitUnlisten = await listen<AIExit>("ai-exit", (event) => {
        if (!mounted) return;

        const { process_id } = event.payload;
        const processInfo = processesRef.current.get(process_id);
        if (!processInfo) return;

        // Call the exit callback with messages for this session
        // Use getRunningSessionMessages to get messages for the exited session, not the viewed session
        const messages = store.getRunningSessionMessages(processInfo.sessionId) || store.getViewedMessagesRef();
        if (processInfo.onExit) {
          processInfo.onExit(messages);
        } else if (onAIExitRef.current) {
          onAIExitRef.current(messages, processInfo.sessionId);
        }

        store.endProcess(process_id);
        processesRef.current.delete(process_id);
      });

      const errorUnlisten = await listen<AIError>("ai-error", (event) => {
        if (!mounted) return;

        const { process_id, error } = event.payload;

        // Detect spawn failures (provider not installed) - handle even if processInfo not yet set
        if (error.includes("Failed to spawn") || error.includes("No such file") || error.includes("not installed")) {
          setAIError({
            message: "AI provider is not installed. Please install it first.",
            type: "not_installed",
          });
          onAIErrorRef.current?.(process_id);
          store.endProcess(process_id);
          processesRef.current.delete(process_id);
          return;
        }

        const processInfo = processesRef.current.get(process_id);
        if (processInfo) {
          store.addMessage({ type: "system", content: `Error: ${error}` }, process_id);
          onAIErrorRef.current?.(process_id);
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

  const runAI = useCallback(
    async (
      message: string,
      folderPath: string,
      sessionId: string | null,
      provider: Provider,
      userMessageToShow?: string,
      sessionType: "plan" | "ralph_prd" = "plan",
      onExit?: (messages: AIMessage[]) => void
    ): Promise<string> => {
      // Check provider availability before starting
      const status = await invoke<ProviderStatus>("check_provider_available", { provider });
      if (!status.available) {
        setAIError({
          message: status.error || "AI provider is not available",
          type: (status.error_type as ProviderAvailabilityError["type"]) || "unknown",
          authInstructions: status.auth_instructions || undefined,
        });
        throw new Error(status.error || "Provider not available");
      }

      // Start the process and get process_id
      const processId = await invoke<string>("run_provider", {
        provider,
        message,
        folderPath,
        sessionId,
      });

      // Track this process
      // For new sessions (no sessionId), store the user message to persist to DB when session ID arrives
      processesRef.current.set(processId, {
        sessionId: sessionId || "__pending__",
        buffer: "",
        provider,
        sessionType,
        onExit,
        initialUserMessage: !sessionId ? userMessageToShow : undefined,
      });

      // Start live session in store
      store.startProcess(processId, folderPath, sessionId ?? undefined, provider);

      // Add the user message to display
      if (userMessageToShow) {
        store.addMessage({ type: "user", content: userMessageToShow }, processId);

        // If we have an existing session ID (resuming), save the user message to DB
        if (sessionId) {
          const seq = (sequenceCounters.current.get(sessionId) ?? 0) + 1;
          sequenceCounters.current.set(sessionId, seq);
          invoke("db_save_message", {
            sessionId,
            messageJson: JSON.stringify({ type: "user", content: userMessageToShow }),
            sequence: seq,
            messageType: "user",
          }).catch((err) => {
            console.error("Failed to save user message to DB:", err);
          });
        }
      }

      return processId;
    },
    [store]
  );

  const stopAI = useCallback(async (processId?: string) => {
    try {
      await invoke("stop_provider", { processId: processId || null });
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
      console.error("Failed to stop AI:", err);
    }
  }, [store]);

  const clearAIError = useCallback(() => {
    setAIError(null);
  }, []);

  return {
    runAI,
    stopAI,
    isSessionRunning: store.isSessionRunning,
    hasAnyRunning: store.hasAnyRunning,
    aiError,
    clearAIError,
    checkProviderAvailable,
  };
}
