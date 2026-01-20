import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

import { useAutoScroll, useClaudeSession, usePlans, useRalphPrds } from "@/hooks";
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

  // Claude session hook
  const {
    messages,
    setMessages,
    sessionId,
    setSessionId,
    isRunning,
    setIsRunning,
    runClaude,
    stopClaude,
  } = useClaudeSession();

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
    isRunning,
    sessionId,
    setSessionId,
    setMessages,
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
    isRunning,
    sessionId,
    activeTab,
    setSessionId,
    setMessages,
  });

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
    if (!message.trim() || !folderPath || isRunning) return;

    const isNewSession = !sessionId;

    // Add user message to UI
    setMessages((prev) => [...prev, { type: "user", content: message }]);

    resetAutoScroll();
    setIsRunning(true);

    // Only prepend prompt for new sessions in plans tab
    const fullMessage =
      isNewSession && activeTab === "plans" ? `${prdPrompt}\n\n${message}` : message;

    try {
      await runClaude(fullMessage, folderPath, sessionId);
    } catch {
      // Error already handled in hook
    }
    setMessage("");
  }

  // Start a new plan session
  function startNewPlan() {
    setMessages([]);
    setSessionId(null);
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

    // Clear session state
    setMessages([]);
    setSessionId(null);

    // Switch to Ralph tab
    setActiveTab("ralph");

    // Compose message with ralph prompt + plan filename instruction + plan content
    const fullMessage = `${ralphFormatPrompt}\n\nPlan filename: ${planFileName}.md\nOutput the JSON to: .trellico/ralph-prd/${planFileName}.json\n\n${planContent}`;

    // Start Claude session (no user message shown - the prompt is hidden)
    resetAutoScroll();
    setIsRunning(true);

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
        isRunning={isRunning}
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
            isRunning={isRunning}
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
            onStop={stopClaude}
            isRunning={isRunning}
            ralphLinkedSessionId={ralphLinkedSessionId}
            sidebarOpen={sidebarOpen}
            selectedRalphPrd={selectedRalphPrd}
            ralphPrdContent={ralphPrdContent}
            splitPosition={splitPosition}
            onSplitChange={setSplitPosition}
          />
        ) : messages.length === 0 ? (
          <EmptyState
            inputValue={message}
            onInputChange={setMessage}
            onSubmit={handleSubmit}
            onStop={stopClaude}
            isRunning={isRunning}
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
                  isRunning={isRunning}
                  placeholder={sessionId ? "Follow up..." : "Ask anything..."}
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
