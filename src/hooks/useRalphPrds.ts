import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import type { ClaudeMessage, SessionPlanLink } from "@/types";

interface UseRalphPrdsOptions {
  folderPath: string | null;
  isRunning: boolean;
  sessionId: string | null;
  activeTab: string;
  setSessionId: (id: string | null) => void;
  setMessages: (messages: ClaudeMessage[] | ((prev: ClaudeMessage[]) => ClaudeMessage[])) => void;
}

export function useRalphPrds({
  folderPath,
  isRunning,
  sessionId,
  activeTab,
  setSessionId,
  setMessages,
}: UseRalphPrdsOptions) {
  const [ralphPrds, setRalphPrds] = useState<string[]>([]);
  const [selectedRalphPrd, setSelectedRalphPrd] = useState<string | null>(null);
  const [ralphPrdContent, setRalphPrdContent] = useState<string | null>(null);
  const [ralphLinkedSessionId, setRalphLinkedSessionId] = useState<string | null>(null);

  const prevRalphPrdsRef = useRef<string[]>([]);
  const ralphPrdsDebounceRef = useRef<number | null>(null);
  const selectedRalphPrdRef = useRef<string | null>(null);
  const isRunningRef = useRef(isRunning);
  const sessionIdRef = useRef(sessionId);
  const activeTabRef = useRef(activeTab);

  // Keep refs in sync with state
  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    selectedRalphPrdRef.current = selectedRalphPrd;
  }, [selectedRalphPrd]);

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
            setSessionId(link.session_id);
            const history = await invoke<ClaudeMessage[]>("load_session_history", {
              folderPath,
              sessionId: link.session_id,
            });
            // Skip the first user message (the hidden prompt)
            const filteredHistory =
              history.length > 0 && history[0].type === "user" ? history.slice(1) : history;
            setMessages(filteredHistory);
          } else {
            setRalphLinkedSessionId(null);
            if (!isRunningRef.current) {
              setSessionId(null);
              setMessages([]);
            }
          }
        } catch (err) {
          console.error("Failed to get ralph link:", err);
        }
      }
    },
    [folderPath, setSessionId, setMessages]
  );

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
          isRunningRef.current &&
          activeTabRef.current === "ralph"
        ) {
          selectRalphPrd(added[0], false);
          // Link session to this PRD
          const currentSessionId = sessionIdRef.current;
          if (currentSessionId) {
            invoke("save_ralph_link", {
              folderPath,
              sessionId: currentSessionId,
              prdFileName: added[0],
            })
              .then(() => {
                setRalphLinkedSessionId(currentSessionId);
              })
              .catch(console.error);
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
    [folderPath, selectRalphPrd]
  );

  const clearSelection = useCallback(() => {
    setSelectedRalphPrd(null);
    setRalphPrdContent(null);
    setRalphLinkedSessionId(null);
    selectedRalphPrdRef.current = null;
  }, []);

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
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
      if (ralphPrdsDebounceRef.current) clearTimeout(ralphPrdsDebounceRef.current);
    };
  }, [folderPath, handleRalphPrdsChange]);

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
