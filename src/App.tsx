import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import Markdown from "react-markdown";
import { Light as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";
import typescript from "react-syntax-highlighter/dist/esm/languages/hljs/typescript";
import javascript from "react-syntax-highlighter/dist/esm/languages/hljs/javascript";
import python from "react-syntax-highlighter/dist/esm/languages/hljs/python";
import bash from "react-syntax-highlighter/dist/esm/languages/hljs/bash";
import json from "react-syntax-highlighter/dist/esm/languages/hljs/json";
import css from "react-syntax-highlighter/dist/esm/languages/hljs/css";
import rust from "react-syntax-highlighter/dist/esm/languages/hljs/rust";

SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("ts", typescript);
SyntaxHighlighter.registerLanguage("tsx", typescript);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("js", javascript);
SyntaxHighlighter.registerLanguage("jsx", javascript);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("py", python);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("sh", bash);
SyntaxHighlighter.registerLanguage("shell", bash);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("rust", rust);
SyntaxHighlighter.registerLanguage("rs", rust);
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { prdPrompt } from "@/prompts";

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

function kebabToTitle(kebab: string): string {
  return kebab
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function App() {
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("plans");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bufferRef = useRef("");
  const shouldAutoScroll = useRef(true);
  const [showScrollbar, setShowScrollbar] = useState(false);
  const scrollTimeoutRef = useRef<number | null>(null);
  const [plans, setPlans] = useState<string[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [planContent, setPlanContent] = useState<string | null>(null);
  const selectedPlanRef = useRef<string | null>(null);

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
            // Extract session ID from init message
            if (parsed.type === "system" && parsed.subtype === "init" && parsed.session_id) {
              setSessionId(parsed.session_id);
            }
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

  useEffect(() => {
    selectedPlanRef.current = selectedPlan;
  }, [selectedPlan]);

  useEffect(() => {
    if (!folderPath) return;

    loadPlans();

    // Start watching for file changes
    invoke("watch_plans", { folderPath }).catch((err) => {
      console.error("Failed to start watching plans:", err);
    });

    // Listen for plan changes
    let unlisten: UnlistenFn | null = null;
    listen("plans-changed", () => {
      loadPlans();
      // If a plan is selected, reload its content
      if (selectedPlanRef.current) {
        reloadSelectedPlan();
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, [folderPath]);

  async function loadPlans() {
    if (!folderPath) return;
    try {
      const planList = await invoke<string[]>("list_plans", { folderPath });
      setPlans(planList);
    } catch (err) {
      console.error("Failed to load plans:", err);
    }
  }

  async function reloadSelectedPlan() {
    const planName = selectedPlanRef.current;
    if (!folderPath || !planName) return;
    try {
      const content = await invoke<string>("read_plan", { folderPath, planName });
      setPlanContent(content);
    } catch (err) {
      // Plan might have been deleted
      console.error("Failed to reload plan:", err);
      setSelectedPlan(null);
      setPlanContent(null);
    }
  }

  async function selectPlan(planName: string) {
    if (!folderPath) return;
    setSelectedPlan(planName);
    try {
      const content = await invoke<string>("read_plan", { folderPath, planName });
      setPlanContent(content);
    } catch (err) {
      console.error("Failed to read plan:", err);
      setPlanContent(null);
    }
  }

  function closePlanViewer() {
    setSelectedPlan(null);
    setPlanContent(null);
  }

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
      await invoke("setup_folder", { folderPath: selected });
      setFolderPath(selected);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (message.trim() && folderPath && !isRunning) {
      const isNewSession = !sessionId;

      // Add user message to UI
      setMessages((prev) => [...prev, { type: "user", content: message }]);

      bufferRef.current = "";
      shouldAutoScroll.current = true;
      setIsRunning(true);

      // Only prepend prompt for new sessions in plans tab
      const fullMessage = isNewSession && activeTab === "plans"
        ? `${prdPrompt}\n\n${message}`
        : message;

      try {
        await invoke("run_claude", {
          message: fullMessage,
          folderPath,
          sessionId,
        });
      } catch (err) {
        setMessages((prev) => [...prev, { type: "system", content: `Error: ${err}` }]);
        setIsRunning(false);
      }
      setMessage("");
    }
  }

  function startNewPlan() {
    setMessages([]);
    setSessionId(null);
    setMessage("");
    setSelectedPlan(null);
    setPlanContent(null);
  }

  async function stopClaude() {
    try {
      await invoke("stop_claude");
      setIsRunning(false);
    } catch (err) {
      console.error("Failed to stop Claude:", err);
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
              <div className="prose prose-neutral prose-sm prose-pre:p-0 [&>*:last-child]:!mb-0 prose-p:inline prose-li:inline max-w-none select-text">
                <Markdown
                  components={{
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      const inline = !match;
                      return !inline ? (
                        <SyntaxHighlighter
                          style={atomOneDark}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{ margin: 0, borderRadius: "0.375rem", fontSize: "0.8125rem" }}
                          wrapLongLines={true}
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {textContent}
                </Markdown>
              </div>
            )}
            {toolUses?.map((tool, i) => (
              <div key={i} className="flex items-baseline gap-2 text-xs text-muted-foreground">
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
        return (
          <div key={index} className="text-sm text-muted-foreground select-text">
            {content}
          </div>
        );
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
        return null;
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

  const promptForm = (
    <form onSubmit={handleSubmit} className="max-w-3xl w-full mx-auto px-6 py-6">
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
          placeholder={sessionId ? "Follow up..." : "Ask anything..."}
          rows={3}
          autoFocus
          className="resize-none text-base bg-background pr-12"
        />
        <button
          type={isRunning ? "button" : "submit"}
          onClick={isRunning ? stopClaude : undefined}
          disabled={!isRunning && !message.trim()}
          className={cn(
            "absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-colors",
            isRunning
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : message.trim()
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground"
          )}
        >
          {isRunning ? (
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <rect x="1" y="1" width="10" height="10" rx="1" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 12V4M4 8l4-4 4 4" />
            </svg>
          )}
        </button>
      </div>
    </form>
  );

  return (
    <main className="h-screen flex overflow-hidden">
      {/* Sidebar */}
      <aside className={cn(
        "border-r flex flex-col bg-muted/30 transition-all duration-200 relative z-10",
        sidebarOpen ? "w-64" : "w-0 border-r-0"
      )}>
        <div className={cn(
          "flex flex-col h-full overflow-hidden w-64",
          sidebarOpen ? "opacity-100" : "opacity-0"
        )}>
          {/* Titlebar area with toggle button next to traffic lights */}
          <div className="h-12 relative shrink-0">
            <div className="absolute inset-0" data-tauri-drag-region />
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="absolute left-[85px] top-1/2 -translate-y-[calc(50%+2px)] p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground z-10"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
              </svg>
            </button>
          </div>
          <div className="px-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="plans" className="flex-1">Plans</TabsTrigger>
                <TabsTrigger value="agents" className="flex-1">Agents</TabsTrigger>
              </TabsList>
              <TabsContent value="plans" className="mt-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 hover:bg-muted"
                  onClick={startNewPlan}
                  disabled={isRunning}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                  New plan
                </Button>
                {plans.length > 0 ? (
                  <div className="mt-2 space-y-0.5">
                    {plans.map((plan) => (
                      <button
                        key={plan}
                        onClick={() => selectPlan(plan)}
                        className={cn(
                          "w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors truncate",
                          selectedPlan === plan
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                      >
                        {kebabToTitle(plan)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground px-1 mt-2">No plans yet</p>
                )}
              </TabsContent>
              <TabsContent value="agents" className="mt-4">
                <p className="text-sm text-muted-foreground px-1">No agents yet</p>
              </TabsContent>
            </Tabs>
          </div>
          <div className="mt-auto px-4 py-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate">{folderPath.split("/").pop()}</span>
              <Button variant="ghost" size="sm" onClick={selectFolder} disabled={isRunning}>
                Change
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Toggle button and drag region when sidebar is closed */}
      {!sidebarOpen && (
        <div className="absolute top-0 left-0 h-12 w-32 z-50">
          <div className="absolute inset-0" data-tauri-drag-region />
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute left-[85px] top-1/2 -translate-y-[calc(50%+2px)] p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground z-10"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
            </svg>
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedPlan && planContent ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="h-12 shrink-0 flex items-center justify-between px-6 border-b" data-tauri-drag-region>
              <h2 className="text-lg font-medium">{kebabToTitle(selectedPlan)}</h2>
              <Button variant="ghost" size="sm" onClick={closePlanViewer}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </Button>
            </div>
            <div className="flex-1 overflow-auto">
              <div className="max-w-3xl mx-auto px-6 py-6 prose prose-neutral prose-sm prose-pre:p-0 [&>*:last-child]:!mb-0 max-w-none select-text">
                <Markdown
                  components={{
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      const inline = !match;
                      return !inline ? (
                        <SyntaxHighlighter
                          style={atomOneDark}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{ margin: 0, borderRadius: "0.375rem", fontSize: "0.8125rem" }}
                          wrapLongLines={true}
                        >
                          {String(children).replace(/\n$/, "")}
                        </SyntaxHighlighter>
                      ) : (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {planContent}
                </Markdown>
              </div>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <>
          <div className="h-12 shrink-0" data-tauri-drag-region />
          <div className="flex-1 flex items-center justify-center pb-20 select-none">
            <form onSubmit={handleSubmit} className="max-w-3xl w-full mx-auto px-6">
              {activeTab === "plans" && (
                <h2 className="text-2xl font-medium text-center mb-6 select-none cursor-default">Create a plan</h2>
              )}
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
                  placeholder={activeTab === "plans" ? "What do you want to do?" : "Ask anything..."}
                  rows={5}
                  autoFocus
                  className="resize-none text-base bg-background pr-12"
                />
                <button
                  type={isRunning ? "button" : "submit"}
                  onClick={isRunning ? stopClaude : undefined}
                  disabled={!isRunning && !message.trim()}
                  className={cn(
                    "absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-colors",
                    isRunning
                      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      : message.trim()
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {isRunning ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                      <rect x="1" y="1" width="10" height="10" rx="1" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 12V4M4 8l4-4 4 4" />
                    </svg>
                  )}
                </button>
              </div>
            </form>
          </div>
          </>
        ) : (
          <>
            <div className="h-12 shrink-0" data-tauri-drag-region />
            <div className={`flex-1 overflow-auto select-none scroll-container ${showScrollbar ? "is-scrolling" : ""}`} ref={scrollRef} onScroll={handleScroll}>
              <div className="max-w-3xl mx-auto px-6 pt-0 pb-4 space-y-3 overflow-hidden">
                {messages.map((msg, i) => renderMessage(msg, i))}
              </div>
            </div>

            <div className="select-none border-t">
              {promptForm}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default App;
