import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { kebabToTitle } from "@/lib/formatting";
import type { GeneratingItem } from "@/types";

interface RenameDialogState {
  isOpen: boolean;
  type: "session" | "ralph_prd" | null;
  id: string;
  currentName: string;
}

interface DeleteDialogState {
  isOpen: boolean;
  type: "session" | "ralph_prd" | null;
  id: string;
  name: string;
}

interface UseSessionManagementProps {
  folderPath: string | null;
  generatingItems: GeneratingItem[];
  selectedGeneratingItemId: string | null;
  selectedRalphPrd: string | null;
  setGeneratingItems: (updater: (prev: GeneratingItem[]) => GeneratingItem[]) => void;
  setSelectedGeneratingItemId: (id: string | null) => void;
  clearRalphSelection: () => void;
  clearIterationSelection: () => void;
  clearIterationsForPrd: (prdName: string) => void;
  clearSessionView: () => void;
}

export function useSessionManagement({
  folderPath,
  generatingItems,
  selectedGeneratingItemId,
  selectedRalphPrd,
  setGeneratingItems,
  setSelectedGeneratingItemId,
  clearRalphSelection,
  clearIterationSelection,
  clearIterationsForPrd,
  clearSessionView,
}: UseSessionManagementProps) {
  const [renameDialog, setRenameDialog] = useState<RenameDialogState>({
    isOpen: false,
    type: null,
    id: "",
    currentName: "",
  });
  const [renameValue, setRenameValue] = useState("");
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState<DeleteDialogState>({
    isOpen: false,
    type: null,
    id: "",
    name: "",
  });

  const handleRenameSession = useCallback((sessionId: string, currentName: string) => {
    setRenameDialog({ isOpen: true, type: "session", id: sessionId, currentName });
    setRenameValue(currentName);
  }, []);

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      const item = generatingItems.find((i) => i.sessionId === sessionId);
      setDeleteConfirmDialog({
        isOpen: true,
        type: "session",
        id: sessionId,
        name: item?.displayName || "this session",
      });
    },
    [generatingItems]
  );

  const handleRenameRalphPrd = useCallback((prdName: string) => {
    setRenameDialog({
      isOpen: true,
      type: "ralph_prd",
      id: prdName,
      currentName: kebabToTitle(prdName),
    });
    setRenameValue(kebabToTitle(prdName));
  }, []);

  const handleDeleteRalphPrd = useCallback((prdName: string) => {
    setDeleteConfirmDialog({
      isOpen: true,
      type: "ralph_prd",
      id: prdName,
      name: kebabToTitle(prdName),
    });
  }, []);

  const closeRenameDialog = useCallback(() => {
    setRenameDialog({ isOpen: false, type: null, id: "", currentName: "" });
    setRenameValue("");
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setDeleteConfirmDialog({ isOpen: false, type: null, id: "", name: "" });
  }, []);

  const confirmRename = useCallback(async () => {
    if (!renameDialog.type || !renameDialog.id || !renameValue.trim()) return;

    if (renameDialog.type === "session") {
      try {
        await invoke("db_update_session_display_name", {
          sessionId: renameDialog.id,
          displayName: renameValue.trim(),
        });
        // Update the generating item's displayName in state
        setGeneratingItems((prev) =>
          prev.map((item) =>
            item.sessionId === renameDialog.id
              ? { ...item, displayName: renameValue.trim() }
              : item
          )
        );
      } catch (err) {
        console.error("Failed to rename session:", err);
      }
    }
    // Note: Ralph PRD rename would require renaming the folder on disk
    // For now, we only support session rename

    closeRenameDialog();
  }, [renameDialog, renameValue, setGeneratingItems, closeRenameDialog]);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirmDialog.type || !deleteConfirmDialog.id) return;

    if (deleteConfirmDialog.type === "session") {
      try {
        await invoke("db_delete_session", { sessionId: deleteConfirmDialog.id });
        // Remove from generating items
        setGeneratingItems((prev) =>
          prev.filter((item) => item.sessionId !== deleteConfirmDialog.id)
        );
        // Clear selection if this was selected
        if (
          generatingItems.find((i) => i.sessionId === deleteConfirmDialog.id)?.id ===
          selectedGeneratingItemId
        ) {
          setSelectedGeneratingItemId(null);
          clearSessionView();
        }
      } catch (err) {
        console.error("Failed to delete session:", err);
      }
    } else if (deleteConfirmDialog.type === "ralph_prd" && folderPath) {
      try {
        await invoke("db_delete_ralph_prd_data", {
          folderPath,
          prdName: deleteConfirmDialog.id,
        });
        // Clear iterations from state immediately (file watcher will update prds list)
        clearIterationsForPrd(deleteConfirmDialog.id);
        // Clear selection if this was the selected PRD
        if (selectedRalphPrd === deleteConfirmDialog.id) {
          clearRalphSelection();
          clearIterationSelection();
          clearSessionView();
        }
      } catch (err) {
        console.error("Failed to delete Ralph PRD data:", err);
      }
    }

    closeDeleteDialog();
  }, [
    deleteConfirmDialog,
    folderPath,
    generatingItems,
    selectedGeneratingItemId,
    selectedRalphPrd,
    setGeneratingItems,
    setSelectedGeneratingItemId,
    clearRalphSelection,
    clearIterationSelection,
    clearIterationsForPrd,
    clearSessionView,
    closeDeleteDialog,
  ]);

  return {
    renameDialog,
    renameValue,
    setRenameValue,
    deleteConfirmDialog,
    handleRenameSession,
    handleDeleteSession,
    handleRenameRalphPrd,
    handleDeleteRalphPrd,
    closeRenameDialog,
    closeDeleteDialog,
    confirmRename,
    confirmDelete,
  };
}
