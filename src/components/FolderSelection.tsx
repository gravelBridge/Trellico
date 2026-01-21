import { Button } from "@/components/ui/button";

interface FolderSelectionProps {
  onSelectFolder: () => void;
}

export function FolderSelection({ onSelectFolder }: FolderSelectionProps) {
  return (
    <main className="min-h-screen flex flex-col">
      <div className="h-12 shrink-0" data-tauri-drag-region />
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-medium tracking-tight">Trellico</h1>
        <p className="text-sm text-muted-foreground">Select a folder to get started</p>
      </div>
      <Button onClick={onSelectFolder} variant="outline">
        Choose Folder
      </Button>
      </div>
    </main>
  );
}
