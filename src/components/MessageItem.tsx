import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import type { ClaudeMessage } from "@/types";
import { stripPromptPrefix } from "@/lib/formatting";

interface MessageItemProps {
  message: ClaudeMessage;
  index: number;
}

export function MessageItem({ message: msg, index }: MessageItemProps) {
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
                  <code className="text-[10px] text-muted-foreground/70">{inputJson}</code>
                )}
              </div>
            );
          })}
        </div>
      );
    }
    case "user": {
      // Skip subagent prompts (they have a parent_tool_use_id)
      if (msg.parent_tool_use_id) {
        return null;
      }
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
        <div key={index} className="text-sm bg-primary/10 rounded-lg px-3 py-2 select-text whitespace-pre-wrap">
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
