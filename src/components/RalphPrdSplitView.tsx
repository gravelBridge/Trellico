import type { RefObject } from "react";
import type { ClaudeMessage, RalphIteration } from "@/types";
import { SplitView } from "./SplitView";
import { ChatPanel } from "./ChatPanel";
import { ContentPanel } from "./ContentPanel";
import { Button } from "@/components/ui/button";

interface RalphPrdSplitViewProps {
  messages: ClaudeMessage[];
  scrollRef: RefObject<HTMLDivElement | null>;
  showScrollbar: boolean;
  onScroll: () => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStop: () => void;
  isRunning: boolean;
  ralphLinkedSessionId: string | null;
  sidebarOpen: boolean;
  selectedRalphPrd: string;
  ralphPrdContent: string;
  splitPosition: number;
  onSplitChange: (pos: number) => void;
  onStartRalphing: () => void;
  isRalphing: boolean;
  ralphingPrd: string | null;
  isViewingIteration: boolean;
  iterations: RalphIteration[];
}

export function RalphPrdSplitView({
  messages,
  scrollRef,
  showScrollbar,
  onScroll,
  inputValue,
  onInputChange,
  onSubmit,
  onStop,
  isRunning,
  ralphLinkedSessionId,
  sidebarOpen,
  selectedRalphPrd,
  ralphPrdContent,
  splitPosition,
  onSplitChange,
  onStartRalphing,
  isRalphing,
  ralphingPrd,
  isViewingIteration,
  iterations,
}: RalphPrdSplitViewProps) {
  // Right panel needs padding when sidebar is closed AND left panel is nearly collapsed
  const leftPanelCollapsed = splitPosition < 6;
  const rightPanelNeedsPadding = !sidebarOpen && leftPanelCollapsed;

  // Check if ralphing is completed (last iteration is "completed" and not currently ralphing)
  const lastIteration = iterations[iterations.length - 1];
  const isRalphingCompleted =
    !isRalphing && lastIteration?.status === "completed";

  // Determine if button should be disabled - when running, ralphing, or already completed
  const isRalphingThisPrd = isRalphing && ralphingPrd === selectedRalphPrd;
  const buttonDisabled = isRunning || isRalphingThisPrd || isRalphingCompleted;

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
          hasLinkedSession={!!ralphLinkedSessionId}
          sidebarOpen={sidebarOpen}
          emptyMessage="No chat history for this Ralph PRD"
        />
      }
      rightPanel={
        <ContentPanel
          title={`${selectedRalphPrd}.json`}
          content={ralphPrdContent}
          contentType="json"
          rightPanelNeedsPadding={rightPanelNeedsPadding}
          headerActions={
            !isViewingIteration ? (
              <Button
                size="sm"
                onClick={onStartRalphing}
                disabled={buttonDisabled}
              >
                {isRalphingThisPrd
                  ? "Ralphing..."
                  : isRalphingCompleted
                    ? "Completed"
                    : "Start Ralphing!"}
              </Button>
            ) : undefined
          }
        />
      }
      splitPosition={splitPosition}
      onSplitChange={onSplitChange}
    />
  );
}
