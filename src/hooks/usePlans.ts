import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { ClaudeMessage, SessionPlanLink } from "@/types";
import { useMessageStore } from "@/contexts";

interface UsePlansOptions {
  folderPath: string | null;
  onPlanCreated?: () => void;
}

export function usePlans({ folderPath, onPlanCreated }: UsePlansOptions) {
  const store = useMessageStore();
  // Extract stable refs that don't change on every state update
  const { hasAnyRunning, getStateRef, viewSession } = store;

  const [plans, setPlans] = useState<string[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const [linkedSessionId, setLinkedSessionId] = useState<string | null>(null);
  const [pendingLinkPlan, setPendingLinkPlan] = useState<string | null>(null);

  // Track previous folder path to detect folder switches and clear state synchronously
  const [prevFolderPath, setPrevFolderPath] = useState<string | null>(folderPath);

  const selectedPlanRef = useRef<string | null>(null);
  const prevPlansRef = useRef<string[]>([]);
  const plansDebounceRef = useRef<number | null>(null);
  const selectPlanRef = useRef<((planName: string, autoLoadHistory?: boolean) => Promise<void>) | null>(null);
  const pendingLinkPlanRef = useRef<string | null>(null);
  const folderPathRef = useRef<string | null>(null);

  // Clear state synchronously when folder changes (React pattern for adjusting state based on props)
  // Refs will be synced by existing useEffects
  if (folderPath !== prevFolderPath) {
    setPrevFolderPath(folderPath);
    setPlans([]);
    setSelectedPlan(null);
    setPlanContent(null);
    setLinkedSessionId(null);
    setPendingLinkPlan(null);
  }

  // Keep refs in sync
  useEffect(() => {
    selectedPlanRef.current = selectedPlan;
  }, [selectedPlan]);

  useEffect(() => {
    pendingLinkPlanRef.current = pendingLinkPlan;
  }, [pendingLinkPlan]);

  useEffect(() => {
    folderPathRef.current = folderPath;
  }, [folderPath]);

  // Define selectPlan first since handlePlansChange depends on it
  const selectPlan = useCallback(
    async (planName: string, autoLoadHistory = true) => {
      if (!folderPath) return;

      // Load content first before updating state to avoid intermediate render
      // where selectedPlan is set but planContent is null (causes scroll reset)
      let content: string | null = null;
      try {
        content = await invoke<string>("read_plan", { folderPath, planName });
      } catch (err) {
        console.error("Failed to read plan:", err);
      }

      // Set both states together to avoid view flickering
      setSelectedPlan(planName);
      selectedPlanRef.current = planName;
      setPlanContent(content);

      // Check for linked session
      if (autoLoadHistory) {
        try {
          const link = await invoke<SessionPlanLink | null>("get_link_by_plan", {
            folderPath,
            planFileName: planName,
          });

          if (link) {
            setLinkedSessionId(link.session_id);

            // Load chat history and view it
            try {
              const history = await invoke<ClaudeMessage[]>("load_session_history", {
                folderPath,
                sessionId: link.session_id,
              });
              store.viewSession(link.session_id, history);
            } catch (historyErr) {
              console.error("Failed to load session history:", historyErr);
              store.viewSession(null);
            }
          } else {
            setLinkedSessionId(null);
            // Don't clear session if we're in the middle of creating a plan
            if (!hasAnyRunning()) {
              viewSession(null);
            }
          }
        } catch (err) {
          console.error("Failed to get plan link:", err);
          setLinkedSessionId(null);
        }
      }
    },
    [folderPath, store, hasAnyRunning, viewSession]
  );

  // Keep selectPlanRef in sync (needed for file watcher callback stability)
  useEffect(() => {
    selectPlanRef.current = selectPlan;
  }, [selectPlan]);

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
          // Use synchronous getter - always returns current value
          if (hasAnyRunning()) {
            const newPlan = added[0];
            selectPlanRef.current?.(newPlan, false);

            // Notify that a plan was created (removes loading indicator)
            onPlanCreated?.();

            // Link to current session using the currently viewed session
            const viewedSessionId = getStateRef().activeSessionId;
            if (viewedSessionId && !viewedSessionId.startsWith("__pending__")) {
              // Session ID is already available, save link immediately
              invoke("save_session_link", {
                folderPath,
                sessionId: viewedSessionId,
                planFileName: newPlan,
              })
                .then(() => {
                  setLinkedSessionId(viewedSessionId);
                })
                .catch((err) => {
                  console.error("Failed to save session link:", err);
                });
            } else {
              // Session ID is still pending, store the plan name for linking later
              setPendingLinkPlan(newPlan);
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
    [folderPath, reloadSelectedPlan, hasAnyRunning, getStateRef, onPlanCreated]
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

    // Initial load (deferred to avoid synchronous setState in effect)
    queueMicrotask(() => handlePlansChange(true));

    // Start watching for file changes
    invoke("watch_plans", { folderPath }).catch((err) => {
      console.error("Failed to start watching plans:", err);
    });

    // Single listener for all plan changes - debounced to let filesystem settle
    let unlisten: UnlistenFn | null = null;
    listen<{ folder_path: string }>("plans-changed", (event) => {
      // Only process events for the current folder
      if (event.payload.folder_path !== folderPath) return;

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

  // Handle session ID received - persist link immediately so we don't lose it
  const handleSessionIdReceived = useCallback(
    async (_processId: string, sessionId: string) => {
      const pending = pendingLinkPlanRef.current;
      const folder = folderPathRef.current;
      if (!pending || !folder) return;

      try {
        await invoke("save_session_link", {
          folderPath: folder,
          sessionId,
          planFileName: pending,
        });
        setLinkedSessionId(sessionId);
        setPendingLinkPlan(null);
      } catch (err) {
        console.error("Failed to save session link:", err);
      }
    },
    []
  );

  return {
    plans,
    selectedPlan,
    planContent,
    linkedSessionId,
    setLinkedSessionId,
    selectPlan,
    clearSelection,
    handleSessionIdReceived,
  };
}
