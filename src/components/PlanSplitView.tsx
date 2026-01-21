import type { RefObject } from "react";
import type { ClaudeMessage } from "@/types";
import { SplitView } from "./SplitView";
import { ChatPanel } from "./ChatPanel";
import { ContentPanel } from "./ContentPanel";
import { Button } from "@/components/ui/button";

interface PlanSplitViewProps {
  messages: ClaudeMessage[];
  scrollRef: RefObject<HTMLDivElement | null>;
  showScrollbar: boolean;
  onScroll: () => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStop: () => void;
  isRunning: boolean;
  linkedSessionId: string | null;
  sidebarOpen: boolean;
  selectedPlan: string;
  planContent: string;
  splitPosition: number;
  onSplitChange: (pos: number) => void;
  onCreateRalphSession: () => void;
  ralphPrds: string[];
  onViewRalphSession: () => void;
}

export function PlanSplitView({
  messages,
  scrollRef,
  showScrollbar,
  onScroll,
  inputValue,
  onInputChange,
  onSubmit,
  onStop,
  isRunning,
  linkedSessionId,
  sidebarOpen,
  selectedPlan,
  planContent,
  splitPosition,
  onSplitChange,
  onCreateRalphSession,
  ralphPrds,
  onViewRalphSession,
}: PlanSplitViewProps) {
  const hasExistingRalphPrd = ralphPrds.includes(selectedPlan);
  // Right panel needs padding when sidebar is closed AND left panel is nearly collapsed
  const leftPanelCollapsed = splitPosition < 6;
  const rightPanelNeedsPadding = !sidebarOpen && leftPanelCollapsed;

  return (
    <SplitView
      leftPanel={
        <ChatPanel
          messages={messages}
          scrollRef={scrollRef}
          showScrollbar={showScrollbar}
          onScroll={onScroll}
          inputValue={inputValue}
          onInputChange={onInputChange}
          onSubmit={onSubmit}
          onStop={onStop}
          isRunning={isRunning}
          hasLinkedSession={!!linkedSessionId}
          sidebarOpen={sidebarOpen}
          emptyMessage="No chat history for this plan"
        />
      }
      rightPanel={
        <ContentPanel
          title={`${selectedPlan}.md`}
          content={planContent}
          contentType="markdown"
          rightPanelNeedsPadding={rightPanelNeedsPadding}
          headerActions={
            hasExistingRalphPrd ? (
              <Button size="sm" onClick={onViewRalphSession}>
                View Ralph Session
              </Button>
            ) : (
              <Button size="sm" onClick={onCreateRalphSession} disabled={isRunning}>
                Create Ralph Session
              </Button>
            )
          }
        />
      }
      splitPosition={splitPosition}
      onSplitChange={onSplitChange}
    />
  );
}
