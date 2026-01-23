import React from "react";
import { MessageList } from "@/components/MessageList";
import { PromptInput } from "@/components/PromptInput";
import type { AIMessage } from "@/types";

interface ChatViewProps {
  messages: AIMessage[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  showScrollbar: boolean;
  onScroll: () => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStop: () => void;
  isRunning: boolean;
  placeholder?: string;
}

export function ChatView({
  messages,
  scrollRef,
  showScrollbar,
  onScroll,
  inputValue,
  onInputChange,
  onSubmit,
  onStop,
  isRunning,
  placeholder = "Ask anything...",
}: ChatViewProps) {
  return (
    <>
      <div className="h-12 shrink-0" data-tauri-drag-region />
      <MessageList
        messages={messages}
        scrollRef={scrollRef}
        showScrollbar={showScrollbar}
        onScroll={onScroll}
      />
      <div className="select-none border-t relative">
        {isRunning && (
          <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden z-10">
            <div
              className="h-full w-full"
              style={{
                background:
                  "linear-gradient(90deg, transparent, #f97316, #fb923c, #f97316, transparent)",
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
        )}
        <form onSubmit={onSubmit} className="max-w-3xl w-full mx-auto px-6 py-6">
          <PromptInput
            value={inputValue}
            onChange={onInputChange}
            onSubmit={onSubmit}
            onStop={onStop}
            isRunning={isRunning}
            placeholder={placeholder}
            rows={3}
            autoFocus
          />
        </form>
      </div>
    </>
  );
}
