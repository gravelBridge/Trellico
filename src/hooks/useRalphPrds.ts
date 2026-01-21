import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { ClaudeMessage, SessionPlanLink } from "@/types";
import { useMessageStore } from "@/contexts";

interface UseRalphPrdsOptions {
  folderPath: string | null;
  onAutoSelectPrd?: (prdName: string) => void;
  onPrdCreated?: () => void;
  getSessionIdForPrd?: (prdName: string) => string | null;
}

export function useRalphPrds({ folderPath, onAutoSelectPrd, onPrdCreated, getSessionIdForPrd }: UseRalphPrdsOptions) {
  const store = useMessageStore();
  // Extract stable refs that don't change on every state update
  const { hasAnyRunning, viewSession } = store;

  const [ralphPrds, setRalphPrds] = useState<string[]>([]);
  const [selectedRalphPrd, setSelectedRalphPrd] = useState<string | null>(null);
  const [ralphPrdContent, setRalphPrdContent] = useState<string | null>(null);
  const [ralphLinkedSessionId, setRalphLinkedSessionId] = useState<string | null>(null);
  const [pendingLinkPrd, setPendingLinkPrd] = useState<string | null>(null);

  // Track previous folder path to detect folder switches and clear state synchronously
  const [prevFolderPath, setPrevFolderPath] = useState<string | null>(folderPath);

  const prevRalphPrdsRef = useRef<string[]>([]);
  const ralphPrdsDebounceRef = useRef<number | null>(null);
  const selectedRalphPrdRef = useRef<string | null>(null);
  const selectRalphPrdRef = useRef<((prdName: string, autoLoadHistory?: boolean) => Promise<void>) | null>(null);

  // Clear state synchronously when folder changes (React pattern for adjusting state based on props)
  // Refs will be synced by existing useEffects
  if (folderPath !== prevFolderPath) {
    setPrevFolderPath(folderPath);
    setRalphPrds([]);
    setSelectedRalphPrd(null);
    setRalphPrdContent(null);
    setRalphLinkedSessionId(null);
    setPendingLinkPrd(null);
  }

  // Keep refs in sync
  useEffect(() => {
    selectedRalphPrdRef.current = selectedRalphPrd;
  }, [selectedRalphPrd]);

  // Handle pending link when session ID becomes available
  useEffect(() => {
    if (!pendingLinkPrd || !folderPath) return;

    const sessionId = getSessionIdForPrd?.(pendingLinkPrd);
    if (sessionId && !sessionId.startsWith("__pending__")) {
      invoke("save_ralph_link", {
        folderPath,
        sessionId,
        prdFileName: pendingLinkPrd,
      })
        .then(() => {
          setRalphLinkedSessionId(sessionId);
          setPendingLinkPrd(null);
        })
        .catch((err) => {
          console.error("Failed to save ralph link:", err);
          setPendingLinkPrd(null);
        });
    }
  }, [pendingLinkPrd, folderPath, getSessionIdForPrd]);

  // Define selectRalphPrd first since handleRalphPrdsChange depends on it
  const selectRalphPrd = useCallback(
    async (prdName: string, autoLoadHistory = true) => {
      if (!folderPath) return;

      selectedRalphPrdRef.current = prdName;
      setSelectedRalphPrd(prdName);

      try {
        const content = await invoke<string>("read_ralph_prd", { folderPath, prdName });
        setRalphPrdContent(content);
      } catch (err) {
        console.error("Failed to read ralph prd:", err);
        setRalphPrdContent(null);
      }

      if (autoLoadHistory) {
        try {
          const link = await invoke<SessionPlanLink | null>("get_link_by_ralph_prd", {
            folderPath,
            prdFileName: prdName,
          });
          if (link) {
            setRalphLinkedSessionId(link.session_id);
            const history = await invoke<ClaudeMessage[]>("load_session_history", {
              folderPath,
              sessionId: link.session_id,
            });
            // Skip the first user message (the hidden prompt)
            const filteredHistory =
              history.length > 0 && history[0].type === "user" ? history.slice(1) : history;
            viewSession(link.session_id, filteredHistory);
          } else {
            setRalphLinkedSessionId(null);
            if (!hasAnyRunning()) {
              viewSession(null);
            }
          }
        } catch (err) {
          console.error("Failed to get ralph link:", err);
        }
      }
    },
    [folderPath, hasAnyRunning, viewSession]
  );

  // Keep selectRalphPrdRef in sync (needed for file watcher callback stability)
  useEffect(() => {
    selectRalphPrdRef.current = selectRalphPrd;
  }, [selectRalphPrd]);

  // Handle ralph PRDs list changes
  const handleRalphPrdsChange = useCallback(
    async (isInitialLoad: boolean) => {
      if (!folderPath) return;
      try {
        const newPrds = await invoke<string[]>("list_ralph_prds", { folderPath });
        const oldPrds = prevRalphPrdsRef.current;

        const added = newPrds.filter((p) => !oldPrds.includes(p));
        const removed = oldPrds.filter((p) => !newPrds.includes(p));

        setRalphPrds(newPrds);
        prevRalphPrdsRef.current = newPrds;

        if (isInitialLoad) return;

        // Auto-select newly created PRD if Claude is running (creating it)
        if (added.length === 1 && removed.length === 0 && hasAnyRunning()) {
          selectRalphPrdRef.current?.(added[0], false);
          onAutoSelectPrd?.(added[0]);
          // Notify that a PRD was created (removes loading indicator)
          onPrdCreated?.();
          // Link session to this PRD - use the callback to get the correct session ID
          const sessionId = getSessionIdForPrd?.(added[0]);
          if (sessionId && !sessionId.startsWith("__pending__")) {
            // Session ID is already available, save link immediately
            invoke("save_ralph_link", {
              folderPath,
              sessionId,
              prdFileName: added[0],
            })
              .then(() => {
                setRalphLinkedSessionId(sessionId);
              })
              .catch(console.error);
          } else {
            // Session ID is still pending, store the PRD name for linking later
            setPendingLinkPrd(added[0]);
          }
        }

        // If selected was removed, clear selection
        if (selectedRalphPrdRef.current && removed.includes(selectedRalphPrdRef.current)) {
          setSelectedRalphPrd(null);
          setRalphPrdContent(null);
          selectedRalphPrdRef.current = null;
        }
      } catch (err) {
        console.error("Failed to load ralph prds:", err);
      }
    },
    [folderPath, hasAnyRunning, onAutoSelectPrd, onPrdCreated, getSessionIdForPrd]
  );

  const clearSelection = useCallback(() => {
    setSelectedRalphPrd(null);
    setRalphPrdContent(null);
    setRalphLinkedSessionId(null);
    selectedRalphPrdRef.current = null;
  }, []);

  // Reload the content of the currently selected PRD
  const reloadSelectedPrdContent = useCallback(async () => {
    const prdName = selectedRalphPrdRef.current;
    if (!folderPath || !prdName) return;

    try {
      const content = await invoke<string>("read_ralph_prd", { folderPath, prdName });
      setRalphPrdContent(content);
    } catch (err) {
      console.error("Failed to reload ralph prd content:", err);
    }
  }, [folderPath]);

  // Debounce ref for content reload
  const contentReloadDebounceRef = useRef<number | null>(null);

  // Watch for ralph PRD changes
  useEffect(() => {
    if (!folderPath) return;

    // Initial load (deferred to avoid synchronous setState in effect)
    queueMicrotask(() => handleRalphPrdsChange(true));

    // Start watching for file changes
    invoke("watch_ralph_prds", { folderPath }).catch((err) => {
      console.error("Failed to start watching ralph prds:", err);
    });

    // Listener for ralph PRD changes
    let unlisten: UnlistenFn | null = null;
    listen<{ folder_path: string }>("ralph-prd-changed", (event) => {
      // Only process events for the current folder
      if (event.payload.folder_path !== folderPath) return;

      if (ralphPrdsDebounceRef.current) {
        clearTimeout(ralphPrdsDebounceRef.current);
      }
      ralphPrdsDebounceRef.current = window.setTimeout(() => {
        handleRalphPrdsChange(false);
      }, 100);

      // Also reload the selected PRD content if one is selected
      if (contentReloadDebounceRef.current) {
        clearTimeout(contentReloadDebounceRef.current);
      }
      contentReloadDebounceRef.current = window.setTimeout(() => {
        reloadSelectedPrdContent();
      }, 150);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
      if (ralphPrdsDebounceRef.current) clearTimeout(ralphPrdsDebounceRef.current);
      if (contentReloadDebounceRef.current) clearTimeout(contentReloadDebounceRef.current);
    };
  }, [folderPath, handleRalphPrdsChange, reloadSelectedPrdContent]);

  return {
    ralphPrds,
    selectedRalphPrd,
    ralphPrdContent,
    ralphLinkedSessionId,
    setRalphLinkedSessionId,
    selectRalphPrd,
    clearSelection,
  };
}
