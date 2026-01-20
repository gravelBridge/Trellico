import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { ClaudeMessage, SessionPlanLink } from "@/types";

interface UsePlansOptions {
  folderPath: string | null;
  isRunning: boolean;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  setMessages: (messages: ClaudeMessage[] | ((prev: ClaudeMessage[]) => ClaudeMessage[])) => void;
}

export function usePlans({
  folderPath,
  isRunning,
  sessionId,
  setSessionId,
  setMessages,
}: UsePlansOptions) {
  const [plans, setPlans] = useState<string[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [linkedSessionId, setLinkedSessionId] = useState<string | null>(null);

  const selectedPlanRef = useRef<string | null>(null);
  const prevPlansRef = useRef<string[]>([]);
  const plansDebounceRef = useRef<number | null>(null);
  const isRunningRef = useRef(isRunning);
  const sessionIdRef = useRef(sessionId);

  // Keep refs in sync with state
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    selectedPlanRef.current = selectedPlan;
  }, [selectedPlan]);

  // Define selectPlan first since handlePlansChange depends on it
  const selectPlan = useCallback(
    async (planName: string, autoLoadHistory = true) => {
      if (!folderPath) return;

      setSelectedPlan(planName);
      selectedPlanRef.current = planName;

      try {
        const content = await invoke<string>("read_plan", { folderPath, planName });
        setPlanContent(content);
      } catch (err) {
        console.error("Failed to read plan:", err);
        setPlanContent(null);
      }

      // Check for linked session
      if (autoLoadHistory) {
        try {
          const link = await invoke<SessionPlanLink | null>("get_link_by_plan", {
            folderPath,
            planFileName: planName,
          });

          if (link) {
            setLinkedSessionId(link.session_id);
            setSessionId(link.session_id);

            // Load chat history
            try {
              const history = await invoke<ClaudeMessage[]>("load_session_history", {
                folderPath,
                sessionId: link.session_id,
              });
              setMessages(history);
            } catch (historyErr) {
              console.error("Failed to load session history:", historyErr);
              setMessages([]);
            }
          } else {
            setLinkedSessionId(null);
            // Don't clear session if we're in the middle of creating a plan
            if (!isRunningRef.current) {
              setSessionId(null);
              setMessages([]);
            }
          }
        } catch (err) {
          console.error("Failed to get plan link:", err);
          setLinkedSessionId(null);
        }
      }
    },
    [folderPath, setSessionId, setMessages]
  );

  // Define reloadSelectedPlan before handlePlansChange
  const reloadSelectedPlan = useCallback(async () => {
    const planName = selectedPlanRef.current;
    if (!folderPath || !planName) return;
    try {
      const content = await invoke<string>("read_plan", { folderPath, planName });
      setPlanContent(content);
    } catch (err) {
      console.warn("Failed to reload plan (keeping current content):", err);
    }
  }, [folderPath]);

  // Handle plans list changes - detect renames, additions, removals
  const handlePlansChange = useCallback(
    async (isInitialLoad: boolean) => {
      if (!folderPath) return;

      try {
        const newPlans = await invoke<string[]>("list_plans", { folderPath });
        const oldPlans = prevPlansRef.current;
        const selected = selectedPlanRef.current;

        // Find what changed
        const added = newPlans.filter((p) => !oldPlans.includes(p));
        const removed = oldPlans.filter((p) => !newPlans.includes(p));

        // Update plans list
        setPlans(newPlans);
        prevPlansRef.current = newPlans;

        // Skip selection logic on initial load
        if (isInitialLoad) return;

        // Detect rename: exactly one added and one removed, and the removed one was selected
        if (added.length === 1 && removed.length === 1 && selected === removed[0]) {
          const oldName = removed[0];
          const newName = added[0];

          // Update selection to new name (keep existing content - it's the same)
          selectedPlanRef.current = newName;
          setSelectedPlan(newName);

          // Update the session link
          invoke("update_plan_link_filename", {
            folderPath,
            oldName,
            newName,
          }).catch((err) => {
            console.error("Failed to update plan link filename:", err);
          });

          return;
        }

        // Detect new plan created (while Claude is running = auto-select)
        if (added.length === 1 && removed.length === 0) {
          // Check if we should auto-select (only when Claude is actively creating a plan)
          if (isRunningRef.current) {
            const newPlan = added[0];
            selectPlan(newPlan, false);

            // Link to current session
            const currentSessionId = sessionIdRef.current;
            if (currentSessionId) {
              invoke("save_session_link", {
                folderPath,
                sessionId: currentSessionId,
                planFileName: newPlan,
              })
                .then(() => {
                  setLinkedSessionId(currentSessionId);
                })
                .catch((err) => {
                  console.error("Failed to save session link:", err);
                });
            }
          }
          return;
        }

        // Detect removal: if selected plan was removed, clear selection
        if (selected && removed.includes(selected) && !added.includes(selected)) {
          selectedPlanRef.current = null;
          setSelectedPlan(null);
          setPlanContent(null);
          return;
        }

        // Detect modification: if selected plan still exists, reload its content
        if (selected && newPlans.includes(selected) && added.length === 0 && removed.length === 0) {
          reloadSelectedPlan();
        }
      } catch (err) {
        console.error("Failed to load plans:", err);
      }
    },
    [folderPath, selectPlan, reloadSelectedPlan]
  );

  const clearSelection = useCallback(() => {
    setSelectedPlan(null);
    setPlanContent(null);
    setLinkedSessionId(null);
    selectedPlanRef.current = null;
  }, []);

  // Watch for plan changes
  useEffect(() => {
    if (!folderPath) return;

    // Initial load - deferred to microtask to avoid synchronous setState in effect
    queueMicrotask(() => {
      handlePlansChange(true);
    });

    // Start watching for file changes
    invoke("watch_plans", { folderPath }).catch((err) => {
      console.error("Failed to start watching plans:", err);
    });

    // Single listener for all plan changes - debounced to let filesystem settle
    let unlisten: UnlistenFn | null = null;
    listen("plans-changed", () => {
      // Debounce: wait for filesystem events to settle
      if (plansDebounceRef.current) {
        clearTimeout(plansDebounceRef.current);
      }
      plansDebounceRef.current = window.setTimeout(() => {
        handlePlansChange(false);
      }, 100);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
      if (plansDebounceRef.current) clearTimeout(plansDebounceRef.current);
    };
  }, [folderPath, handlePlansChange]);

  return {
    plans,
    selectedPlan,
    planContent,
    linkedSessionId,
    setLinkedSessionId,
    selectPlan,
    clearSelection,
  };
}
