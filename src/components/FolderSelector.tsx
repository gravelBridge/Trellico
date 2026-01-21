import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface FolderOption {
  path: string;
  name: string;
  isRunning: boolean;
}

interface FolderSelectorProps {
  folders: FolderOption[];
  activeFolderPath: string | null;
  onSelectFolder: (path: string) => void;
  onCloseFolder: (path: string) => void;
  onAddFolder: () => void;
}

function FolderIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function RunningDot() {
  return (
    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse shrink-0" />
  );
}

export function FolderSelector({
  folders,
  activeFolderPath,
  onSelectFolder,
  onCloseFolder,
  onAddFolder,
}: FolderSelectorProps) {
  const [open, setOpen] = useState(false);
  const activeFolder = folders.find((f) => f.path === activeFolderPath);

  const handleCloseFolder = (path: string) => {
    // Auto-close dropdown if only one folder will remain
    if (folders.length === 2) {
      setOpen(false);
    }
    onCloseFolder(path);
  };

  return (
    <div className="flex items-center gap-1.5 px-2 py-1.5">
      <Select value={activeFolderPath ?? ""} onValueChange={onSelectFolder} open={open} onOpenChange={setOpen}>
        <SelectTrigger className="h-8 flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <FolderIcon />
            <SelectValue placeholder="Select folder">
              <span className="truncate">{activeFolder?.name}</span>
            </SelectValue>
            {activeFolder?.isRunning && <RunningDot />}
          </div>
        </SelectTrigger>
        <SelectContent position="popper" side="bottom" align="start" sideOffset={4}>
          {folders.map((folder) => (
            <div key={folder.path} className="relative">
              <SelectItem
                value={folder.path}
                className="pr-8"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FolderIcon />
                  <span className="truncate">{folder.name}</span>
                  {folder.isRunning && <RunningDot />}
                </div>
              </SelectItem>
              {folders.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleCloseFolder(folder.path);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-colors z-10"
                >
                  <CloseIcon />
                </button>
              )}
            </div>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onAddFolder}
        title="Add folder"
      >
        <PlusIcon />
      </Button>
    </div>
  );
}
