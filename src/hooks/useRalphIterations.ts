import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { ClaudeMessage, RalphIteration } from "@/types";
import { getRalphPrompt } from "@/prompts";
import { useMessageStore } from "@/contexts";

interface UseRalphIterationsProps {
  folderPath: string | null;
  runClaude: (message: string, folderPath: string, sessionId: string | null) => Promise<string>;
}

interface UseRalphIterationsReturn {
  iterations: Record<string, RalphIteration[]>;
  isRalphing: boolean;
  ralphingPrd: string | null;
  currentIteration: number | null;
  selectedIteration: { prd: string; iteration: number } | null;
  startRalphing: (prdName: string) => Promise<void>;
  stopRalphing: () => void;
  selectIteration: (prdName: string, iterationNumber: number) => void;
  clearIterationSelection: () => void;
  handleClaudeExit: (messages: ClaudeMessage[], sessionId: string) => void;
}

function isComplete(messages: ClaudeMessage[]): boolean {
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
  runClaude,
}: UseRalphIterationsProps): UseRalphIterationsReturn {
  const store = useMessageStore();
  const [iterations, setIterations] = useState<Record<string, RalphIteration[]>>({});
  const [isRalphing, setIsRalphing] = useState(false);
  const [ralphingPrd, setRalphingPrd] = useState<string | null>(null);
  const [currentIteration, setCurrentIteration] = useState<number | null>(null);
  const [selectedIteration, setSelectedIteration] = useState<{
    prd: string;
    iteration: number;
  } | null>(null);

  // Use refs to track state for the exit callback - these are updated synchronously
  const isRalphingRef = useRef(false);
  const ralphingPrdRef = useRef<string | null>(null);
  const currentIterationRef = useRef<number | null>(null);
  const folderPathRef = useRef<string | null>(null);
  const currentProcessIdRef = useRef<string | null>(null);
  // Guard to prevent starting a new iteration while one is being processed
  const processingExitRef = useRef(false);
  // Debounce ref for file change events
  const reloadDebounceRef = useRef<number | null>(null);

  // Keep folder ref in sync
  useEffect(() => {
    folderPathRef.current = folderPath;
  }, [folderPath]);

  // Load all iterations from file
  const loadAllIterations = useCallback(async () => {
    if (!folderPath) return;
    try {
      const allIterations = await invoke<Record<string, RalphIteration[]>>(
        "get_all_ralph_iterations",
        { folderPath }
      );
      setIterations(allIterations);
    } catch (err) {
      console.error("Failed to load iterations:", err);
    }
  }, [folderPath]);

  // Watch the iterations file and reload when it changes
  useEffect(() => {
    if (!folderPath) return;

    // Initial load - deferred to microtask to avoid synchronous setState in effect
    queueMicrotask(() => {
      loadAllIterations();
    });

    // Start watching the iterations file
    invoke("watch_ralph_iterations", { folderPath }).catch((err) => {
      console.error("Failed to start watching ralph iterations:", err);
    });

    // Listen for iterations file changes
    let unlisten: UnlistenFn | null = null;
    listen("ralph-iterations-changed", () => {
      // Debounce the reload
      if (reloadDebounceRef.current) {
        clearTimeout(reloadDebounceRef.current);
      }
      reloadDebounceRef.current = window.setTimeout(() => {
        loadAllIterations();
      }, 100);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
      if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
    };
  }, [folderPath, loadAllIterations]);

  const createAndStartIteration = useCallback(
    async (prdName: string, iterationNumber: number) => {
      if (!folderPath) return;

      const now = new Date().toISOString();
      const newIteration: RalphIteration = {
        iteration_number: iterationNumber,
        session_id: "", // Will be set once we get the session ID from Claude
        status: "running",
        created_at: now,
      };

      // Save iteration to backend
      await invoke("save_ralph_iteration", {
        folderPath,
        prdName,
        iteration: newIteration,
      });

      // Update local state
      setIterations((prev) => ({
        ...prev,
        [prdName]: [...(prev[prdName] || []), newIteration],
      }));

      setCurrentIteration(iterationNumber);

      // Build the prd path and run Claude (this will start a new live session in the store)
      const prdPath = `.trellico/ralph/${prdName}/prd.json`;
      const prompt = getRalphPrompt(prdPath);

      const processId = await runClaude(prompt, folderPath, null);
      currentProcessIdRef.current = processId;
    },
    [folderPath, runClaude]
  );

  const startRalphing = useCallback(
    async (prdName: string) => {
      if (!folderPath || isRalphingRef.current) return;

      // Update refs synchronously before any async operations
      isRalphingRef.current = true;
      ralphingPrdRef.current = prdName;

      setIsRalphing(true);
      setRalphingPrd(prdName);
      setSelectedIteration(null);

      // Load existing iterations to determine next iteration number
      let prdIterations: RalphIteration[] = [];
      try {
        prdIterations = await invoke<RalphIteration[]>("get_ralph_iterations", {
          folderPath,
          prdName,
        });
        setIterations((prev) => ({ ...prev, [prdName]: prdIterations }));
      } catch (err) {
        console.error("Failed to load iterations:", err);
      }

      const nextIterationNumber = prdIterations.length + 1;
      currentIterationRef.current = nextIterationNumber;
      // Auto-select the new iteration
      setSelectedIteration({ prd: prdName, iteration: nextIterationNumber });
      await createAndStartIteration(prdName, nextIterationNumber);
    },
    [folderPath, createAndStartIteration]
  );

  const stopRalphing = useCallback(async () => {
    const prd = ralphingPrdRef.current;
    const iterNum = currentIterationRef.current;

    // Update refs synchronously first
    isRalphingRef.current = false;
    ralphingPrdRef.current = null;
    currentIterationRef.current = null;
    currentProcessIdRef.current = null;

    setIsRalphing(false);
    setRalphingPrd(null);
    setCurrentIteration(null);

    if (!folderPath || !prd || iterNum === null) {
      return;
    }

    // Update the current iteration status to "stopped"
    try {
      await invoke("update_ralph_iteration_status", {
        folderPath,
        prdName: prd,
        iterationNumber: iterNum,
        status: "stopped",
      });

      // Update local state
      setIterations((prev) => ({
        ...prev,
        [prd]: (prev[prd] || []).map((iter) =>
          iter.iteration_number === iterNum ? { ...iter, status: "stopped" } : iter
        ),
      }));
    } catch (err) {
      console.error("Failed to update iteration status:", err);
    }
  }, [folderPath]);

  const selectIteration = useCallback(
    async (prdName: string, iterationNumber: number) => {
      if (!folderPath) return;

      setSelectedIteration({ prd: prdName, iteration: iterationNumber });

      // Find the iteration
      const prdIterations = iterations[prdName] || [];
      const iteration = prdIterations.find((i) => i.iteration_number === iterationNumber);

      if (!iteration) return;

      // Check if this is the currently running iteration
      const isCurrentRunningIteration =
        isRalphingRef.current &&
        ralphingPrdRef.current === prdName &&
        currentIterationRef.current === iterationNumber;

      if (isCurrentRunningIteration) {
        // Switch to viewing the live session (session_id may not be persisted yet)
        // Look up the session from the current process
        const processId = currentProcessIdRef.current;
        if (processId) {
          const sessionId = store.getProcessSessionId(processId);
          if (sessionId) {
            store.viewSession(sessionId);
          }
        }
      } else if (iteration.session_id) {
        // Load historical session
        try {
          const history = await invoke<ClaudeMessage[]>("load_session_history", {
            folderPath,
            sessionId: iteration.session_id,
          });
          // Skip the first user message (the hidden prompt)
          const filteredHistory =
            history.length > 0 && history[0].type === "user" ? history.slice(1) : history;
          store.viewSession(iteration.session_id, filteredHistory);
        } catch (err) {
          console.error("Failed to load session history:", err);
        }
      }
    },
    [folderPath, iterations, store]
  );

  const clearIterationSelection = useCallback(() => {
    setSelectedIteration(null);
  }, []);

  // Handle Claude exit - this is called from useClaudeSession when claude-exit event fires
  const handleClaudeExit = useCallback(
    async (messages: ClaudeMessage[], sessionId: string) => {
      // Use refs for current state since this is called from an event listener
      if (!isRalphingRef.current || !ralphingPrdRef.current || !folderPathRef.current) {
        return;
      }

      // Prevent concurrent processing
      if (processingExitRef.current) {
        return;
      }
      processingExitRef.current = true;

      const prdName = ralphingPrdRef.current;
      const iterNum = currentIterationRef.current;
      const folder = folderPathRef.current;

      // Use the session ID passed from the callback
      const newSessionId = sessionId;

      if (newSessionId && iterNum !== null) {
        // Persist the session ID to the backend
        try {
          await invoke("update_ralph_iteration_session_id", {
            folderPath: folder,
            prdName,
            iterationNumber: iterNum,
            sessionId: newSessionId,
          });
        } catch (err) {
          console.error("Failed to update iteration session ID:", err);
        }

        // Update local state as well
        setIterations((prev) => ({
          ...prev,
          [prdName]: (prev[prdName] || []).map((iter) =>
            iter.iteration_number === iterNum ? { ...iter, session_id: newSessionId } : iter
          ),
        }));
      }

      // Check if complete
      if (isComplete(messages)) {
        // Mark iteration as completed and stop ralphing
        // Update refs synchronously first
        isRalphingRef.current = false;
        ralphingPrdRef.current = null;
        currentIterationRef.current = null;
        currentProcessIdRef.current = null;

        try {
          await invoke("update_ralph_iteration_status", {
            folderPath: folder,
            prdName,
            iterationNumber: iterNum,
            status: "completed",
          });

          setIterations((prev) => ({
            ...prev,
            [prdName]: (prev[prdName] || []).map((iter) =>
              iter.iteration_number === iterNum ? { ...iter, status: "completed" } : iter
            ),
          }));
        } catch (err) {
          console.error("Failed to update iteration status:", err);
        }

        setIsRalphing(false);
        setRalphingPrd(null);
        setCurrentIteration(null);
        processingExitRef.current = false;
      } else {
        // Mark current iteration as completed (it finished without COMPLETE signal)
        try {
          await invoke("update_ralph_iteration_status", {
            folderPath: folder,
            prdName,
            iterationNumber: iterNum,
            status: "completed",
          });

          setIterations((prev) => ({
            ...prev,
            [prdName]: (prev[prdName] || []).map((iter) =>
              iter.iteration_number === iterNum ? { ...iter, status: "completed" } : iter
            ),
          }));
        } catch (err) {
          console.error("Failed to update iteration status:", err);
        }

        // Start next iteration - update ref synchronously first
        const nextIterationNumber = (iterNum || 0) + 1;
        currentIterationRef.current = nextIterationNumber;

        try {
          // Create new iteration
          const now = new Date().toISOString();
          const newIteration: RalphIteration = {
            iteration_number: nextIterationNumber,
            session_id: "",
            status: "running",
            created_at: now,
          };

          await invoke("save_ralph_iteration", {
            folderPath: folder,
            prdName,
            iteration: newIteration,
          });

          setIterations((prev) => ({
            ...prev,
            [prdName]: [...(prev[prdName] || []), newIteration],
          }));

          setCurrentIteration(nextIterationNumber);
          // Auto-select the new iteration
          setSelectedIteration({ prd: prdName, iteration: nextIterationNumber });

          // Allow processing again before running Claude
          processingExitRef.current = false;

          // Run Claude with new session (this will start a new live session in the store)
          const prdPath = `.trellico/ralph/${prdName}/prd.json`;
          const prompt = getRalphPrompt(prdPath);
          const processId = await runClaude(prompt, folder, null);
          currentProcessIdRef.current = processId;
        } catch (err) {
          console.error("Failed to start next iteration:", err);
          isRalphingRef.current = false;
          ralphingPrdRef.current = null;
          currentIterationRef.current = null;
          currentProcessIdRef.current = null;
          setIsRalphing(false);
          setRalphingPrd(null);
          setCurrentIteration(null);
          processingExitRef.current = false;
        }
      }
    },
    [runClaude]
  );

  return {
    iterations,
    isRalphing,
    ralphingPrd,
    currentIteration,
    selectedIteration,
    startRalphing,
    stopRalphing,
    selectIteration,
    clearIterationSelection,
    handleClaudeExit,
  };
}
