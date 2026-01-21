import { createContext } from "react";
import type { FolderContextValue } from "./FolderContextTypes";

export const FolderContext = createContext<FolderContextValue | null>(null);
