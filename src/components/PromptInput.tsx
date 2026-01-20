import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStop: () => void;
  isRunning: boolean;
  placeholder?: string;
  rows?: number;
  variant?: "default" | "compact";
  autoFocus?: boolean;
}

export function PromptInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isRunning,
  placeholder = "Ask anything...",
  rows = 3,
  variant = "default",
  autoFocus = false,
}: PromptInputProps) {
  const isCompact = variant === "compact";

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isRunning) {
        onSubmit(e);
      }
    }
  };

  return (
    <div className="relative">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className={cn(
          "resize-none bg-background",
          isCompact ? "text-sm pr-10" : "text-base pr-12"
        )}
      />
      <button
        type={isRunning ? "button" : "submit"}
        onClick={isRunning ? onStop : (e) => onSubmit(e as unknown as React.FormEvent)}
        disabled={!isRunning && !value.trim()}
        className={cn(
          "absolute bottom-2 right-2 rounded-full flex items-center justify-center transition-colors",
          isCompact ? "w-6 h-6" : "w-7 h-7",
          isRunning
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : value.trim()
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground"
        )}
      >
        {isRunning ? (
          <svg
            width={isCompact ? 10 : 12}
            height={isCompact ? 10 : 12}
            viewBox="0 0 12 12"
            fill="currentColor"
          >
            <rect x="1" y="1" width="10" height="10" rx="1" />
          </svg>
        ) : (
          <svg
            width={isCompact ? 12 : 14}
            height={isCompact ? 12 : 14}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 12V4M4 8l4-4 4 4" />
          </svg>
        )}
      </button>
    </div>
  );
}
