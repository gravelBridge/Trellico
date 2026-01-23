import type { RefObject } from "react";
import type { AIMessage } from "@/types";
import { MessageList } from "./MessageList";
import { PromptInput } from "./PromptInput";
import { cn } from "@/lib/utils";

function FlowingIndicator() {
  return (
    <div className="absolute -top-px left-0 right-0 h-0.5 overflow-hidden z-10">
      <div
        className="h-full w-full"
        style={{
          background: "linear-gradient(90deg, transparent, #f97316, #fb923c, #f97316, transparent)",
          backgroundSize: "33% 100%",
          backgroundRepeat: "no-repeat",
          animation: "flowAnimation 1.5s ease-in-out infinite alternate",
        }}
      />
      <style>{`
        @keyframes flowAnimation {
          0% { background-position: -33% 0; }
          100% { background-position: 133% 0; }
        }
      `}</style>
    </div>
  );
}

interface ChatPanelProps {
  messages: AIMessage[];
  scrollRef: RefObject<HTMLDivElement | null>;
  showScrollbar: boolean;
  onScroll: () => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStop: () => void;
  isRunning: boolean;
  hasLinkedSession: boolean;
  sidebarOpen: boolean;
  emptyMessage?: string;
}

export function ChatPanel({
  messages,
  scrollRef,
  showScrollbar,
  onScroll,
  inputValue,
  onInputChange,
  onSubmit,
  onStop,
  isRunning,
  hasLinkedSession,
  sidebarOpen,
  emptyMessage = "No chat history",
}: ChatPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div
        className={cn("h-12 shrink-0 flex items-center px-4 border-b", !sidebarOpen && "pl-32")}
        data-tauri-drag-region
      >
        <span className="text-sm font-medium text-muted-foreground">Chat</span>
      </div>
      {messages.length > 0 ? (
        <>
          <MessageList
            messages={messages}
            scrollRef={scrollRef}
            showScrollbar={showScrollbar}
            onScroll={onScroll}
            className="px-4 pt-4"
          />
          <div className="select-none border-t p-4 relative">
            {isRunning && <FlowingIndicator />}
            <PromptInput
              value={inputValue}
              onChange={onInputChange}
              onSubmit={onSubmit}
              onStop={onStop}
              isRunning={isRunning}
              placeholder="Follow up..."
              rows={2}
              variant="compact"
            />
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-muted-foreground text-center">
            {hasLinkedSession ? "Loading chat history..." : emptyMessage}
          </p>
        </div>
      )}
    </div>
  );
}
