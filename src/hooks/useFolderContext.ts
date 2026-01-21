import { useContext } from "react";
import { FolderContext } from "@/contexts/FolderContextInstance";
import type { FolderContextValue } from "@/contexts/FolderContextTypes";

export function useFolderContext(): FolderContextValue {
  const context = useContext(FolderContext);
  if (!context) {
    throw new Error("useFolderContext must be used within a FolderProvider");
  }
  return context;
}
