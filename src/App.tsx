import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { SplitView } from "@/components/SplitView";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { prdPrompt, ralphFormatPrompt } from "@/prompts";

interface ClaudeMessage {
  type: string;
  subtype?: string;
  message?: {
    role?: string;
    // content can be a string (user messages from JSONL) or array (assistant messages)
    content?: string | Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }>;
  };
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  content?: string;
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  session_id?: string;
}

interface SessionPlanLink {
  session_id: string;
  plan_file_name: string;
  link_type: "plan" | "ralph_prd";
  created_at: string;
  updated_at: string;
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
  const prevPlansRef = useRef<string[]>([]);
  const plansDebounceRef = useRef<number | null>(null);

  // Ralph PRD state
  const [ralphPrds, setRalphPrds] = useState<string[]>([]);
  const [selectedRalphPrd, setSelectedRalphPrd] = useState<string | null>(null);
  const [ralphPrdContent, setRalphPrdContent] = useState<string | null>(null);
  const [ralphLinkedSessionId, setRalphLinkedSessionId] = useState<string | null>(null);
  const prevRalphPrdsRef = useRef<string[]>([]);
  const ralphPrdsDebounceRef = useRef<number | null>(null);
  const selectedRalphPrdRef = useRef<string | null>(null);
  const activeTabRef = useRef(activeTab);
  const isRunningRef = useRef(isRunning);
  const sessionIdRef = useRef(sessionId);

  // Split view state
  const [splitPosition, setSplitPosition] = useState(50);
  const [linkedSessionId, setLinkedSessionId] = useState<string | null>(null);
  // Right panel needs padding when sidebar is closed AND left panel is nearly collapsed
  const leftPanelCollapsed = splitPosition < 6;
  const rightPanelNeedsPadding = !sidebarOpen && leftPanelCollapsed;

  // Keep refs in sync with state
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

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

    // Initial load
    handlePlansChange(true);

    // Start watching for file changes
    invoke("watch_plans", { folderPath }).catch((err) => {
      console.error("Failed to start watching plans:", err);
    });

    // Single listener for all plan changes - debounced to let filesystem settle
    let unlisten: UnlistenFn | null = null;
    listen("plans-changed", () => {
      // Debounce: wait for filesystem events to settle
      if (plansDebounceRef.current) {
        clearTimeout(plansDebounceRef.current);
      }
      plansDebounceRef.current = window.setTimeout(() => {
        handlePlansChange(false);
      }, 100);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
      if (plansDebounceRef.current) clearTimeout(plansDebounceRef.current);
    };
  }, [folderPath]);

  // Ralph PRD file watching
  useEffect(() => {
    if (!folderPath) return;

    // Initial load
    handleRalphPrdsChange(true);

    // Start watching for file changes
    invoke("watch_ralph_prds", { folderPath }).catch((err) => {
      console.error("Failed to start watching ralph prds:", err);
    });

    // Listener for ralph PRD changes
    let unlisten: UnlistenFn | null = null;
    listen("ralph-prd-changed", () => {
      if (ralphPrdsDebounceRef.current) {
        clearTimeout(ralphPrdsDebounceRef.current);
      }
      ralphPrdsDebounceRef.current = window.setTimeout(() => {
        handleRalphPrdsChange(false);
      }, 100);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
      if (ralphPrdsDebounceRef.current) clearTimeout(ralphPrdsDebounceRef.current);
    };
  }, [folderPath]);

  useEffect(() => {
    selectedRalphPrdRef.current = selectedRalphPrd;
  }, [selectedRalphPrd]);

  // Handle plans list changes - detect renames, additions, removals
  async function handlePlansChange(isInitialLoad: boolean) {
    if (!folderPath) return;

    try {
      const newPlans = await invoke<string[]>("list_plans", { folderPath });
      const oldPlans = prevPlansRef.current;
      const selected = selectedPlanRef.current;

      // Find what changed
      const added = newPlans.filter(p => !oldPlans.includes(p));
      const removed = oldPlans.filter(p => !newPlans.includes(p));

      // Update plans list
      setPlans(newPlans);
      prevPlansRef.current = newPlans;

      // Skip selection logic on initial load
      if (isInitialLoad) return;

      // Detect rename: exactly one added and one removed, and the removed one was selected
      if (added.length === 1 && removed.length === 1 && selected === removed[0]) {
        const oldName = removed[0];
        const newName = added[0];

        // Update selection to new name (keep existing content - it's the same)
        selectedPlanRef.current = newName;
        setSelectedPlan(newName);

        // Update the session link
        invoke("update_plan_link_filename", {
          folderPath,
          oldName,
          newName,
        }).catch((err) => {
          console.error("Failed to update plan link filename:", err);
        });

        return;
      }

      // Detect new plan created (while Claude is running = auto-select)
      if (added.length === 1 && removed.length === 0) {
        // Check if we should auto-select (only when Claude is actively creating a plan)
        setIsRunning((running) => {
          if (running) {
            const newPlan = added[0];
            selectPlan(newPlan, false);

            // Link to current session
            setSessionId((currentSessionId) => {
              if (currentSessionId) {
                invoke("save_session_link", {
                  folderPath,
                  sessionId: currentSessionId,
                  planFileName: newPlan,
                }).then(() => {
                  setLinkedSessionId(currentSessionId);
                }).catch((err) => {
                  console.error("Failed to save session link:", err);
                });
              }
              return currentSessionId;
            });
          }
          return running;
        });
        return;
      }

      // Detect removal: if selected plan was removed, clear selection
      if (selected && removed.includes(selected) && !added.includes(selected)) {
        selectedPlanRef.current = null;
        setSelectedPlan(null);
        setPlanContent(null);
        return;
      }

      // Detect modification: if selected plan still exists, reload its content
      if (selected && newPlans.includes(selected) && added.length === 0 && removed.length === 0) {
        reloadSelectedPlan();
      }
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
      // Don't clear the selection on read errors - keep showing the current content.
      // The "removed" event handler will clear selection if the file was actually deleted.
      // This prevents the view from closing due to file watcher timing issues during renames.
      console.warn("Failed to reload plan (keeping current content):", err);
    }
  }

  async function selectPlan(planName: string, autoLoadHistory = true) {
    if (!folderPath) return;

    // Clear ralph PRD selection
    setSelectedRalphPrd(null);
    setRalphPrdContent(null);
    setRalphLinkedSessionId(null);
    selectedRalphPrdRef.current = null;

    setSelectedPlan(planName);

    try {
      const content = await invoke<string>("read_plan", { folderPath, planName });
      setPlanContent(content);
    } catch (err) {
      console.error("Failed to read plan:", err);
      setPlanContent(null);
    }

    // Check for linked session
    if (autoLoadHistory) {
      try {
        const link = await invoke<SessionPlanLink | null>("get_link_by_plan", {
          folderPath,
          planFileName: planName,
        });

        if (link) {
          setLinkedSessionId(link.session_id);
          setSessionId(link.session_id);

          // Load chat history
          try {
            const history = await invoke<ClaudeMessage[]>("load_session_history", {
              folderPath,
              sessionId: link.session_id,
            });
            setMessages(history);
          } catch (historyErr) {
            console.error("Failed to load session history:", historyErr);
            setMessages([]);
          }
        } else {
          setLinkedSessionId(null);
          // Don't clear session if we're in the middle of creating a plan
          if (!isRunning) {
            setSessionId(null);
            setMessages([]);
          }
        }
      } catch (err) {
        console.error("Failed to get plan link:", err);
        setLinkedSessionId(null);
      }
    }
  }

  // Handle ralph PRDs list changes
  async function handleRalphPrdsChange(isInitialLoad: boolean) {
    if (!folderPath) return;
    try {
      const newPrds = await invoke<string[]>("list_ralph_prds", { folderPath });
      const oldPrds = prevRalphPrdsRef.current;

      const added = newPrds.filter((p) => !oldPrds.includes(p));
      const removed = oldPrds.filter((p) => !newPrds.includes(p));

      setRalphPrds(newPrds);
      prevRalphPrdsRef.current = newPrds;

      if (isInitialLoad) return;

      // Auto-select newly created PRD if Claude is running (creating it)
      if (added.length === 1 && removed.length === 0 && isRunningRef.current && activeTabRef.current === "ralph") {
        selectRalphPrd(added[0], false);
        // Link session to this PRD
        const currentSessionId = sessionIdRef.current;
        if (currentSessionId) {
          invoke("save_ralph_link", {
            folderPath,
            sessionId: currentSessionId,
            prdFileName: added[0],
          })
            .then(() => {
              setRalphLinkedSessionId(currentSessionId);
            })
            .catch(console.error);
        }
      }

      // If selected was removed, clear selection
      if (selectedRalphPrdRef.current && removed.includes(selectedRalphPrdRef.current)) {
        setSelectedRalphPrd(null);
        setRalphPrdContent(null);
        selectedRalphPrdRef.current = null;
      }
    } catch (err) {
      console.error("Failed to load ralph prds:", err);
    }
  }

  async function selectRalphPrd(prdName: string, autoLoadHistory = true) {
    if (!folderPath) return;

    // Clear plan selection
    setSelectedPlan(null);
    setPlanContent(null);
    setLinkedSessionId(null);
    selectedPlanRef.current = null;

    selectedRalphPrdRef.current = prdName;
    setSelectedRalphPrd(prdName);

    try {
      const content = await invoke<string>("read_ralph_prd", { folderPath, prdName });
      setRalphPrdContent(content);
    } catch (err) {
      console.error("Failed to read ralph prd:", err);
      setRalphPrdContent(null);
    }

    if (autoLoadHistory) {
      try {
        const link = await invoke<SessionPlanLink | null>("get_link_by_ralph_prd", {
          folderPath,
          prdFileName: prdName,
        });
        if (link) {
          setRalphLinkedSessionId(link.session_id);
          setSessionId(link.session_id);
          const history = await invoke<ClaudeMessage[]>("load_session_history", {
            folderPath,
            sessionId: link.session_id,
          });
          // Skip the first user message (the hidden prompt)
          const filteredHistory = history.length > 0 && history[0].type === "user"
            ? history.slice(1)
            : history;
          setMessages(filteredHistory);
        } else {
          setRalphLinkedSessionId(null);
          if (!isRunning) {
            setSessionId(null);
            setMessages([]);
          }
        }
      } catch (err) {
        console.error("Failed to get ralph link:", err);
      }
    }
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
    setLinkedSessionId(null);
    selectedPlanRef.current = null;
    // Clear ralph PRD state too
    setSelectedRalphPrd(null);
    setRalphPrdContent(null);
    setRalphLinkedSessionId(null);
    selectedRalphPrdRef.current = null;
    setSplitPosition(50);
  }

  function createRalphSession() {
    if (!planContent || !folderPath || !selectedPlan) return;

    const planFileName = selectedPlan; // Store before clearing

    // Clear plan selection (exit split view)
    setSelectedPlan(null);
    setPlanContent(null);
    setLinkedSessionId(null);
    selectedPlanRef.current = null;

    // Clear Ralph PRD selection too
    setSelectedRalphPrd(null);
    setRalphPrdContent(null);
    setRalphLinkedSessionId(null);
    selectedRalphPrdRef.current = null;

    // Clear session state
    setMessages([]);
    setSessionId(null);

    // Switch to Ralph tab
    setActiveTab("ralph");

    // Compose message with ralph prompt + plan filename instruction + plan content
    const fullMessage = `${ralphFormatPrompt}\n\nPlan filename: ${planFileName}.md\nOutput the JSON to: .trellico/ralph-prd/${planFileName}.json\n\n${planContent}`;

    // Start Claude session (no user message shown - the prompt is hidden)
    bufferRef.current = "";
    shouldAutoScroll.current = true;
    setIsRunning(true);

    invoke("run_claude", {
      message: fullMessage,
      folderPath,
      sessionId: null,
    }).catch((err) => {
      setMessages((prev) => [...prev, { type: "system", content: `Error: ${err}` }]);
      setIsRunning(false);
    });
  }

  async function stopClaude() {
    try {
      await invoke("stop_claude");
      setIsRunning(false);
    } catch (err) {
      console.error("Failed to stop Claude:", err);
    }
  }

  // Strip known prompt prefixes from user messages (e.g., PRD prompt)
  function stripPromptPrefix(content: string): string {
    // Look for the ending marker of the PRD prompt
    const prdMarker = "Below is the user prompt with the feature description:";
    const prdIndex = content.indexOf(prdMarker);
    if (prdIndex !== -1) {
      return content.slice(prdIndex + prdMarker.length).trim();
    }
    return content;
  }

  function renderMessage(msg: ClaudeMessage, index: number) {
    if (msg.type === "system" && msg.subtype === "init") {
      return null;
    }

    switch (msg.type) {
      case "assistant": {
        // Handle content as array (normal case) - safely check it's an array first
        const contentArray = Array.isArray(msg.message?.content) ? msg.message.content : [];
        const textContent = contentArray
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n");
        const toolUses = contentArray.filter((c) => c.type === "tool_use");

        if (!textContent && (!toolUses || toolUses.length === 0)) {
          return null;
        }

        return (
          <div key={index} className="space-y-1">
            {textContent && (
              <Streamdown
                className="prose prose-neutral prose-sm max-w-none select-text [&>*:last-child]:mb-0"
                plugins={{ code }}
              >
                {textContent}
              </Streamdown>
            )}
            {toolUses?.map((tool, i) => {
              const inputJson = tool.input ? JSON.stringify(tool.input) : "";
              const isLarge = inputJson.length > 200;

              if (isLarge) {
                return (
                  <details key={i} className="group text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground flex items-center gap-1.5 list-none [&::-webkit-details-marker]:hidden">
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0 transition-transform group-open:rotate-90"
                      >
                        <path d="M6 4l4 4-4 4" />
                      </svg>
                      <span className="font-mono text-primary font-medium">{tool.name}</span>
                      <code className="text-[10px] text-muted-foreground/70 truncate">
                        {inputJson}
                      </code>
                    </summary>
                    <pre className="mt-2 ml-4 text-[10px] text-muted-foreground/70 bg-muted/30 p-3 rounded-md overflow-auto max-h-48 whitespace-pre-wrap break-all">
                      {JSON.stringify(tool.input, null, 2)}
                    </pre>
                  </details>
                );
              }

              return (
                <div key={i} className="flex items-baseline gap-2 text-xs text-muted-foreground">
                  <span className="font-mono text-primary font-medium">{tool.name}</span>
                  {tool.input && (
                    <code className="text-[10px] text-muted-foreground/70">
                      {inputJson}
                    </code>
                  )}
                </div>
              );
            })}
          </div>
        );
      }
      case "user": {
        // Handle both formats: content as string (from JSONL) or content as array (from stream)
        let content: string | undefined;
        if (typeof msg.message?.content === "string") {
          content = msg.message.content;
        } else if (Array.isArray(msg.message?.content)) {
          content = msg.message.content.map((c) => c.text).join("\n");
        } else {
          content = msg.content;
        }
        if (!content?.trim()) {
          return null;
        }
        // Strip prompt prefixes (e.g., PRD prompt) from displayed content
        const displayContent = stripPromptPrefix(content);
        if (!displayContent.trim()) {
          return null;
        }
        return (
          <div key={index} className="text-sm bg-primary/10 rounded-lg px-3 py-2 select-text">
            {displayContent}
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
                <TabsTrigger value="ralph" className="flex-1">Ralph</TabsTrigger>
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
              <TabsContent value="ralph" className="mt-0">
                {ralphPrds.length > 0 ? (
                  <div className="mt-2 space-y-0.5">
                    {ralphPrds.map((prd) => (
                      <button
                        key={prd}
                        onClick={() => selectRalphPrd(prd)}
                        className={cn(
                          "w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors truncate",
                          selectedRalphPrd === prd
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                      >
                        {kebabToTitle(prd)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground px-1 mt-2">No Ralph PRDs yet</p>
                )}
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
          /* Split view when plan is selected */
          <SplitView
            leftPanel={
              <div className="flex flex-col h-full">
                <div className={cn("h-12 shrink-0 flex items-center px-4 border-b", !sidebarOpen && "pl-32")} data-tauri-drag-region>
                  <span className="text-sm font-medium text-muted-foreground">Chat</span>
                </div>
                {messages.length > 0 ? (
                  <>
                    <div className={`flex-1 overflow-auto select-none scroll-container ${showScrollbar ? "is-scrolling" : ""}`} ref={scrollRef} onScroll={handleScroll}>
                      <div className="px-4 pt-4 pb-4 space-y-3 overflow-hidden">
                        {messages.map((msg, i) => renderMessage(msg, i))}
                      </div>
                    </div>
                    <div className="select-none border-t p-4">
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
                          placeholder="Follow up..."
                          rows={2}
                          className="resize-none text-sm bg-background pr-10"
                        />
                        <button
                          type={isRunning ? "button" : "submit"}
                          onClick={isRunning ? stopClaude : (e) => handleSubmit(e as unknown as React.FormEvent)}
                          disabled={!isRunning && !message.trim()}
                          className={cn(
                            "absolute bottom-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-colors",
                            isRunning
                              ? "bg-primary text-primary-foreground hover:bg-primary/90"
                              : message.trim()
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "bg-muted text-muted-foreground"
                          )}
                        >
                          {isRunning ? (
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                              <rect x="1" y="1" width="10" height="10" rx="1" />
                            </svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M8 12V4M4 8l4-4 4 4" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center p-4">
                    <p className="text-sm text-muted-foreground text-center">
                      {linkedSessionId ? "Loading chat history..." : "No chat history for this plan"}
                    </p>
                  </div>
                )}
              </div>
            }
            rightPanel={
              <div className="flex flex-col h-full">
                <div className={cn("h-12 shrink-0 flex items-center justify-between px-4 border-b gap-2", rightPanelNeedsPadding && "pl-32")} data-tauri-drag-region>
                  <h2 className="text-sm font-medium truncate min-w-0">{selectedPlan}.md</h2>
                  <Button
                    size="sm"
                    onClick={createRalphSession}
                    disabled={isRunning}
                  >
                    Create Ralph Session
                  </Button>
                </div>
                <div className="flex-1 overflow-auto px-4 py-4">
                  <Streamdown
                    className="prose prose-neutral prose-sm max-w-none select-text"
                    plugins={{ code }}
                  >
                    {planContent}
                  </Streamdown>
                </div>
              </div>
            }
            splitPosition={splitPosition}
            onSplitChange={setSplitPosition}
          />
        ) : selectedRalphPrd && ralphPrdContent ? (
          /* Split view when ralph PRD is selected */
          <SplitView
            leftPanel={
              <div className="flex flex-col h-full">
                <div className={cn("h-12 shrink-0 flex items-center px-4 border-b", !sidebarOpen && "pl-32")} data-tauri-drag-region>
                  <span className="text-sm font-medium text-muted-foreground">Chat</span>
                </div>
                {messages.length > 0 ? (
                  <>
                    <div className={`flex-1 overflow-auto select-none scroll-container ${showScrollbar ? "is-scrolling" : ""}`} ref={scrollRef} onScroll={handleScroll}>
                      <div className="px-4 pt-4 pb-4 space-y-3 overflow-hidden">
                        {messages.map((msg, i) => renderMessage(msg, i))}
                      </div>
                    </div>
                    <div className="select-none border-t p-4">
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
                          placeholder="Follow up..."
                          rows={2}
                          className="resize-none text-sm bg-background pr-10"
                        />
                        <button
                          type={isRunning ? "button" : "submit"}
                          onClick={isRunning ? stopClaude : (e) => handleSubmit(e as unknown as React.FormEvent)}
                          disabled={!isRunning && !message.trim()}
                          className={cn(
                            "absolute bottom-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-colors",
                            isRunning
                              ? "bg-primary text-primary-foreground hover:bg-primary/90"
                              : message.trim()
                                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                : "bg-muted text-muted-foreground"
                          )}
                        >
                          {isRunning ? (
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                              <rect x="1" y="1" width="10" height="10" rx="1" />
                            </svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M8 12V4M4 8l4-4 4 4" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center p-4">
                    <p className="text-sm text-muted-foreground text-center">
                      {ralphLinkedSessionId ? "Loading chat history..." : "No chat history for this Ralph PRD"}
                    </p>
                  </div>
                )}
              </div>
            }
            rightPanel={
              <div className="flex flex-col h-full">
                <div className={cn("h-12 shrink-0 flex items-center px-4 border-b", rightPanelNeedsPadding && "pl-32")} data-tauri-drag-region>
                  <h2 className="text-sm font-medium truncate">{selectedRalphPrd}.json</h2>
                </div>
                <div className="flex-1 overflow-auto">
                  <pre className="px-4 py-4 text-sm font-mono whitespace-pre-wrap select-text">
                    {ralphPrdContent}
                  </pre>
                </div>
              </div>
            }
            splitPosition={splitPosition}
            onSplitChange={setSplitPosition}
          />
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
