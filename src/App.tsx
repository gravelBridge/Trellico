import React, { useState, useCallback, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

import { useAutoScroll, useClaudeSession, usePlans, useRalphPrds, useRalphIterations } from "@/hooks";
import { useMessageStore } from "@/contexts";
import { FolderSelection } from "@/components/FolderSelection";
import { Sidebar } from "@/components/Sidebar";
import { EmptyState } from "@/components/EmptyState";
import { PlanSplitView } from "@/components/PlanSplitView";
import { RalphPrdSplitView } from "@/components/RalphPrdSplitView";
import { MessageList } from "@/components/MessageList";
import { PromptInput } from "@/components/PromptInput";
import { prdPrompt, ralphFormatPrompt } from "@/prompts";

function App() {
  // Folder state
  const [folderPath, setFolderPath] = useState<string | null>(null);

  // UI state
  const [message, setMessage] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("plans");
  const [splitPosition, setSplitPosition] = useState(50);

  // Message store
  const store = useMessageStore();
  const messages = store.viewedMessages;
  const isViewingRunning = store.isViewingRunningSession;

  // Store ralph iterations handler in a ref that can be updated
  const handleClaudeExitRef = React.useRef<((messages: import("@/types").ClaudeMessage[], sessionId: string) => void) | null>(null);

  // Claude session hook - callback uses ref to get latest handler
  const claudeExitCallback = useCallback((msgs: import("@/types").ClaudeMessage[], sessionId: string) => {
    handleClaudeExitRef.current?.(msgs, sessionId);
  }, []);

  const { runClaude, stopClaude } = useClaudeSession({ onClaudeExit: claudeExitCallback });

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
  } = usePlans({
    folderPath,
  });

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
    activeTab,
  });

  // Ralph iterations hook
  const ralphIterations = useRalphIterations({
    folderPath,
    runClaude,
  });

  // Update the ref with the current handleClaudeExit
  useEffect(() => {
    handleClaudeExitRef.current = ralphIterations.handleClaudeExit;
  }, [ralphIterations.handleClaudeExit]);

  // Handle start ralphing
  function handleStartRalphing() {
    if (!selectedRalphPrd) return;
    ralphIterations.startRalphing(selectedRalphPrd);
    resetAutoScroll();
  }

  // Handle stop (combines stopClaude and stopRalphing)
  function handleStop() {
    stopClaude();
    if (ralphIterations.isRalphing) {
      ralphIterations.stopRalphing();
    }
  }

  // Handle select ralph iteration
  function handleSelectRalphIteration(prdName: string, iterationNumber: number) {
    // Stop current ralphing if switching to a different PRD or iteration
    if (ralphIterations.isRalphing && ralphIterations.ralphingPrd !== prdName) {
      ralphIterations.stopRalphing();
    }
    ralphIterations.selectIteration(prdName, iterationNumber);
  }

  // Folder selection
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

  // Handle message submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Only block if the currently viewed session is running
    if (!message.trim() || !folderPath || isViewingRunning) return;

    const isNewSession = !store.state.viewedSessionId;

    resetAutoScroll();

    // Only prepend prompt for new sessions in plans tab
    const fullMessage =
      isNewSession && activeTab === "plans" ? `${prdPrompt}\n\n${message}` : message;

    try {
      // Pass the user's message to display (always show what the user typed)
      await runClaude(fullMessage, folderPath, store.state.viewedSessionId, message);
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
    clearRalphSelection();
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

    // Start Claude session (no user message shown - the prompt is hidden)
    resetAutoScroll();

    runClaude(fullMessage, folderPath, null).catch(() => {
      // Error already handled in hook
    });
  }

  // Handle plan selection (clear ralph selection first)
  function handleSelectPlan(planName: string) {
    clearRalphSelection();
    selectPlan(planName);
  }

  // Handle ralph PRD selection (clear plan selection first)
  function handleSelectRalphPrd(prdName: string) {
    clearPlanSelection();
    ralphIterations.clearIterationSelection();
    selectRalphPrd(prdName);
  }

  // Render folder selection screen
  if (!folderPath) {
    return <FolderSelection onSelectFolder={selectFolder} />;
  }

  // Render main layout
  return (
    <main className="h-screen flex overflow-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        plans={plans}
        selectedPlan={selectedPlan}
        onSelectPlan={handleSelectPlan}
        onNewPlan={startNewPlan}
        ralphPrds={ralphPrds}
        selectedRalphPrd={selectedRalphPrd}
        onSelectRalphPrd={handleSelectRalphPrd}
        folderPath={folderPath}
        onChangeFolder={selectFolder}
        isRunning={store.hasAnyRunning()}
        ralphIterations={ralphIterations.iterations}
        selectedRalphIteration={ralphIterations.selectedIteration}
        onSelectRalphIteration={handleSelectRalphIteration}
        ralphingPrd={ralphIterations.ralphingPrd}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedPlan && planContent ? (
          <PlanSplitView
            messages={messages}
            scrollRef={scrollRef}
            showScrollbar={showScrollbar}
            onScroll={handleScroll}
            inputValue={message}
            onInputChange={setMessage}
            onSubmit={handleSubmit}
            onStop={stopClaude}
            isRunning={isViewingRunning}
            linkedSessionId={linkedSessionId}
            sidebarOpen={sidebarOpen}
            selectedPlan={selectedPlan}
            planContent={planContent}
            splitPosition={splitPosition}
            onSplitChange={setSplitPosition}
            onCreateRalphSession={createRalphSession}
          />
        ) : selectedRalphPrd && ralphPrdContent ? (
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
          />
        ) : messages.length === 0 ? (
          <EmptyState
            inputValue={message}
            onInputChange={setMessage}
            onSubmit={handleSubmit}
            onStop={stopClaude}
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
            <div className="select-none border-t">
              <form onSubmit={handleSubmit} className="max-w-3xl w-full mx-auto px-6 py-6">
                <PromptInput
                  value={message}
                  onChange={setMessage}
                  onSubmit={handleSubmit}
                  onStop={stopClaude}
                  isRunning={isViewingRunning}
                  placeholder={store.state.viewedSessionId ? "Follow up..." : "Ask anything..."}
                  rows={3}
                  autoFocus
                />
              </form>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default App;
