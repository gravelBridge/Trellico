import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AIMessage, GeneratingItem, FolderSession, Provider } from "@/types";

interface UseGeneratingItemsProps {
  folderPath: string | null;
  generatingItems: GeneratingItem[];
  selectedGeneratingItemId: string | null;
  setGeneratingItems: (updater: (prev: GeneratingItem[]) => GeneratingItem[]) => void;
  setSelectedGeneratingItemId: (id: string | null) => void;
}

export function useGeneratingItems({
  folderPath,
  generatingItems,
  selectedGeneratingItemId,
  setGeneratingItems,
  setSelectedGeneratingItemId,
}: UseGeneratingItemsProps) {
  // Ref to track generating items for session ID lookup (avoids callback recreation)
  const generatingItemsRef = useRef(generatingItems);
  useEffect(() => {
    generatingItemsRef.current = generatingItems;
  }, [generatingItems]);

  const addGeneratingItem = useCallback(
    (item: Omit<GeneratingItem, "sessionId">, itemProvider?: Provider) => {
      const fullItem: GeneratingItem = {
        ...item,
        sessionId: `__pending__${item.id}`,
        provider: itemProvider,
      };
      // Add to beginning so newest appears first
      setGeneratingItems((prev) => [fullItem, ...prev]);
      // Auto-select the new generating item
      setSelectedGeneratingItemId(item.id);
    },
    [setGeneratingItems, setSelectedGeneratingItemId]
  );

  const updateGeneratingItemSessionId = useCallback(
    (processId: string, sessionId: string) => {
      setGeneratingItems((prev) =>
        prev.map((item) => (item.id === processId ? { ...item, sessionId } : item))
      );
    },
    [setGeneratingItems]
  );

  const removeGeneratingItemByType = useCallback(
    (type: "plan" | "ralph_prd") => {
      setGeneratingItems((prev) => {
        const idx = prev.findIndex((i) => i.type === type);
        if (idx === -1) return prev;
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
      // Clear selection - the plan/prd is now created and will be auto-selected
      setSelectedGeneratingItemId(null);
    },
    [setGeneratingItems, setSelectedGeneratingItemId]
  );

  const removeGeneratingItemBySessionId = useCallback(
    (sessionId: string) => {
      setGeneratingItems((prev) => prev.filter((i) => i.sessionId !== sessionId));
      // Clear selection if the removed item was selected
      const removedItem = generatingItemsRef.current.find((i) => i.sessionId === sessionId);
      if (removedItem && selectedGeneratingItemId === removedItem.id) {
        setSelectedGeneratingItemId(null);
      }
    },
    [setGeneratingItems, setSelectedGeneratingItemId, selectedGeneratingItemId]
  );

  const getSelectedGeneratingItemType = useCallback(() => {
    if (!selectedGeneratingItemId) return null;
    return generatingItemsRef.current.find((i) => i.id === selectedGeneratingItemId)?.type ?? null;
  }, [selectedGeneratingItemId]);

  const getSessionIdForPrd = useCallback((prdName: string): string | null => {
    const item = generatingItemsRef.current.find(
      (i) => i.type === "ralph_prd" && i.targetName === prdName
    );
    return item?.sessionId ?? null;
  }, []);

  // Load unlinked sessions (sessions without a plan) when folder changes
  const unlinkedSessionsLoadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!folderPath) {
      unlinkedSessionsLoadedRef.current = null;
      return;
    }

    // Skip if we've already loaded for this folder
    if (unlinkedSessionsLoadedRef.current === folderPath) return;
    unlinkedSessionsLoadedRef.current = folderPath;

    let isActive = true;

    async function loadUnlinkedSessions() {
      try {
        const sessions = await invoke<FolderSession[]>("db_get_folder_sessions", {
          folderPath,
        });

        // Filter for sessions without a linked plan
        const unlinkedSessions = sessions.filter((s) => !s.linked_plan);
        if (!isActive || unlinkedSessions.length === 0) return;

        // For each session, get the first user message to use as display name
        const items: GeneratingItem[] = [];
        for (const session of unlinkedSessions) {
          // Check if we already have a generating item for this session
          const existing = generatingItemsRef.current.find((g) => g.sessionId === session.id);
          if (existing) continue;

          // Use display_name if set (from rename), otherwise derive from first message
          let displayName = session.display_name;
          if (!displayName) {
            displayName = "Plan Chat";
            try {
              const messages = await invoke<AIMessage[]>("db_get_session_messages", {
                sessionId: session.id,
              });
              const firstUserMsg = messages.find((m) => m.type === "user");
              if (firstUserMsg?.content) {
                // Truncate long messages
                const content =
                  typeof firstUserMsg.content === "string" ? firstUserMsg.content : "";
                displayName = content.length > 50 ? content.slice(0, 50) + "..." : content;
              }
            } catch {
              // Failed to get messages, use default display name
            }
          }

          items.push({
            id: session.id,
            displayName,
            type: "plan",
            sessionId: session.id,
            provider: session.provider as Provider,
          });
        }

        if (isActive && items.length > 0) {
          setGeneratingItems((prev) => [...items, ...prev]);
        }
      } catch {
        // Failed to load sessions
      }
    }

    loadUnlinkedSessions();

    return () => {
      isActive = false;
    };
  }, [folderPath, setGeneratingItems]);

  return {
    addGeneratingItem,
    updateGeneratingItemSessionId,
    removeGeneratingItemByType,
    removeGeneratingItemBySessionId,
    getSelectedGeneratingItemType,
    getSessionIdForPrd,
    generatingItemsRef,
  };
}
