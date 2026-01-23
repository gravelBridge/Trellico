import React, { useState, useCallback, useEffect, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

import { useAutoScroll, useAISession, usePlans, useRalphPrds, useRalphIterations } from "@/hooks";
import type { AIMessage, GeneratingItem, FolderSession, Provider } from "@/types";
import { useMessageStore, useFolderContext } from "@/contexts";
import { Welcome } from "@/components/Welcome";
import { Sidebar } from "@/components/Sidebar";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorDialog } from "@/components/ErrorDialog";
import { UpdateChecker } from "@/components/UpdateChecker";
import { PlanSplitView } from "@/components/PlanSplitView";
import { RalphPrdSplitView } from "@/components/RalphPrdSplitView";
import { MessageList } from "@/components/MessageList";
import { PromptInput } from "@/components/PromptInput";
import { prdPrompt, ralphFormatPrompt } from "@/prompts";
import { kebabToTitle } from "@/lib/formatting";

function App() {
  // Folder context for multi-folder support
  const folderContext = useFolderContext();
  const {
    folders,
    activeFolderPath,
    activeFolder,
    addFolder,
    removeFolder,
    setActiveFolder,
    setActiveTab: setFolderActiveTab,
    setSplitPosition: setFolderSplitPosition,
    setGeneratingItems,
    setSelectedGeneratingItemId,
    setSelectedPlan: setFolderSelectedPlan,
    setSelectedRalphPrd: setFolderSelectedRalphPrd,
    setSelectedRalphIteration: setFolderSelectedRalphIteration,
    setProvider,
  } = folderContext;

  // Get current folder state with defaults
  const folderPath = activeFolderPath;
  const activeTab = activeFolder?.activeTab ?? "plans";
  const splitPosition = activeFolder?.splitPosition ?? 50;
  const generatingItems = useMemo(
    () => activeFolder?.generatingItems ?? [],
    [activeFolder?.generatingItems]
  );
  const selectedGeneratingItemId = activeFolder?.selectedGeneratingItemId ?? null;
  const savedSelectedPlan = activeFolder?.selectedPlan ?? null;
  const savedSelectedRalphPrd = activeFolder?.selectedRalphPrd ?? null;
  const savedSelectedRalphIteration = activeFolder?.selectedRalphIteration ?? null;

  // Track previous folder path for detecting folder switches
  const prevFolderPathRef = React.useRef<string | null>(null);

  // UI state
  const [message, setMessage] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [closeFolderDialog, setCloseFolderDialog] = useState<{ isOpen: boolean; path: string | null }>({
    isOpen: false,
    path: null,
  });
  const [providerMismatchError, setProviderMismatchError] = useState<string | null>(null);

  // Wrapper functions for local state setters that update folder context
  const setActiveTab = useCallback((tab: string) => {
    setFolderActiveTab(tab as "plans" | "ralph");
  }, [setFolderActiveTab]);

  const setSplitPosition = useCallback((position: number) => {
    setFolderSplitPosition(position);
  }, [setFolderSplitPosition]);

  const addGeneratingItem = useCallback((item: Omit<GeneratingItem, "sessionId">, itemProvider?: Provider) => {
    const fullItem: GeneratingItem = {
      ...item,
      sessionId: `__pending__${item.id}`,
      provider: itemProvider,
    };
    // Add to beginning so newest appears first
    setGeneratingItems(prev => [fullItem, ...prev]);
    // Auto-select the new generating item
    setSelectedGeneratingItemId(item.id);
  }, [setGeneratingItems, setSelectedGeneratingItemId]);

  const updateGeneratingItemSessionId = useCallback((processId: string, sessionId: string) => {
    setGeneratingItems(prev => prev.map(item =>
      item.id === processId ? { ...item, sessionId } : item
    ));
  }, [setGeneratingItems]);

  const removeGeneratingItemByType = useCallback((type: "plan" | "ralph_prd") => {
    setGeneratingItems(prev => {
      const idx = prev.findIndex(i => i.type === type);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
    // Clear selection - the plan/prd is now created and will be auto-selected
    setSelectedGeneratingItemId(null);
  }, [setGeneratingItems, setSelectedGeneratingItemId]);

  const removeGeneratingItemBySessionId = useCallback((sessionId: string) => {
    setGeneratingItems(prev => prev.filter(i => i.sessionId !== sessionId));
    // Clear selection if the removed item was selected
    const removedItem = generatingItems.find(i => i.sessionId === sessionId);
    if (removedItem && selectedGeneratingItemId === removedItem.id) {
      setSelectedGeneratingItemId(null);
    }
  }, [setGeneratingItems, setSelectedGeneratingItemId, generatingItems, selectedGeneratingItemId]);

  // Message store
  const store = useMessageStore();
  const messages = store.viewedMessages;
  const isViewingRunning = store.isViewingRunningSession;

  // Store ralph iterations handlers in refs that can be updated
  const handleAIExitRef = React.useRef<((messages: AIMessage[], sessionId: string) => void) | null>(null);
  const handleSessionIdReceivedRef = React.useRef<((processId: string, sessionId: string) => void) | null>(null);

  // Provider from folder context
  const provider = activeFolder?.provider ?? "claude_code";

  // AI session hook - callbacks use refs to get latest handlers
  const aiExitCallback = useCallback((msgs: AIMessage[], sessionId: string) => {
    handleAIExitRef.current?.(msgs, sessionId);
  }, []);
  const sessionIdReceivedCallback = useCallback((processId: string, sessionId: string) => {
    handleSessionIdReceivedRef.current?.(processId, sessionId);
  }, []);

  const { runAI, stopAI, aiError, clearAIError } = useAISession({
    onAIExit: aiExitCallback,
    onSessionIdReceived: sessionIdReceivedCallback,
  });

  // Auto-scroll hook
  const { scrollRef, showScrollbar, handleScroll, resetAutoScroll } = useAutoScroll(messages);

  // Plans hook
  const {
    plans,
    selectedPlan,
    planContent,
    linkedSessionId,
    selectPlan,
    clearSelection: clearPlanSelection,
    handleSessionIdReceived: handlePlanSessionIdReceived,
    loadRecentSession,
  } = usePlans({
    folderPath,
    onPlanLinked: useCallback((sessionId: string) => removeGeneratingItemBySessionId(sessionId), [removeGeneratingItemBySessionId]),
  });

  // Ralph iterations hook (declared early for callback)
  // Create a wrapper for runAI that includes the current provider
  const runAIForRalph = useCallback(
    (message: string, folderPath: string, sessionId: string | null) => {
      return runAI(message, folderPath, sessionId, provider);
    },
    [runAI, provider]
  );

  const ralphIterations = useRalphIterations({
    folderPath,
    runAI: runAIForRalph,
    onAutoSelectIteration: useCallback(() => setActiveTab("ralph"), [setActiveTab]),
  });

  // Stable callback for auto-select (uses ref pattern to avoid dependency on ralphIterations)
  const clearIterationSelectionRef = React.useRef(ralphIterations.clearIterationSelection);
  useEffect(() => {
    clearIterationSelectionRef.current = ralphIterations.clearIterationSelection;
  }, [ralphIterations.clearIterationSelection]);
  const handleAutoSelectPrd = useCallback(() => {
    clearIterationSelectionRef.current();
  }, []);

  // Ref to track generating items for session ID lookup (avoids callback recreation)
  const generatingItemsRef = React.useRef(generatingItems);
  useEffect(() => {
    generatingItemsRef.current = generatingItems;
  }, [generatingItems]);

  // Callback to get session ID for a PRD by looking up the generating item
  const getSessionIdForPrd = useCallback((prdName: string): string | null => {
    const item = generatingItemsRef.current.find(
      i => i.type === "ralph_prd" && i.targetName === prdName
    );
    return item?.sessionId ?? null;
  }, []);

  // Ralph PRDs hook
  const {
    ralphPrds,
    selectedRalphPrd,
    ralphPrdContent,
    ralphLinkedSessionId,
    selectRalphPrd,
    clearSelection: clearRalphSelection,
  } = useRalphPrds({
    folderPath,
    onAutoSelectPrd: handleAutoSelectPrd,
    onPrdCreated: useCallback(() => removeGeneratingItemByType("ralph_prd"), [removeGeneratingItemByType]),
    getSessionIdForPrd,
  });

  // Update the refs with the current handlers
  useEffect(() => {
    handleAIExitRef.current = ralphIterations.handleAIExit;
  }, [ralphIterations.handleAIExit]);
  const handleRalphSessionIdReceived = ralphIterations.handleSessionIdReceived;
  useEffect(() => {
    handleSessionIdReceivedRef.current = (processId: string, sessionId: string) => {
      handleRalphSessionIdReceived(processId, sessionId);
      handlePlanSessionIdReceived(processId, sessionId);
      updateGeneratingItemSessionId(processId, sessionId);
    };
  }, [handleRalphSessionIdReceived, handlePlanSessionIdReceived, updateGeneratingItemSessionId]);

  // Sync hook selections to FolderContext (save state when selections change)
  useEffect(() => {
    if (folderPath) {
      setFolderSelectedPlan(selectedPlan);
    }
  }, [folderPath, selectedPlan, setFolderSelectedPlan]);

  useEffect(() => {
    if (folderPath) {
      setFolderSelectedRalphPrd(selectedRalphPrd);
    }
  }, [folderPath, selectedRalphPrd, setFolderSelectedRalphPrd]);

  useEffect(() => {
    if (folderPath) {
      setFolderSelectedRalphIteration(ralphIterations.selectedIteration);
    }
  }, [folderPath, ralphIterations.selectedIteration, setFolderSelectedRalphIteration]);

  // Refs for restore functions to avoid stale closures
  const selectPlanRef = React.useRef(selectPlan);
  const selectRalphPrdRef = React.useRef(selectRalphPrd);
  const selectIterationRef = React.useRef(ralphIterations.selectIteration);
  const clearPlanSelectionRef = React.useRef(clearPlanSelection);
  const clearRalphSelectionRef = React.useRef(clearRalphSelection);
  const storeRef = React.useRef(store);
  const resetAutoScrollRef = React.useRef(resetAutoScroll);
  const loadRecentSessionRef = React.useRef(loadRecentSession);

  useEffect(() => {
    selectPlanRef.current = selectPlan;
    selectRalphPrdRef.current = selectRalphPrd;
    selectIterationRef.current = ralphIterations.selectIteration;
    clearPlanSelectionRef.current = clearPlanSelection;
    clearRalphSelectionRef.current = clearRalphSelection;
    storeRef.current = store;
    resetAutoScrollRef.current = resetAutoScroll;
    loadRecentSessionRef.current = loadRecentSession;
  }, [selectPlan, selectRalphPrd, ralphIterations.selectIteration, clearPlanSelection, clearRalphSelection, store, resetAutoScroll, loadRecentSession]);

  // Restore selections when switching folders
  useEffect(() => {
    const prevPath = prevFolderPathRef.current;
    const didFolderChange = prevPath !== null && prevPath !== folderPath;
    prevFolderPathRef.current = folderPath;

    // Only run restore logic when folder actually changes (not on other dep changes)
    if (!didFolderChange || !folderPath) return;

    // Track if effect is still active for async cleanup
    let isActive = true;

    // Folder changed - restore saved state immediately (hooks clear state synchronously now)
    // Check if a generating item is selected AND matches the active tab
    if (selectedGeneratingItemId) {
      const item = generatingItems.find(i => i.id === selectedGeneratingItemId);
      // Only restore generating item's session if its type matches the active tab
      const itemMatchesTab = item?.type === "plan" ? activeTab === "plans" : activeTab === "ralph";
      if (item?.sessionId && itemMatchesTab) {
        // Load the generating item's session
        const sessionId = item.sessionId;
        const runningMessages = storeRef.current.getRunningSessionMessages(sessionId);
        if (runningMessages) {
          storeRef.current.viewSession(sessionId, undefined, item.provider);
        } else {
          invoke<AIMessage[]>("db_get_session_messages", {
            sessionId,
          }).then((history) => {
            if (isActive) {
              storeRef.current.viewSession(sessionId, history, item.provider);
            }
          }).catch(() => {
            if (isActive) {
              storeRef.current.viewSession(sessionId, [], item.provider);
            }
          });
        }
        resetAutoScrollRef.current();
        return;
      }
    }

    if (savedSelectedRalphIteration) {
      // Restore ralph iteration selection (loads PRD content and iteration session)
      selectRalphPrdRef.current(savedSelectedRalphIteration.prd, false);
      selectIterationRef.current(savedSelectedRalphIteration.prd, savedSelectedRalphIteration.iteration);
    } else if (savedSelectedRalphPrd && activeTab === "ralph") {
      // Restore ralph PRD selection (loads PRD content and session)
      selectRalphPrdRef.current(savedSelectedRalphPrd);
    } else if (savedSelectedPlan && activeTab === "plans") {
      // Restore plan selection (loads plan content and session)
      selectPlanRef.current(savedSelectedPlan);
    } else {
      // Nothing selected - clear selections and load recent session for this folder
      clearPlanSelectionRef.current();
      clearRalphSelectionRef.current();
      clearIterationSelectionRef.current();
      // Load the most recent session for this folder instead of clearing
      loadRecentSessionRef.current();
    }
    resetAutoScrollRef.current();

    return () => {
      isActive = false;
    };
  }, [folderPath, selectedGeneratingItemId, generatingItems, savedSelectedRalphIteration, savedSelectedRalphPrd, savedSelectedPlan, activeTab]);

  // Load recent session on initial folder load (when no plan/prd is selected)
  // Track the folder path we've done initial load for (not just a boolean)
  // This allows initial load to run again when switching to a completely new folder after closing all
  const initialLoadFolderRef = React.useRef<string | null>(null);
  useEffect(() => {
    // Reset when all folders are closed
    if (!folderPath) {
      initialLoadFolderRef.current = null;
      return;
    }

    // Skip if we've already done initial load for this folder
    if (initialLoadFolderRef.current === folderPath) return;
    initialLoadFolderRef.current = folderPath;

    // Only load if nothing is selected
    if (!savedSelectedPlan && !savedSelectedRalphPrd && !savedSelectedRalphIteration) {
      loadRecentSession();
    }
  }, [folderPath, savedSelectedPlan, savedSelectedRalphPrd, savedSelectedRalphIteration, loadRecentSession]);

  // Load unlinked sessions (sessions without a plan) when folder changes
  const unlinkedSessionsLoadedRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!folderPath) {
      unlinkedSessionsLoadedRef.current = null;
      return;
    }

    // Skip if we've already loaded for this folder
    if (unlinkedSessionsLoadedRef.current === folderPath) return;
    unlinkedSessionsLoadedRef.current = folderPath;

    let isActive = true;

    async function loadUnlinkedSessions() {
      try {
        const sessions = await invoke<FolderSession[]>('db_get_folder_sessions', {
          folderPath,
        });

        // Filter for sessions without a linked plan
        const unlinkedSessions = sessions.filter(s => !s.linked_plan);
        if (!isActive || unlinkedSessions.length === 0) return;

        // For each session, get the first user message to use as display name
        const items: GeneratingItem[] = [];
        for (const session of unlinkedSessions) {
          // Check if we already have a generating item for this session
          const existing = generatingItemsRef.current.find(g => g.sessionId === session.id);
          if (existing) continue;

          // Get first message to use as display name
          let displayName = "Plan Chat";
          try {
            const messages = await invoke<AIMessage[]>('db_get_session_messages', {
              sessionId: session.id,
            });
            const firstUserMsg = messages.find(m => m.type === "user");
            if (firstUserMsg?.content) {
              // Truncate long messages
              const content = typeof firstUserMsg.content === 'string' ? firstUserMsg.content : '';
              displayName = content.length > 50 ? content.slice(0, 50) + "..." : content;
            }
          } catch {
            // Failed to get messages, use default display name
          }

          items.push({
            id: session.id,
            displayName,
            type: "plan",
            sessionId: session.id,
            provider: session.provider as Provider,
          });
        }

        if (isActive && items.length > 0) {
          setGeneratingItems(prev => [...items, ...prev]);
        }
      } catch {
        // Failed to load sessions
      }
    }

    loadUnlinkedSessions();

    return () => {
      isActive = false;
    };
  }, [folderPath, setGeneratingItems]);

  // Handle start ralphing
  function handleStartRalphing() {
    if (!selectedRalphPrd) return;
    ralphIterations.startRalphing(selectedRalphPrd);
    resetAutoScroll();
  }

  // Handle stop - stops only the currently viewed session
  function handleStop() {
    if (!isViewingRunning) return;

    // Find the processId for the viewed session and stop only that one
    const activeSessionId = store.state.activeSessionId;
    if (activeSessionId) {
      const processId = store.getSessionProcessId(activeSessionId);
      if (processId) {
        stopAI(processId);
      }
    }

    // Only stop ralphing if the viewed session is the current ralphing iteration
    if (ralphIterations.isRalphing && ralphIterations.currentProcessId) {
      const ralphSessionId = store.getProcessSessionId(ralphIterations.currentProcessId);
      if (ralphSessionId === activeSessionId) {
        ralphIterations.stopRalphing();
      }
    }
  }

  // Handle select ralph iteration
  function handleSelectRalphIteration(prdName: string, iterationNumber: number) {
    // Just view the iteration - don't stop any running iteration
    // Select the PRD (loads content for split view, but skip history - iteration will load its own)
    selectRalphPrd(prdName, false);
    ralphIterations.selectIteration(prdName, iterationNumber);
    // Only clear generating item selection if it's a ralph_prd type
    if (getSelectedGeneratingItemType() === "ralph_prd") {
      setSelectedGeneratingItemId(null);
    }
    setActiveTab("ralph");
    resetAutoScroll();
  }

  // Folder selection
  async function selectFolder() {
    const selected = await open({
      directory: true,
      multiple: false,
    });

    if (selected) {
      await invoke("setup_folder", { folderPath: selected });
      addFolder(selected);
    }
  }

  // Handle closing a folder
  async function handleCloseFolder(path: string) {
    // Check if folder has running processes
    if (store.hasFolderRunning(path)) {
      // Show warning dialog
      setCloseFolderDialog({ isOpen: true, path });
      return;
    }
    // Stop watching the folder
    await invoke("stop_watching_folder", { folderPath: path });
    removeFolder(path);
  }

  // Force close a folder (stops all running processes)
  async function forceCloseFolder(path: string) {
    // Stop all running processes in this folder
    const processes = store.getFolderProcesses(path);
    for (const processId of processes) {
      await stopAI(processId);
    }
    // Stop watching the folder
    await invoke("stop_watching_folder", { folderPath: path });
    removeFolder(path);
    setCloseFolderDialog({ isOpen: false, path: null });
  }

  // Handle message submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Only block if the currently viewed session is running
    if (!message.trim() || !folderPath || isViewingRunning) return;

    const isNewSession = !store.state.activeSessionId;

    // Check provider match when continuing an existing session
    if (!isNewSession && store.state.activeSessionProvider && store.state.activeSessionProvider !== provider) {
      const sessionProvider = store.state.activeSessionProvider === "claude_code" ? "Claude Code" : "Amp";
      setProviderMismatchError(`This session was started with ${sessionProvider}. Please switch to ${sessionProvider} to continue.`);
      return;
    }

    resetAutoScroll();

    // Only prepend prompt for new sessions in plans tab
    const fullMessage =
      isNewSession && activeTab === "plans" ? `${prdPrompt}\n\n${message}` : message;

    try {
      // Pass the user's message to display (always show what the user typed)
      const processId = await runAI(fullMessage, folderPath, store.state.activeSessionId, provider, message);

      // Add generating item for new plan sessions
      if (isNewSession && activeTab === "plans" && processId) {
        addGeneratingItem({
          id: processId,
          displayName: message.trim(),
          type: "plan",
        }, provider);
      }
    } catch {
      // Error already handled in hook
    }
    setMessage("");
  }

  // Start a new plan session
  function startNewPlan() {
    store.clearView();
    setMessage("");
    clearPlanSelection();
    // Only clear generating item selection if it's a plan type
    if (getSelectedGeneratingItemType() === "plan") {
      setSelectedGeneratingItemId(null);
    }
    setSplitPosition(50);
  }

  // Create Ralph session from selected plan
  function createRalphSession() {
    if (!planContent || !folderPath || !selectedPlan) return;

    const planFileName = selectedPlan;

    // Clear selections
    clearPlanSelection();
    clearRalphSelection();

    // Switch to Ralph tab
    setActiveTab("ralph");

    // Compose message with ralph prompt + plan filename instruction + plan content
    const fullMessage = `${ralphFormatPrompt}\n\nPlan filename: ${planFileName}.md\nOutput the JSON to: .trellico/ralph/${planFileName}/prd.json\n\n${planContent}`;

    // Start AI session (no user message shown - the prompt is hidden)
    resetAutoScroll();

    runAI(fullMessage, folderPath, null, provider).then((processId) => {
      if (processId) {
        addGeneratingItem({
          id: processId,
          displayName: `Converting ${kebabToTitle(planFileName)}...`,
          type: "ralph_prd",
          targetName: planFileName,
        }, provider);
      }
    }).catch(() => {
      // Error already handled in hook
    });
  }

  // Helper to get the type of the currently selected generating item
  const getSelectedGeneratingItemType = () => {
    if (!selectedGeneratingItemId) return null;
    return generatingItems.find(i => i.id === selectedGeneratingItemId)?.type ?? null;
  };

  // Handle plan selection
  function handleSelectPlan(planName: string) {
    selectPlan(planName);
    // Only clear generating item selection if it's a plan type
    if (getSelectedGeneratingItemType() === "plan") {
      setSelectedGeneratingItemId(null);
    }
    setActiveTab("plans");
    resetAutoScroll();
  }

  // Handle ralph PRD selection
  function handleSelectRalphPrd(prdName: string) {
    ralphIterations.clearIterationSelection();
    selectRalphPrd(prdName);
    // Only clear generating item selection if it's a ralph_prd type
    if (getSelectedGeneratingItemType() === "ralph_prd") {
      setSelectedGeneratingItemId(null);
    }
    setActiveTab("ralph");
    resetAutoScroll();
  }

  // View existing Ralph session from plan
  function handleViewRalphSession() {
    if (!selectedPlan) return;
    handleSelectRalphPrd(selectedPlan);
  }

  // Handle selecting a generating item (view its in-progress session)
  function handleSelectGeneratingItem(item: GeneratingItem) {
    // Use the stored sessionId from the item (persists even after process ends)
    const sessionId = item.sessionId;
    if (sessionId) {
      // Only clear selections within the same tab
      if (item.type === "plan") {
        clearPlanSelection();
      } else {
        clearRalphSelection();
        ralphIterations.clearIterationSelection();
      }
      setSelectedGeneratingItemId(item.id);
      // View the running session (or its cached messages if still running)
      // For completed sessions, try to load from store's running sessions first
      const runningMessages = store.getRunningSessionMessages(sessionId);
      if (runningMessages) {
        store.viewSession(sessionId, undefined, item.provider);
      } else {
        // Process has ended - load session history from database
        invoke<AIMessage[]>("db_get_session_messages", {
          sessionId,
        }).then((history) => {
          store.viewSession(sessionId, history, item.provider);
        }).catch(() => {
          // Session might not exist yet or failed - just view empty
          store.viewSession(sessionId, [], item.provider);
        });
      }
      // Switch to appropriate tab
      setActiveTab(item.type === "plan" ? "plans" : "ralph");
      resetAutoScroll();
    }
  }

  // Handle tab change (preserve selections, reload session history)
  function handleTabChange(tab: string) {
    setActiveTab(tab);
    // Reset auto-scroll so we scroll to bottom when messages load
    resetAutoScroll();

    // Check if a generating item for this tab is selected
    const selectedGeneratingItem = generatingItems.find(i => i.id === selectedGeneratingItemId);
    const generatingItemMatchesTab = selectedGeneratingItem && (
      (tab === "plans" && selectedGeneratingItem.type === "plan") ||
      (tab === "ralph" && selectedGeneratingItem.type === "ralph_prd")
    );

    if (generatingItemMatchesTab && selectedGeneratingItem) {
      // Reload the generating item's session
      const sessionId = selectedGeneratingItem.sessionId;
      const runningMessages = store.getRunningSessionMessages(sessionId);
      if (runningMessages) {
        store.viewSession(sessionId, undefined, selectedGeneratingItem.provider);
      } else {
        invoke<AIMessage[]>("db_get_session_messages", {
          sessionId,
        }).then((history) => {
          store.viewSession(sessionId, history, selectedGeneratingItem.provider);
        }).catch(() => {
          store.viewSession(sessionId, [], selectedGeneratingItem.provider);
        });
      }
      return;
    }

    // Reload the session history for the selected item in the target tab
    if (tab === "plans") {
      if (selectedPlan) {
        selectPlan(selectedPlan);
      } else {
        // No plan selected - clear view so EmptyState shows
        store.viewSession(null);
      }
    } else if (tab === "ralph") {
      const iteration = ralphIterations.selectedIteration;
      if (iteration) {
        // Reload iteration's session (PRD content should already be loaded)
        ralphIterations.selectIteration(iteration.prd, iteration.iteration);
      } else if (selectedRalphPrd) {
        // Reload PRD's session
        selectRalphPrd(selectedRalphPrd);
      } else {
        // No PRD selected - clear view so EmptyState shows
        store.viewSession(null);
      }
    }
  }

  // Build folder tabs data
  const folderTabs = folders.map(f => ({
    path: f.path,
    name: f.path.split("/").pop() || f.path,
    isRunning: store.hasFolderRunning(f.path),
  }));

  // Keyboard shortcuts for folder switching (Cmd+1/2/3/...)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only handle Cmd+1-9 for folder switching
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "9") {
        const index = parseInt(e.key, 10) - 1;
        if (index < folders.length) {
          e.preventDefault();
          setActiveFolder(folders[index].path);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [folders, setActiveFolder]);

  // Render welcome screen
  if (!folderPath) {
    return (
      <>
        <Welcome onSelectFolder={selectFolder} />
        <UpdateChecker />
      </>
    );
  }

  // Render main layout
  return (
    <main className="h-screen flex overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        plans={plans}
        selectedPlan={selectedPlan}
        onSelectPlan={handleSelectPlan}
        onNewPlan={startNewPlan}
        ralphPrds={ralphPrds}
        selectedRalphPrd={selectedRalphPrd}
        onSelectRalphPrd={handleSelectRalphPrd}
        folderPath={folderPath}
        ralphIterations={ralphIterations.iterations}
        selectedRalphIteration={ralphIterations.selectedIteration}
        onSelectRalphIteration={handleSelectRalphIteration}
        generatingPlans={generatingItems.filter(i => i.type === "plan")}
        generatingRalphPrds={generatingItems.filter(i => i.type === "ralph_prd")}
        onSelectGeneratingItem={handleSelectGeneratingItem}
        selectedGeneratingItemId={selectedGeneratingItemId}
        // Multi-folder props
        folders={folderTabs}
        activeFolderPath={activeFolderPath}
        onSelectFolder={setActiveFolder}
        onCloseFolder={handleCloseFolder}
        onAddFolder={selectFolder}
        // Provider props
        provider={provider}
        onProviderChange={setProvider}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === "plans" && selectedPlan && planContent ? (
          <PlanSplitView
            messages={messages}
            scrollRef={scrollRef}
            showScrollbar={showScrollbar}
            onScroll={handleScroll}
            inputValue={message}
            onInputChange={setMessage}
            onSubmit={handleSubmit}
            onStop={() => stopAI()}
            isRunning={isViewingRunning}
            linkedSessionId={linkedSessionId}
            sidebarOpen={sidebarOpen}
            selectedPlan={selectedPlan}
            planContent={planContent}
            splitPosition={splitPosition}
            onSplitChange={setSplitPosition}
            onCreateRalphSession={createRalphSession}
            ralphPrds={ralphPrds}
            onViewRalphSession={handleViewRalphSession}
          />
        ) : activeTab === "ralph" && selectedRalphPrd && ralphPrdContent ? (
          <RalphPrdSplitView
            messages={messages}
            scrollRef={scrollRef}
            showScrollbar={showScrollbar}
            onScroll={handleScroll}
            inputValue={message}
            onInputChange={setMessage}
            onSubmit={handleSubmit}
            onStop={handleStop}
            isRunning={isViewingRunning}
            ralphLinkedSessionId={ralphLinkedSessionId}
            sidebarOpen={sidebarOpen}
            selectedRalphPrd={selectedRalphPrd}
            ralphPrdContent={ralphPrdContent}
            splitPosition={splitPosition}
            onSplitChange={setSplitPosition}
            onStartRalphing={handleStartRalphing}
            isRalphing={ralphIterations.isRalphing}
            ralphingPrd={ralphIterations.ralphingPrd}
            isViewingIteration={ralphIterations.selectedIteration !== null}
            iterations={ralphIterations.iterations[selectedRalphPrd] || []}
            selectedIterationNumber={ralphIterations.selectedIteration?.iteration ?? null}
          />
        ) : ((activeTab === "plans" && !selectedPlan) || (activeTab === "ralph" && !selectedRalphPrd)) && !store.state.activeSessionId ? (
          <EmptyState
            inputValue={message}
            onInputChange={setMessage}
            onSubmit={handleSubmit}
            onStop={() => stopAI()}
            isRunning={isViewingRunning}
            activeTab={activeTab}
          />
        ) : (
          <>
            <div className="h-12 shrink-0" data-tauri-drag-region />
            <MessageList
              messages={messages}
              scrollRef={scrollRef}
              showScrollbar={showScrollbar}
              onScroll={handleScroll}
            />
            <div className="select-none border-t relative">
              {isViewingRunning && (
                <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden z-10">
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
              )}
              <form onSubmit={handleSubmit} className="max-w-3xl w-full mx-auto px-6 py-6">
                <PromptInput
                  value={message}
                  onChange={setMessage}
                  onSubmit={handleSubmit}
                  onStop={() => stopAI()}
                  isRunning={isViewingRunning}
                  placeholder={store.state.activeSessionId ? "Follow up..." : "Ask anything..."}
                  rows={3}
                  autoFocus
                />
              </form>
            </div>
          </>
        )}
      </div>

      {/* Close folder confirmation dialog */}
      <ConfirmDialog
        isOpen={closeFolderDialog.isOpen}
        title="Close folder?"
        message="This folder has running processes. Closing it will stop all running processes. Are you sure?"
        confirmLabel="Close"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => {
          if (closeFolderDialog.path) {
            forceCloseFolder(closeFolderDialog.path);
          }
        }}
        onCancel={() => setCloseFolderDialog({ isOpen: false, path: null })}
      />

      {/* AI Provider error dialog */}
      <ErrorDialog
        isOpen={aiError !== null}
        title={aiError?.type === "not_installed" ? "Provider Not Installed" : aiError?.type === "not_logged_in" ? "Provider Not Logged In" : "Provider Error"}
        message={aiError?.authInstructions ? `${aiError.message}\n\n${aiError.authInstructions}` : aiError?.message ?? ""}
        onClose={clearAIError}
      />

      {/* Provider mismatch error dialog */}
      <ErrorDialog
        isOpen={providerMismatchError !== null}
        title="Provider Mismatch"
        message={providerMismatchError ?? ""}
        onClose={() => setProviderMismatchError(null)}
      />

      {/* Auto-update checker */}
      <UpdateChecker />
    </main>
  );
}

export default App;
