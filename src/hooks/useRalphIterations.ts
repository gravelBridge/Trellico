import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AIMessage, RalphIteration } from "@/types";
import { getRalphPrompt } from "@/prompts";
import { useMessageStore } from "@/contexts";

interface UseRalphIterationsProps {
  folderPath: string | null;
  runAI: (message: string, folderPath: string, sessionId: string | null) => Promise<string>;
  onAutoSelectIteration?: () => void;
}

interface UseRalphIterationsReturn {
  iterations: Record<string, RalphIteration[]>;
  isRalphing: boolean;
  ralphingPrd: string | null;
  currentIteration: number | null;
  selectedIteration: { prd: string; iteration: number } | null;
  currentProcessId: string | null;
  startRalphing: (prdName: string) => Promise<void>;
  stopRalphing: () => void;
  selectIteration: (prdName: string, iterationNumber: number) => void;
  clearIterationSelection: () => void;
  handleAIExit: (messages: AIMessage[], sessionId: string) => void;
  handleSessionIdReceived: (processId: string, sessionId: string) => void;
}

// State machine for ralph execution status
type RalphStatus =
  | { status: "idle" }
  | { status: "running"; prdName: string; iterationNumber: number; processId: string };

function isComplete(messages: AIMessage[]): boolean {
  // Check last few assistant messages for the stop signal
  const assistantMessages = messages.filter((m) => m.type === "assistant");
  for (const msg of assistantMessages.slice(-3)) {
    // Check message.content (array of content items)
    if (msg.message?.content) {
      const content = msg.message.content;
      if (typeof content === "string") {
        if (content.includes("<promise>COMPLETE</promise>")) return true;
      } else if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === "text" && item.text?.includes("<promise>COMPLETE</promise>")) {
            return true;
          }
        }
      }
    }
    // Also check direct content field
    if (typeof msg.content === "string" && msg.content.includes("<promise>COMPLETE</promise>")) {
      return true;
    }
  }
  return false;
}

export function useRalphIterations({
  folderPath,
  runAI,
  onAutoSelectIteration,
}: UseRalphIterationsProps): UseRalphIterationsReturn {
  const store = useMessageStore();

  // Iterations loaded from backend (source of truth is the file)
  const [iterations, setIterations] = useState<Record<string, RalphIteration[]>>({});

  // State machine for ralph execution - replaces all the individual refs
  const [ralphState, setRalphState] = useState<RalphStatus>({ status: "idle" });

  // Selected iteration for viewing
  const [selectedIteration, setSelectedIteration] = useState<{
    prd: string;
    iteration: number;
  } | null>(null);

  // Track previous folder path to detect folder switches and clear state synchronously
  const [prevFolderPath, setPrevFolderPath] = useState<string | null>(folderPath);

  // Ref for the current ralph state - needed for async callbacks
  const ralphStateRef = useRef<RalphStatus>({ status: "idle" });

  // Ref for folder path - needed to detect folder switches in async callbacks
  const folderPathRef = useRef<string | null>(folderPath);

  // Clear state synchronously when folder changes (React pattern for adjusting state based on props)
  // Refs will be synced by existing useEffects
  if (folderPath !== prevFolderPath) {
    setPrevFolderPath(folderPath);
    setIterations({});
    setSelectedIteration(null);
    setRalphState({ status: "idle" });
  }

  // Keep refs in sync with state
  useEffect(() => {
    ralphStateRef.current = ralphState;
  }, [ralphState]);

  useEffect(() => {
    folderPathRef.current = folderPath;
  }, [folderPath]);

  // Derived values from state machine
  const isRalphing = ralphState.status === "running";
  const ralphingPrd = ralphState.status === "running" ? ralphState.prdName : null;
  const currentIteration = ralphState.status === "running" ? ralphState.iterationNumber : null;
  const currentProcessId = ralphState.status === "running" ? ralphState.processId : null;

  // Load all iterations from database
  const loadAllIterations = useCallback(async () => {
    if (!folderPath) return;
    try {
      const allIterations = await invoke<Record<string, RalphIteration[]>>(
        "db_get_all_ralph_iterations",
        { folderPath }
      );
      setIterations(allIterations);
    } catch (err) {
      console.error("Failed to load iterations:", err);
    }
  }, [folderPath]);

  // Load iterations from database when folder changes
  useEffect(() => {
    if (!folderPath) return;
    // Initial load (deferred to avoid synchronous setState in effect)
    queueMicrotask(() => loadAllIterations());
  }, [folderPath, loadAllIterations]);

  const createAndStartIteration = useCallback(
    async (prdName: string, iterationNumber: number): Promise<string | null> => {
      if (!folderPath) return null;

      // Save iteration to database
      await invoke("db_save_ralph_iteration", {
        folderPath,
        prdName,
        iterationNumber,
        status: "running",
      });

      // Update local state
      setIterations((prev) => ({
        ...prev,
        [prdName]: [
          ...(prev[prdName] || []),
          {
            iteration_number: iterationNumber,
            session_id: "",
            status: "running" as const,
            created_at: new Date().toISOString(),
            provider: null,
          },
        ],
      }));

      // Build the prd path and run Claude
      const prdPath = `.trellico/ralph/${prdName}/prd.json`;
      const prompt = getRalphPrompt(prdPath);

      const processId = await runAI(prompt, folderPath, null);
      return processId;
    },
    [folderPath, runAI]
  );

  const startRalphing = useCallback(
    async (prdName: string) => {
      if (!folderPath || ralphStateRef.current.status === "running") return;

      // Load existing iterations to determine next iteration number
      let prdIterations: RalphIteration[] = [];
      try {
        prdIterations = await invoke<RalphIteration[]>("db_get_ralph_iterations", {
          folderPath,
          prdName,
        });
      } catch (err) {
        console.error("Failed to load iterations:", err);
      }

      const nextIterationNumber = prdIterations.length + 1;

      // If resuming from a stopped iteration, mark it as completed first
      const lastIteration = prdIterations[prdIterations.length - 1];
      if (lastIteration?.status === "stopped") {
        await invoke("db_update_ralph_iteration_status", {
          folderPath,
          prdName,
          iterationNumber: lastIteration.iteration_number,
          status: "completed",
        });
      }

      // Clear selection before starting
      setSelectedIteration(null);

      // Create and start the iteration
      const processId = await createAndStartIteration(prdName, nextIterationNumber);
      if (!processId) return;

      // Update state machine - single state update
      setRalphState({
        status: "running",
        prdName,
        iterationNumber: nextIterationNumber,
        processId,
      });

      // Auto-select the new iteration
      setSelectedIteration({ prd: prdName, iteration: nextIterationNumber });
      onAutoSelectIteration?.();
    },
    [folderPath, createAndStartIteration, onAutoSelectIteration]
  );

  const stopRalphing = useCallback(async () => {
    const currentState = ralphStateRef.current;
    if (currentState.status !== "running") return;

    const { prdName, iterationNumber } = currentState;

    // Update state machine first
    setRalphState({ status: "idle" });

    if (!folderPath) return;

    // Update the current iteration status to "stopped" in database
    try {
      await invoke("db_update_ralph_iteration_status", {
        folderPath,
        prdName,
        iterationNumber,
        status: "stopped",
      });
      // Update local state
      setIterations((prev) => ({
        ...prev,
        [prdName]: (prev[prdName] || []).map((i) =>
          i.iteration_number === iterationNumber ? { ...i, status: "stopped" as const } : i
        ),
      }));
    } catch (err) {
      console.error("Failed to update iteration status:", err);
    }
  }, [folderPath]);

  const selectIteration = useCallback(
    async (prdName: string, iterationNumber: number) => {
      if (!folderPath) return;

      // Capture folder path to detect switches during async operations
      const capturedFolderPath = folderPath;

      setSelectedIteration({ prd: prdName, iteration: iterationNumber });

      // Fetch iteration directly from database
      let iteration: RalphIteration | undefined;
      try {
        const prdIterations = await invoke<RalphIteration[]>("db_get_ralph_iterations", {
          folderPath: capturedFolderPath,
          prdName,
        });
        iteration = prdIterations.find((i) => i.iteration_number === iterationNumber);
      } catch (err) {
        console.error("Failed to fetch iterations:", err);
        return;
      }

      // Abort if folder changed during async operation
      if (folderPathRef.current !== capturedFolderPath) return;

      if (!iteration) return;

      // Check if this is the currently running iteration
      const currentState = ralphStateRef.current;
      const isCurrentRunningIteration =
        currentState.status === "running" &&
        currentState.prdName === prdName &&
        currentState.iterationNumber === iterationNumber;

      if (isCurrentRunningIteration) {
        // Switch to viewing the live session
        const sessionId = store.getProcessSessionId(currentState.processId);
        if (sessionId) {
          // For live session, just switch to it (messages are already accumulating)
          store.viewSession(sessionId);
        }
      } else if (iteration.session_id) {
        // Load session history from database
        try {
          const history = await invoke<AIMessage[]>("db_get_session_messages", {
            sessionId: iteration.session_id,
          });

          // Abort if folder changed during async operation
          if (folderPathRef.current !== capturedFolderPath) return;
          // Skip the first user message (the hidden prompt)
          const filteredHistory =
            history.length > 0 && history[0].type === "user" ? history.slice(1) : history;
          store.viewSession(iteration.session_id, filteredHistory, iteration.provider ?? undefined);
        } catch (err) {
          console.error("Failed to load session history:", err);
        }
      }
    },
    [folderPath, store]
  );

  const clearIterationSelection = useCallback(() => {
    setSelectedIteration(null);
  }, []);

  // Handle session ID received - persist immediately so we don't lose it on crash
  const handleSessionIdReceived = useCallback(
    async (processId: string, sessionId: string) => {
      const currentState = ralphStateRef.current;
      // Only persist if this is the process we're tracking
      if (currentState.status !== "running" || currentState.processId !== processId) return;
      if (!folderPath) return;

      const { prdName, iterationNumber } = currentState;
      try {
        await invoke("db_update_ralph_iteration_session_id", {
          folderPath,
          prdName,
          iterationNumber,
          sessionId,
        });
        // Update local state
        setIterations((prev) => ({
          ...prev,
          [prdName]: (prev[prdName] || []).map((i): RalphIteration =>
            i.iteration_number === iterationNumber ? { ...i, session_id: sessionId } : i
          ),
        }));
      } catch (err) {
        console.error("Failed to persist session ID:", err);
      }
    },
    [folderPath]
  );

  // Handle AI exit - called from useAISession when ai-exit event fires
  const handleAIExit = useCallback(
    async (messages: AIMessage[], sessionId: string) => {
      // Read current state from ref (always up-to-date)
      const currentState = ralphStateRef.current;
      if (currentState.status !== "running") return;

      // Only handle exit for the current ralph iteration's process
      // Other Claude sessions (e.g., follow-ups in other iterations) should be ignored
      const ralphSessionId = store.getProcessSessionId(currentState.processId);
      if (sessionId !== ralphSessionId) return;

      const { prdName, iterationNumber } = currentState;

      if (!folderPath) return;

      try {
        // Persist the session ID to the database
        if (sessionId) {
          await invoke("db_update_ralph_iteration_session_id", {
            folderPath,
            prdName,
            iterationNumber,
            sessionId,
          });
        }

        // Check if complete
        if (isComplete(messages)) {
          // Mark iteration as completed and stop ralphing
          await invoke("db_update_ralph_iteration_status", {
            folderPath,
            prdName,
            iterationNumber,
            status: "completed",
          });

          // Update local state
          setIterations((prev) => ({
            ...prev,
            [prdName]: (prev[prdName] || []).map((i): RalphIteration =>
              i.iteration_number === iterationNumber
                ? { ...i, status: "completed", session_id: sessionId }
                : i
            ),
          }));

          // Update state machine to idle
          setRalphState({ status: "idle" });
        } else {
          // Mark current iteration as completed (it finished without COMPLETE signal)
          await invoke("db_update_ralph_iteration_status", {
            folderPath,
            prdName,
            iterationNumber,
            status: "completed",
          });

          // Start next iteration
          const nextIterationNumber = iterationNumber + 1;

          await invoke("db_save_ralph_iteration", {
            folderPath,
            prdName,
            iterationNumber: nextIterationNumber,
            status: "running",
          });

          // Update local state
          setIterations((prev) => ({
            ...prev,
            [prdName]: [
              ...(prev[prdName] || []).map((i) =>
                i.iteration_number === iterationNumber
                  ? { ...i, status: "completed" as const, session_id: sessionId }
                  : i
              ),
              {
                iteration_number: nextIterationNumber,
                session_id: "",
                status: "running" as const,
                created_at: new Date().toISOString(),
                provider: null,
              },
            ],
          }));

          // Run Claude with new session
          const prdPath = `.trellico/ralph/${prdName}/prd.json`;
          const prompt = getRalphPrompt(prdPath);
          const processId = await runAI(prompt, folderPath, null);

          // Update state machine with new iteration
          setRalphState({
            status: "running",
            prdName,
            iterationNumber: nextIterationNumber,
            processId,
          });

          // Auto-select the new iteration
          setSelectedIteration({ prd: prdName, iteration: nextIterationNumber });
          onAutoSelectIteration?.();
        }
      } catch (err) {
        console.error("Failed to handle AI exit:", err);
        // On error, reset to idle state
        setRalphState({ status: "idle" });
      }
    },
    [folderPath, runAI, onAutoSelectIteration, store]
  );

  return {
    iterations,
    isRalphing,
    ralphingPrd,
    currentIteration,
    selectedIteration,
    currentProcessId,
    startRalphing,
    stopRalphing,
    selectIteration,
    clearIterationSelection,
    handleAIExit,
    handleSessionIdReceived,
  };
}
