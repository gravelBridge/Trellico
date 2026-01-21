import React, { useState, useCallback, useMemo } from "react";
import type { GeneratingItem } from "@/types";
import type { FolderState, FolderContextValue } from "./FolderContextTypes";
import { FolderContext } from "./FolderContextInstance";

function createDefaultFolderState(path: string): FolderState {
  return {
    path,
    activeTab: "plans",
    splitPosition: 50,
    selectedPlan: null,
    selectedRalphPrd: null,
    selectedRalphIteration: null,
    generatingItems: [],
    selectedGeneratingItemId: null,
  };
}

export function FolderProvider({ children }: { children: React.ReactNode }) {
  const [folders, setFolders] = useState<FolderState[]>([]);
  const [activeFolderPath, setActiveFolderPath] = useState<string | null>(null);

  // Get active folder state
  const activeFolder = useMemo(
    () => folders.find((f) => f.path === activeFolderPath) ?? null,
    [folders, activeFolderPath]
  );

  // Add a new folder
  const addFolder = useCallback((path: string) => {
    setFolders((prev) => {
      // Don't add if already exists
      if (prev.some((f) => f.path === path)) {
        return prev;
      }
      return [...prev, createDefaultFolderState(path)];
    });
    setActiveFolderPath(path);
  }, []);

  // Remove a folder
  const removeFolder = useCallback((path: string) => {
    let newActivePath: string | null = null;
    setFolders((prev) => {
      const remaining = prev.filter((f) => f.path !== path);
      // Compute new active path from the updated folders list
      newActivePath = remaining.length > 0 ? remaining[0].path : null;
      return remaining;
    });
    setActiveFolderPath((current) => {
      if (current === path) {
        return newActivePath;
      }
      return current;
    });
  }, []);

  // Set active folder
  const setActiveFolder = useCallback((path: string) => {
    setActiveFolderPath(path);
  }, []);

  // Get folder state by path
  const getFolderState = useCallback(
    (path: string) => folders.find((f) => f.path === path),
    [folders]
  );

  // Update folder state
  const updateFolderState = useCallback((path: string, updates: Partial<FolderState>) => {
    setFolders((prev) =>
      prev.map((f) => (f.path === path ? { ...f, ...updates } : f))
    );
  }, []);

  // Per-folder state setters (update active folder)
  const setActiveTab = useCallback(
    (tab: "plans" | "ralph") => {
      if (activeFolderPath) {
        updateFolderState(activeFolderPath, { activeTab: tab });
      }
    },
    [activeFolderPath, updateFolderState]
  );

  const setSplitPosition = useCallback(
    (position: number) => {
      if (activeFolderPath) {
        updateFolderState(activeFolderPath, { splitPosition: position });
      }
    },
    [activeFolderPath, updateFolderState]
  );

  const setSelectedPlan = useCallback(
    (plan: string | null) => {
      if (activeFolderPath) {
        updateFolderState(activeFolderPath, { selectedPlan: plan });
      }
    },
    [activeFolderPath, updateFolderState]
  );

  const setSelectedRalphPrd = useCallback(
    (prd: string | null) => {
      if (activeFolderPath) {
        updateFolderState(activeFolderPath, { selectedRalphPrd: prd });
      }
    },
    [activeFolderPath, updateFolderState]
  );

  const setSelectedRalphIteration = useCallback(
    (iteration: { prd: string; iteration: number } | null) => {
      if (activeFolderPath) {
        updateFolderState(activeFolderPath, { selectedRalphIteration: iteration });
      }
    },
    [activeFolderPath, updateFolderState]
  );

  const setGeneratingItems = useCallback(
    (items: GeneratingItem[] | ((prev: GeneratingItem[]) => GeneratingItem[])) => {
      if (!activeFolderPath) return;
      setFolders((prev) =>
        prev.map((f) => {
          if (f.path !== activeFolderPath) return f;
          const newItems = typeof items === "function" ? items(f.generatingItems) : items;
          return { ...f, generatingItems: newItems };
        })
      );
    },
    [activeFolderPath]
  );

  const setSelectedGeneratingItemId = useCallback(
    (id: string | null) => {
      if (activeFolderPath) {
        updateFolderState(activeFolderPath, { selectedGeneratingItemId: id });
      }
    },
    [activeFolderPath, updateFolderState]
  );

  const value: FolderContextValue = {
    folders,
    activeFolderPath,
    activeFolder,
    addFolder,
    removeFolder,
    setActiveFolder,
    setActiveTab,
    setSplitPosition,
    setSelectedPlan,
    setSelectedRalphPrd,
    setSelectedRalphIteration,
    setGeneratingItems,
    setSelectedGeneratingItemId,
    getFolderState,
    updateFolderState,
  };

  return <FolderContext.Provider value={value}>{children}</FolderContext.Provider>;
}
