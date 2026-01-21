import { useRef, useState, useCallback, useEffect } from "react";
import type { ClaudeMessage } from "@/types";

export function useAutoScroll(messages: ClaudeMessage[]) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const scrollTimeoutRef = useRef<number | null>(null);
  const [showScrollbar, setShowScrollbar] = useState(false);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current && shouldAutoScroll.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [messages]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
    const wasAutoScrolling = shouldAutoScroll.current;
    shouldAutoScroll.current = isAtBottom;

    // Only show scrollbar when user has broken auto-scroll (not at bottom)
    if (!shouldAutoScroll.current) {
      setShowScrollbar(true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = window.setTimeout(() => {
        setShowScrollbar(false);
      }, 500);
    }

    // If user scrolled back to bottom, hide scrollbar immediately
    if (shouldAutoScroll.current && !wasAutoScrolling) {
      setShowScrollbar(false);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    }
  }, []);

  const resetAutoScroll = useCallback(() => {
    shouldAutoScroll.current = true;
  }, []);

  const scrollToBottom = useCallback(() => {
    shouldAutoScroll.current = true;
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  return {
    scrollRef,
    showScrollbar,
    handleScroll,
    resetAutoScroll,
    scrollToBottom,
  };
}
