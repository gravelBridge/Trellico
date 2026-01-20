import type { RefObject } from "react";
import type { ClaudeMessage } from "@/types";
import { MessageItem } from "./MessageItem";

interface MessageListProps {
  messages: ClaudeMessage[];
  scrollRef: RefObject<HTMLDivElement | null>;
  showScrollbar: boolean;
  onScroll: () => void;
  className?: string;
}

export function MessageList({
  messages,
  scrollRef,
  showScrollbar,
  onScroll,
  className = "max-w-3xl mx-auto px-6",
}: MessageListProps) {
  return (
    <div
      className={`flex-1 overflow-auto select-none scroll-container ${showScrollbar ? "is-scrolling" : ""}`}
      ref={scrollRef}
      onScroll={onScroll}
    >
      <div className={`pt-0 pb-4 space-y-3 overflow-hidden ${className}`}>
        {messages.map((msg, i) => (
          <MessageItem key={i} message={msg} index={i} />
        ))}
      </div>
    </div>
  );
}
