import { useRef, useCallback, useEffect } from "react";
import type { ClaudeMessage } from "@/types";

export function useAutoScroll(messages: ClaudeMessage[]) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const savedScrollPosition = useRef<number>(0);
  const lastElement = useRef<HTMLDivElement | null>(null);

  // Preserve scroll position when the scroll container element changes
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    // If we switched to a different DOM element, restore saved scroll position
    if (lastElement.current !== null && lastElement.current !== element) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = savedScrollPosition.current;
        }
      });
    }
    lastElement.current = element;
  });

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
    shouldAutoScroll.current = scrollHeight - scrollTop - clientHeight < 20;
    // Save scroll position for restoration when view changes
    savedScrollPosition.current = scrollTop;
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
    showScrollbar: false,
    handleScroll,
    resetAutoScroll,
    scrollToBottom,
  };
}
