import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import type { AIMessage } from "@/types";
import { stripPromptPrefix } from "@/lib/formatting";

interface MessageItemProps {
  message: AIMessage;
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
      let textContent: string | undefined;
      let toolResults: Array<{
        type: string;
        content?: string | Array<{ type: string; text?: string }>;
        tool_use_id?: string;
      }> = [];

      if (typeof msg.message?.content === "string") {
        textContent = msg.message.content;
      } else if (Array.isArray(msg.message?.content)) {
        // Separate text content from tool_result content
        const textItems = msg.message.content.filter((c) => c.type === "text");
        toolResults = msg.message.content.filter((c) => c.type === "tool_result");
        textContent = textItems.map((c) => c.text).join("\n");
      } else {
        textContent = msg.content;
      }

      // Strip prompt prefixes (e.g., PRD prompt) from displayed content
      const displayContent = textContent ? stripPromptPrefix(textContent) : "";

      // If we only have tool results (no text), render them as collapsible items
      if (!displayContent.trim() && toolResults.length > 0) {
        return (
          <div key={index} className="space-y-1">
            {toolResults.map((result, i) => {
              // content can be string or array of {type, text} objects
              let resultContent = "";
              if (typeof result.content === "string") {
                resultContent = result.content;
              } else if (Array.isArray(result.content)) {
                resultContent = result.content
                  .filter((c: { type: string }) => c.type === "text")
                  .map((c: { text?: string }) => c.text || "")
                  .join("\n");
              }
              const isLarge = resultContent.length > 200;

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
                      <span className="font-mono text-muted-foreground/70">tool_result</span>
                      <code className="text-[10px] text-muted-foreground/70 truncate max-w-[300px]">
                        {resultContent}
                      </code>
                    </summary>
                    <pre className="mt-2 ml-4 text-[10px] text-muted-foreground/70 bg-muted/30 p-3 rounded-md overflow-auto max-h-48 whitespace-pre-wrap break-all">
                      {resultContent}
                    </pre>
                  </details>
                );
              }

              return (
                <div key={i} className="flex items-baseline gap-2 text-xs text-muted-foreground">
                  <span className="font-mono text-muted-foreground/70">tool_result</span>
                  <code className="text-[10px] text-muted-foreground/70">{resultContent}</code>
                </div>
              );
            })}
          </div>
        );
      }

      if (!displayContent.trim()) {
        return null;
      }

      // Detect skill injections (start with "Base directory for this skill:")
      if (displayContent.startsWith("Base directory for this skill:")) {
        // Extract skill name from path
        const match = displayContent.match(/skills\/([^/\n]+)/);
        const skillName = match ? match[1] : "skill";
        return (
          <details key={index} className="group text-xs text-muted-foreground">
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
              <span className="font-mono text-primary font-medium">skill_content</span>
              <code className="text-[10px] text-muted-foreground/70">{skillName}</code>
            </summary>
            <pre className="mt-2 ml-4 text-[10px] text-muted-foreground/70 bg-muted/30 p-3 rounded-md overflow-auto max-h-48 whitespace-pre-wrap break-all">
              {displayContent}
            </pre>
          </details>
        );
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
