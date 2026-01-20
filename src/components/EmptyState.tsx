import { PromptInput } from "./PromptInput";

interface EmptyStateProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStop: () => void;
  isRunning: boolean;
  activeTab: string;
}

export function EmptyState({
  inputValue,
  onInputChange,
  onSubmit,
  onStop,
  isRunning,
  activeTab,
}: EmptyStateProps) {
  return (
    <>
      <div className="h-12 shrink-0" data-tauri-drag-region />
      <div className="flex-1 flex items-center justify-center pb-20 select-none">
        <form onSubmit={onSubmit} className="max-w-3xl w-full mx-auto px-6">
          {activeTab === "plans" && (
            <h2 className="text-2xl font-medium text-center mb-6 select-none cursor-default">
              Create a plan
            </h2>
          )}
          <div className="relative">
            <PromptInput
              value={inputValue}
              onChange={onInputChange}
              onSubmit={onSubmit}
              onStop={onStop}
              isRunning={isRunning}
              placeholder={activeTab === "plans" ? "What do you want to do?" : "Ask anything..."}
              rows={5}
              autoFocus
            />
          </div>
        </form>
      </div>
    </>
  );
}
