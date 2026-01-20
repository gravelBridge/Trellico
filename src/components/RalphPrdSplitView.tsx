import type { RefObject } from "react";
import type { ClaudeMessage } from "@/types";
import { SplitView } from "./SplitView";
import { ChatPanel } from "./ChatPanel";
import { ContentPanel } from "./ContentPanel";

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
}: RalphPrdSplitViewProps) {
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
        />
      }
      splitPosition={splitPosition}
      onSplitChange={onSplitChange}
    />
  );
}
