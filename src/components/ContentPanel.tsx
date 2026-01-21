import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { cn } from "@/lib/utils";
import { JsonViewer } from "./JsonViewer";
import { RalphPrdViewer } from "./RalphPrdViewer";

interface ContentPanelProps {
  title: string;
  content: string;
  contentType: "markdown" | "json";
  headerActions?: React.ReactNode;
  rightPanelNeedsPadding?: boolean;
  isRalphPrd?: boolean;
}

export function ContentPanel({
  title,
  content,
  contentType,
  headerActions,
  rightPanelNeedsPadding = false,
  isRalphPrd = false,
}: ContentPanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div
        className={cn(
          "h-12 shrink-0 flex items-center justify-between px-4 border-b gap-2",
          rightPanelNeedsPadding && "pl-32"
        )}
        data-tauri-drag-region
      >
        <h2 className="text-sm font-medium truncate min-w-0">{title}</h2>
        {headerActions}
      </div>
      <div className="flex-1 overflow-auto">
        {contentType === "markdown" ? (
          <div className="px-4 py-4">
            <Streamdown
              className="prose prose-neutral prose-sm max-w-none select-text"
              plugins={{ code }}
            >
              {content}
            </Streamdown>
          </div>
        ) : isRalphPrd ? (
          <RalphPrdViewer content={content} />
        ) : (
          <JsonViewer content={content} />
        )}
      </div>
    </div>
  );
}
