import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { ClaudeMessage, SessionPlanLink } from "@/types";
import { useMessageStore } from "@/contexts";

interface UseRalphPrdsOptions {
  folderPath: string | null;
  activeTab: string;
}

export function useRalphPrds({ folderPath, activeTab }: UseRalphPrdsOptions) {
  const store = useMessageStore();

  const [ralphPrds, setRalphPrds] = useState<string[]>([]);
  const [selectedRalphPrd, setSelectedRalphPrd] = useState<string | null>(null);
  const [ralphPrdContent, setRalphPrdContent] = useState<string | null>(null);
  const [ralphLinkedSessionId, setRalphLinkedSessionId] = useState<string | null>(null);
  const [pendingLinkPrd, setPendingLinkPrd] = useState<string | null>(null);

  const prevRalphPrdsRef = useRef<string[]>([]);
  const ralphPrdsDebounceRef = useRef<number | null>(null);
  const selectedRalphPrdRef = useRef<string | null>(null);
  const activeTabRef = useRef(activeTab);
  const selectRalphPrdRef = useRef<((prdName: string, autoLoadHistory?: boolean) => Promise<void>) | null>(null);

  // Keep refs in sync
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    selectedRalphPrdRef.current = selectedRalphPrd;
  }, [selectedRalphPrd]);

  // Handle pending link when session ID becomes available
  useEffect(() => {
    const viewedSessionId = store.state.viewedSessionId;

    if (pendingLinkPrd && viewedSessionId && !viewedSessionId.startsWith("__pending__") && folderPath) {
      invoke("save_ralph_link", {
        folderPath,
        sessionId: viewedSessionId,
        prdFileName: pendingLinkPrd,
      })
        .then(() => {
          setRalphLinkedSessionId(viewedSessionId);
          setPendingLinkPrd(null);
        })
        .catch((err) => {
          console.error("Failed to save ralph link:", err);
          setPendingLinkPrd(null);
        });
    }
  }, [pendingLinkPrd, store.state.viewedSessionId, folderPath]);

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
            store.viewSession(link.session_id, filteredHistory);
          } else {
            setRalphLinkedSessionId(null);
            if (!store.hasAnyRunning()) {
              store.viewSession(null);
            }
          }
        } catch (err) {
          console.error("Failed to get ralph link:", err);
        }
      }
    },
    [folderPath, store]
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
        if (
          added.length === 1 &&
          removed.length === 0 &&
          store.hasAnyRunning() &&
          activeTabRef.current === "ralph"
        ) {
          selectRalphPrdRef.current?.(added[0], false);
          // Link session to this PRD using the currently viewed session
          const viewedSessionId = store.state.viewedSessionId;
          if (viewedSessionId && !viewedSessionId.startsWith("__pending__")) {
            // Session ID is already available, save link immediately
            invoke("save_ralph_link", {
              folderPath,
              sessionId: viewedSessionId,
              prdFileName: added[0],
            })
              .then(() => {
                setRalphLinkedSessionId(viewedSessionId);
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
    [folderPath, store]
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

    // Initial load - deferred to microtask to avoid synchronous setState in effect
    queueMicrotask(() => {
      handleRalphPrdsChange(true);
    });

    // Start watching for file changes
    invoke("watch_ralph_prds", { folderPath }).catch((err) => {
      console.error("Failed to start watching ralph prds:", err);
    });

    // Listener for ralph PRD changes
    let unlisten: UnlistenFn | null = null;
    listen("ralph-prd-changed", () => {
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
