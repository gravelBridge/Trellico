import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import Markdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ClaudeMessage {
  type: string;
  subtype?: string;
  message?: {
    content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
  };
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  content?: string;
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  session_id?: string;
}

function App() {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bufferRef = useRef("");
  const shouldAutoScroll = useRef(true);
  const [showScrollbar, setShowScrollbar] = useState(false);
  const scrollTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let unlisteners: UnlistenFn[] = [];
    let mounted = true;

    const setupListeners = async () => {
      const outputUnlisten = await listen<string>("claude-output", (event) => {
        if (!mounted) return;

        bufferRef.current += event.payload;
        const lines = bufferRef.current.split("\n");
        bufferRef.current = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as ClaudeMessage;
            setMessages((prev) => [...prev, parsed]);
          } catch {
            // Not valid JSON, ignore
          }
        }
      });

      const exitUnlisten = await listen<number>("claude-exit", () => {
        if (mounted) {
          setIsRunning(false);
        }
      });

      const errorUnlisten = await listen<string>("claude-error", (event) => {
        if (mounted) {
          setMessages((prev) => [...prev, { type: "system", content: `Error: ${event.payload}` }]);
          setIsRunning(false);
        }
      });

      unlisteners = [outputUnlisten, exitUnlisten, errorUnlisten];
    };

    setupListeners();

    return () => {
      mounted = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current && shouldAutoScroll.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [messages]);

  function handleScroll() {
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
  }

  async function selectFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
    });

    if (selected) {
      setFolderPath(selected);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim() && folderPath && !isRunning) {
      setMessages([]);
      bufferRef.current = "";
      shouldAutoScroll.current = true;
      setIsRunning(true);
      try {
        await invoke("run_claude", { message, folderPath });
      } catch (err) {
        setMessages([{ type: "system", content: `Error: ${err}` }]);
        setIsRunning(false);
      }
      setMessage("");
    }
  }

  function renderMessage(msg: ClaudeMessage, index: number) {
    if (msg.type === "system" && msg.subtype === "init") {
      return null;
    }

    switch (msg.type) {
      case "assistant": {
        const textContent = msg.message?.content
          ?.filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        const toolUses = msg.message?.content?.filter((c) => c.type === "tool_use");

        if (!textContent && (!toolUses || toolUses.length === 0)) {
          return null;
        }

        return (
          <div key={index} className="space-y-1">
            {textContent && (
              <div className="prose prose-neutral prose-sm inline-block select-text">
                <Markdown>{textContent}</Markdown>
              </div>
            )}
            {toolUses?.map((tool, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="font-mono text-primary font-medium">{tool.name}</span>
                {tool.input && (
                  <code className="text-[10px] text-muted-foreground/70">
                    {JSON.stringify(tool.input)}
                  </code>
                )}
              </div>
            ))}
          </div>
        );
      }
      case "user": {
        const content = msg.message?.content?.map((c) => c.text).join("\n") || msg.content;
        if (!content?.trim()) {
          return null;
        }
        return null; // Don't show user messages, they typed it
      }
      case "tool_result": {
        const output = msg.content || msg.result || "";
        if (!output.trim()) return null;
        return (
          <details key={index} className="group">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
              Output
            </summary>
            <pre className="mt-2 text-[11px] text-muted-foreground bg-muted/30 p-3 rounded-md overflow-auto max-h-48">
              {output}
            </pre>
          </details>
        );
      }
      case "result":
        // Skip the text since it duplicates the assistant message, just show metadata
        if (msg.total_cost_usd === undefined) return null;
        return (
          <p key={index} className="text-[11px] text-muted-foreground pt-2 -mt-4 border-t w-fit select-text">
            ${msg.total_cost_usd.toFixed(4)} · {((msg.duration_ms || 0) / 1000).toFixed(1)}s
          </p>
        );
      case "system":
        // Only show errors, not exit messages
        if (!msg.content?.startsWith("Error:")) return null;
        return (
          <p key={index} className="text-xs text-destructive">
            {msg.content}
          </p>
        );
      default:
        return null;
    }
  }

  if (!folderPath) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-medium tracking-tight">Trellico</h1>
          <p className="text-sm text-muted-foreground">Select a folder to get started</p>
        </div>
        <Button onClick={selectFolder} variant="outline">
          Choose Folder
        </Button>
      </main>
    );
  }

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-6 pt-2 pb-4 border-b">
        <span className="text-sm font-medium">{folderPath.split("/").pop()}</span>
        <Button variant="ghost" size="sm" onClick={selectFolder} disabled={isRunning}>
          Change
        </Button>
      </header>

      <div className={`flex-1 overflow-auto select-none scroll-container ${showScrollbar ? "is-scrolling" : ""}`} ref={scrollRef} onScroll={handleScroll}>
        {messages.length > 0 && (
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
            {messages.map((msg, i) => renderMessage(msg, i))}
          </div>
        )}
      </div>

      <div className={cn(
        "select-none",
        messages.length > 0 && "border-t"
      )}>
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-6 py-6">
          <div className="relative">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (message.trim() && !isRunning) {
                    handleSubmit(e);
                  }
                }
              }}
              placeholder="Ask anything..."
              rows={3}
              autoFocus
              disabled={isRunning}
              className="resize-none text-base bg-background pr-12"
            />
            <button
              type="submit"
              disabled={!message.trim() || isRunning}
              className={cn(
                "absolute bottom-2 right-2 w-8 h-8 rounded-full flex items-center justify-center transition-colors",
                message.trim() && !isRunning
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 12V4M4 8l4-4 4 4" />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

export default App;
