import type { GeneratingItem } from "@/types";

// Per-folder UI state that gets preserved when switching folders
export interface FolderState {
  path: string;
  activeTab: "plans" | "ralph";
  splitPosition: number;
  selectedPlan: string | null;
  selectedRalphPrd: string | null;
  selectedRalphIteration: { prd: string; iteration: number } | null;
  generatingItems: GeneratingItem[];
  selectedGeneratingItemId: string | null;
}

// Overall multi-folder state
export interface FoldersState {
  folders: FolderState[];
  activeFolderPath: string | null;
}

// Context value type
export interface FolderContextValue {
  // State
  folders: FolderState[];
  activeFolderPath: string | null;
  activeFolder: FolderState | null;

  // Folder management
  addFolder: (path: string) => void;
  removeFolder: (path: string) => void;
  setActiveFolder: (path: string) => void;

  // Per-folder state updates (for the active folder)
  setActiveTab: (tab: "plans" | "ralph") => void;
  setSplitPosition: (position: number) => void;
  setSelectedPlan: (plan: string | null) => void;
  setSelectedRalphPrd: (prd: string | null) => void;
  setSelectedRalphIteration: (iteration: { prd: string; iteration: number } | null) => void;
  setGeneratingItems: (items: GeneratingItem[] | ((prev: GeneratingItem[]) => GeneratingItem[])) => void;
  setSelectedGeneratingItemId: (id: string | null) => void;

  // Helpers
  getFolderState: (path: string) => FolderState | undefined;
  updateFolderState: (path: string, updates: Partial<FolderState>) => void;
}
