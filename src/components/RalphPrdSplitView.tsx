import type { RefObject } from "react";
import type { AIMessage, RalphIteration } from "@/types";
import { SplitView } from "./SplitView";
import { ChatPanel } from "./ChatPanel";
import { ContentPanel } from "./ContentPanel";
import { Button } from "@/components/ui/button";

interface RalphPrdSplitViewProps {
  messages: AIMessage[];
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
  selectedIterationNumber: number | null;
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
  selectedIterationNumber,
}: RalphPrdSplitViewProps) {
  // Right panel needs padding when sidebar is closed AND left panel is nearly collapsed
  const leftPanelCollapsed = splitPosition < 6;
  const rightPanelNeedsPadding = !sidebarOpen && leftPanelCollapsed;

  // Check if ralphing is completed (last iteration is "completed" and not currently ralphing)
  const lastIteration = iterations[iterations.length - 1];
  const isRalphingCompleted =
    !isRalphing && lastIteration?.status === "completed";

  // Check if there's an incomplete loop (last iteration is "stopped" - needs resume, not fresh start)
  const hasIncompleteLoop =
    !isRalphing && lastIteration?.status === "stopped";

  // Determine if button should be disabled - when running, ralphing, completed, or stopped
  const isRalphingThisPrd = isRalphing && ralphingPrd === selectedRalphPrd;
  const buttonDisabled =
    isRunning || isRalphingThisPrd || isRalphingCompleted || hasIncompleteLoop;

  // Check if viewing a stopped iteration that is the latest (can resume)
  const selectedIteration = selectedIterationNumber
    ? iterations.find((i) => i.iteration_number === selectedIterationNumber)
    : null;
  const isLatestIteration =
    selectedIterationNumber === lastIteration?.iteration_number;
  const canResume =
    isViewingIteration &&
    isLatestIteration &&
    selectedIteration?.status === "stopped" &&
    !isRalphing;

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
          isRalphPrd
          headerActions={
            !isViewingIteration ? (
              <Button
                size="sm"
                onClick={onStartRalphing}
                disabled={buttonDisabled}
              >
                {isRalphingThisPrd || hasIncompleteLoop
                  ? "In Progress"
                  : isRalphingCompleted
                    ? "Completed"
                    : "Start Ralphing!"}
              </Button>
            ) : canResume ? (
              <Button size="sm" onClick={onStartRalphing} disabled={isRunning}>
                Resume Ralphing!
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
