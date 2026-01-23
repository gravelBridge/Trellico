import React, { useState, useCallback, useEffect, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

import {
  useAutoScroll,
  useAISession,
  usePlans,
  useRalphPrds,
  useRalphIterations,
  useGeneratingItems,
  useSessionManagement,
} from "@/hooks";
import type { AIMessage, Provider } from "@/types";
import { useMessageStore, useFolderContext } from "@/contexts";
import { loadSessionToView } from "@/lib/sessionLoader";
import { Welcome } from "@/components/Welcome";
import { Sidebar } from "@/components/Sidebar";
import { EmptyState } from "@/components/EmptyState";
import { ChatView } from "@/components/ChatView";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorDialog } from "@/components/ErrorDialog";
import { UpdateChecker } from "@/components/UpdateChecker";
import { PlanSplitView } from "@/components/PlanSplitView";
import { RalphPrdSplitView } from "@/components/RalphPrdSplitView";
import { prdPrompt, ralphFormatPrompt } from "@/prompts";
import { kebabToTitle } from "@/lib/formatting";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  const [closeFolderDialog, setCloseFolderDialog] = useState<{
    isOpen: boolean;
    path: string | null;
  }>({ isOpen: false, path: null });
  const [providerMismatchError, setProviderMismatchError] = useState<string | null>(null);

  // Wrapper functions for folder context setters
  const setActiveTab = useCallback(
    (tab: string) => setFolderActiveTab(tab as "plans" | "ralph"),
    [setFolderActiveTab]
  );
  const setSplitPosition = useCallback(
    (position: number) => setFolderSplitPosition(position),
    [setFolderSplitPosition]
  );

  // Message store
  const store = useMessageStore();
  const messages = store.viewedMessages;
  const isViewingRunning = store.isViewingRunningSession;

  // Provider from folder context
  const provider = activeFolder?.provider ?? "claude_code";

  // Generating items hook
  const {
    addGeneratingItem,
    updateGeneratingItemSessionId,
    removeGeneratingItemByType,
    removeGeneratingItemBySessionId,
    getSelectedGeneratingItemType,
    getSessionIdForPrd,
  } = useGeneratingItems({
    folderPath,
    generatingItems,
    selectedGeneratingItemId,
    setGeneratingItems,
    setSelectedGeneratingItemId,
  });

  // Store ralph iterations handlers in refs that can be updated
  const handleAIExitRef = React.useRef<((messages: AIMessage[], sessionId: string) => void) | null>(
    null
  );
  const handleSessionIdReceivedRef = React.useRef<
    ((processId: string, sessionId: string) => void) | null
  >(null);

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
    onPlanLinked: useCallback(
      (sessionId: string) => removeGeneratingItemBySessionId(sessionId),
      [removeGeneratingItemBySessionId]
    ),
  });

  // Ralph iterations hook
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
    onPrdCreated: useCallback(
      () => removeGeneratingItemByType("ralph_prd"),
      [removeGeneratingItemByType]
    ),
    getSessionIdForPrd,
  });

  // Session management hook (rename/delete dialogs)
  const sessionManagement = useSessionManagement({
    folderPath,
    generatingItems,
    selectedGeneratingItemId,
    selectedRalphPrd,
    setGeneratingItems,
    setSelectedGeneratingItemId,
    clearRalphSelection,
    clearIterationSelection: ralphIterations.clearIterationSelection,
    clearSessionView: () => store.viewSession(null),
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
    if (!folderPath) return;
    setFolderSelectedPlan(selectedPlan);
    setFolderSelectedRalphPrd(selectedRalphPrd);
    setFolderSelectedRalphIteration(ralphIterations.selectedIteration);
  }, [
    folderPath,
    selectedPlan,
    selectedRalphPrd,
    ralphIterations.selectedIteration,
    setFolderSelectedPlan,
    setFolderSelectedRalphPrd,
    setFolderSelectedRalphIteration,
  ]);

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
  }, [
    selectPlan,
    selectRalphPrd,
    ralphIterations.selectIteration,
    clearPlanSelection,
    clearRalphSelection,
    store,
    resetAutoScroll,
    loadRecentSession,
  ]);

  // Restore selections when switching folders
  useEffect(() => {
    const prevPath = prevFolderPathRef.current;
    const didFolderChange = prevPath !== null && prevPath !== folderPath;
    prevFolderPathRef.current = folderPath;

    if (!didFolderChange || !folderPath) return;

    let isActive = true;

    // Check if a generating item is selected AND matches the active tab
    if (selectedGeneratingItemId) {
      const item = generatingItems.find((i) => i.id === selectedGeneratingItemId);
      const itemMatchesTab = item?.type === "plan" ? activeTab === "plans" : activeTab === "ralph";
      if (item?.sessionId && itemMatchesTab) {
        loadSessionToView(item.sessionId, storeRef.current, item.provider).then(() => {
          if (isActive) resetAutoScrollRef.current();
        });
        return;
      }
    }

    if (savedSelectedRalphIteration) {
      selectRalphPrdRef.current(savedSelectedRalphIteration.prd, false);
      selectIterationRef.current(savedSelectedRalphIteration.prd, savedSelectedRalphIteration.iteration);
    } else if (savedSelectedRalphPrd && activeTab === "ralph") {
      selectRalphPrdRef.current(savedSelectedRalphPrd);
    } else if (savedSelectedPlan && activeTab === "plans") {
      selectPlanRef.current(savedSelectedPlan);
    } else {
      clearPlanSelectionRef.current();
      clearRalphSelectionRef.current();
      clearIterationSelectionRef.current();
      loadRecentSessionRef.current();
    }
    resetAutoScrollRef.current();

    return () => {
      isActive = false;
    };
  }, [
    folderPath,
    selectedGeneratingItemId,
    generatingItems,
    savedSelectedRalphIteration,
    savedSelectedRalphPrd,
    savedSelectedPlan,
    activeTab,
  ]);

  // Load recent session on initial folder load
  const initialLoadFolderRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (!folderPath) {
      initialLoadFolderRef.current = null;
      return;
    }
    if (initialLoadFolderRef.current === folderPath) return;
    initialLoadFolderRef.current = folderPath;

    if (!savedSelectedPlan && !savedSelectedRalphPrd && !savedSelectedRalphIteration) {
      loadRecentSession();
    }
  }, [folderPath, savedSelectedPlan, savedSelectedRalphPrd, savedSelectedRalphIteration, loadRecentSession]);

  // Event handlers
  function handleStartRalphing() {
    if (!selectedRalphPrd) return;
    ralphIterations.startRalphing(selectedRalphPrd);
    resetAutoScroll();
  }

  function handleStop() {
    if (!isViewingRunning) return;

    const activeSessionId = store.state.activeSessionId;
    if (activeSessionId) {
      const processId = store.getSessionProcessId(activeSessionId);
      if (processId) stopAI(processId);
    }

    if (ralphIterations.isRalphing && ralphIterations.currentProcessId) {
      const ralphSessionId = store.getProcessSessionId(ralphIterations.currentProcessId);
      if (ralphSessionId === activeSessionId) {
        ralphIterations.stopRalphing();
      }
    }
  }

  function handleSelectRalphIteration(prdName: string, iterationNumber: number) {
    selectRalphPrd(prdName, false);
    ralphIterations.selectIteration(prdName, iterationNumber);
    if (getSelectedGeneratingItemType() === "ralph_prd") {
      setSelectedGeneratingItemId(null);
    }
    setActiveTab("ralph");
    resetAutoScroll();
  }

  async function selectFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      await invoke("setup_folder", { folderPath: selected });
      addFolder(selected);
    }
  }

  async function handleCloseFolder(path: string) {
    if (store.hasFolderRunning(path)) {
      setCloseFolderDialog({ isOpen: true, path });
      return;
    }
    await invoke("stop_watching_folder", { folderPath: path });
    removeFolder(path);
  }

  async function forceCloseFolder(path: string) {
    const processes = store.getFolderProcesses(path);
    for (const processId of processes) {
      await stopAI(processId);
    }
    await invoke("stop_watching_folder", { folderPath: path });
    removeFolder(path);
    setCloseFolderDialog({ isOpen: false, path: null });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim() || !folderPath || isViewingRunning) return;

    const isNewSession = !store.state.activeSessionId;

    // Check provider match when continuing an existing session
    if (
      !isNewSession &&
      store.state.activeSessionProvider &&
      store.state.activeSessionProvider !== provider
    ) {
      const sessionProvider =
        store.state.activeSessionProvider === "claude_code" ? "Claude Code" : "Amp";
      setProviderMismatchError(
        `This session was started with ${sessionProvider}. Please switch to ${sessionProvider} to continue.`
      );
      return;
    }

    resetAutoScroll();

    const fullMessage =
      isNewSession && activeTab === "plans" ? `${prdPrompt}\n\n${message}` : message;

    try {
      const processId = await runAI(
        fullMessage,
        folderPath,
        store.state.activeSessionId,
        provider,
        message
      );

      if (isNewSession && activeTab === "plans" && processId) {
        addGeneratingItem({ id: processId, displayName: message.trim(), type: "plan" }, provider);
      }
    } catch {
      // Error already handled in hook
    }
    setMessage("");
  }

  function startNewPlan() {
    store.clearView();
    setMessage("");
    clearPlanSelection();
    if (getSelectedGeneratingItemType() === "plan") {
      setSelectedGeneratingItemId(null);
    }
    setSplitPosition(50);
  }

  function createRalphSession() {
    if (!planContent || !folderPath || !selectedPlan) return;

    const planFileName = selectedPlan;
    clearPlanSelection();
    clearRalphSelection();
    setActiveTab("ralph");

    const fullMessage = `${ralphFormatPrompt}\n\nPlan filename: ${planFileName}.md\nOutput the JSON to: .trellico/ralph/${planFileName}/prd.json\n\n${planContent}`;

    resetAutoScroll();
    runAI(fullMessage, folderPath, null, provider)
      .then((processId) => {
        if (processId) {
          addGeneratingItem(
            {
              id: processId,
              displayName: `Converting ${kebabToTitle(planFileName)}...`,
              type: "ralph_prd",
              targetName: planFileName,
            },
            provider
          );
        }
      })
      .catch(() => {
        // Error already handled in hook
      });
  }

  function handleSelectPlan(planName: string) {
    selectPlan(planName);
    if (getSelectedGeneratingItemType() === "plan") {
      setSelectedGeneratingItemId(null);
    }
    setActiveTab("plans");
    resetAutoScroll();
  }

  function handleSelectRalphPrd(prdName: string) {
    ralphIterations.clearIterationSelection();
    selectRalphPrd(prdName);
    if (getSelectedGeneratingItemType() === "ralph_prd") {
      setSelectedGeneratingItemId(null);
    }
    setActiveTab("ralph");
    resetAutoScroll();
  }

  function handleViewRalphSession() {
    if (!selectedPlan) return;
    handleSelectRalphPrd(selectedPlan);
  }

  async function handleSelectGeneratingItem(item: { id: string; sessionId: string; type: string; provider?: Provider }) {
    const sessionId = item.sessionId;
    if (!sessionId) return;

    if (item.type === "plan") {
      clearPlanSelection();
    } else {
      clearRalphSelection();
      ralphIterations.clearIterationSelection();
    }
    setSelectedGeneratingItemId(item.id);
    await loadSessionToView(sessionId, store, item.provider);
    setActiveTab(item.type === "plan" ? "plans" : "ralph");
    resetAutoScroll();
  }

  async function handleTabChange(tab: string) {
    setActiveTab(tab);
    resetAutoScroll();

    const selectedGeneratingItem = generatingItems.find((i) => i.id === selectedGeneratingItemId);
    const generatingItemMatchesTab =
      selectedGeneratingItem &&
      ((tab === "plans" && selectedGeneratingItem.type === "plan") ||
        (tab === "ralph" && selectedGeneratingItem.type === "ralph_prd"));

    if (generatingItemMatchesTab && selectedGeneratingItem) {
      await loadSessionToView(selectedGeneratingItem.sessionId, store, selectedGeneratingItem.provider);
      return;
    }

    if (tab === "plans") {
      if (selectedPlan) {
        selectPlan(selectedPlan);
      } else {
        store.viewSession(null);
      }
    } else if (tab === "ralph") {
      const iteration = ralphIterations.selectedIteration;
      if (iteration) {
        ralphIterations.selectIteration(iteration.prd, iteration.iteration);
      } else if (selectedRalphPrd) {
        selectRalphPrd(selectedRalphPrd);
      } else {
        store.viewSession(null);
      }
    }
  }

  // Build folder tabs data
  const folderTabs = folders.map((f) => ({
    path: f.path,
    name: f.path.split("/").pop() || f.path,
    isRunning: store.hasFolderRunning(f.path),
  }));

  // Keyboard shortcuts for folder switching
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
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

  // Determine main content view
  const showPlanSplitView = activeTab === "plans" && selectedPlan && planContent;
  const showRalphSplitView = activeTab === "ralph" && selectedRalphPrd && ralphPrdContent;
  const showEmptyState =
    ((activeTab === "plans" && !selectedPlan) || (activeTab === "ralph" && !selectedRalphPrd)) &&
    !store.state.activeSessionId;

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
        generatingPlans={generatingItems.filter((i) => i.type === "plan")}
        generatingRalphPrds={generatingItems.filter((i) => i.type === "ralph_prd")}
        onSelectGeneratingItem={handleSelectGeneratingItem}
        selectedGeneratingItemId={selectedGeneratingItemId}
        folders={folderTabs}
        activeFolderPath={activeFolderPath}
        onSelectFolder={setActiveFolder}
        onCloseFolder={handleCloseFolder}
        onAddFolder={selectFolder}
        provider={provider}
        onProviderChange={setProvider}
        onRenameSession={sessionManagement.handleRenameSession}
        onDeleteSession={sessionManagement.handleDeleteSession}
        onRenameRalphPrd={sessionManagement.handleRenameRalphPrd}
        onDeleteRalphPrd={sessionManagement.handleDeleteRalphPrd}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        {showPlanSplitView ? (
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
        ) : showRalphSplitView ? (
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
        ) : showEmptyState ? (
          <EmptyState
            inputValue={message}
            onInputChange={setMessage}
            onSubmit={handleSubmit}
            onStop={() => stopAI()}
            isRunning={isViewingRunning}
            activeTab={activeTab}
          />
        ) : (
          <ChatView
            messages={messages}
            scrollRef={scrollRef}
            showScrollbar={showScrollbar}
            onScroll={handleScroll}
            inputValue={message}
            onInputChange={setMessage}
            onSubmit={handleSubmit}
            onStop={() => stopAI()}
            isRunning={isViewingRunning}
            placeholder={store.state.activeSessionId ? "Follow up..." : "Ask anything..."}
          />
        )}
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={closeFolderDialog.isOpen}
        title="Close folder?"
        message="This folder has running processes. Closing it will stop all running processes. Are you sure?"
        confirmLabel="Close"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => closeFolderDialog.path && forceCloseFolder(closeFolderDialog.path)}
        onCancel={() => setCloseFolderDialog({ isOpen: false, path: null })}
      />

      <ErrorDialog
        isOpen={aiError !== null}
        title={
          aiError?.type === "not_installed"
            ? "Provider Not Installed"
            : aiError?.type === "not_logged_in"
              ? "Provider Not Logged In"
              : "Provider Error"
        }
        message={
          aiError?.authInstructions
            ? `${aiError.message}\n\n${aiError.authInstructions}`
            : aiError?.message ?? ""
        }
        onClose={clearAIError}
      />

      <ErrorDialog
        isOpen={providerMismatchError !== null}
        title="Provider Mismatch"
        message={providerMismatchError ?? ""}
        onClose={() => setProviderMismatchError(null)}
      />

      <Dialog
        open={sessionManagement.renameDialog.isOpen}
        onOpenChange={(open) => !open && sessionManagement.closeRenameDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Rename {sessionManagement.renameDialog.type === "session" ? "Chat" : "PRD"}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={sessionManagement.renameValue}
            onChange={(e) => sessionManagement.setRenameValue(e.target.value)}
            placeholder="Enter new name"
            onKeyDown={(e) => e.key === "Enter" && sessionManagement.confirmRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={sessionManagement.closeRenameDialog}>
              Cancel
            </Button>
            <Button onClick={sessionManagement.confirmRename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={sessionManagement.deleteConfirmDialog.isOpen}
        title={`Delete ${sessionManagement.deleteConfirmDialog.type === "session" ? "Chat" : "PRD Data"}?`}
        message={
          sessionManagement.deleteConfirmDialog.type === "session"
            ? `Are you sure you want to delete "${sessionManagement.deleteConfirmDialog.name}"? This will delete the chat history but not any associated plan file.`
            : `Are you sure you want to delete the iteration data for "${sessionManagement.deleteConfirmDialog.name}"? This will delete all iterations and their chat history but not the PRD file.`
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={sessionManagement.confirmDelete}
        onCancel={sessionManagement.closeDeleteDialog}
      />

      <UpdateChecker />
    </main>
  );
}

export default App;
