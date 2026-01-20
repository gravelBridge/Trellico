import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface JsonViewerProps {
  content: string;
}

interface JsonNodeProps {
  data: unknown;
  keyName?: string;
  isLast?: boolean;
  depth?: number;
  initialExpanded?: boolean;
}

// Color classes for light/dark mode (github-light / github-dark theme)
const colors = {
  key: "text-[#0550ae] dark:text-[#79c0ff]",
  string: "text-[#0a3069] dark:text-[#a5d6ff]",
  number: "text-[#0550ae] dark:text-[#79c0ff]",
  boolean: "text-[#cf222e] dark:text-[#ff7b72]",
  null: "text-[#cf222e] dark:text-[#ff7b72]",
  punctuation: "text-[#24292f] dark:text-[#8b949e]",
  muted: "text-[#57606a] dark:text-[#6e7681]",
};

function JsonNode({
  data,
  keyName,
  isLast = true,
  depth = 0,
  initialExpanded = true,
}: JsonNodeProps) {
  const [expanded, setExpanded] = useState(initialExpanded);

  const isObject = data !== null && typeof data === "object";
  const isArray = Array.isArray(data);
  const isEmpty = isObject && Object.keys(data as object).length === 0;

  const renderValue = () => {
    if (data === null) {
      return <span className={colors.null}>null</span>;
    }
    if (typeof data === "boolean") {
      return <span className={colors.boolean}>{data.toString()}</span>;
    }
    if (typeof data === "number") {
      return <span className={colors.number}>{data}</span>;
    }
    if (typeof data === "string") {
      return <span className={colors.string}>"{data}"</span>;
    }
    return null;
  };

  const comma = isLast ? "" : ",";

  if (!isObject) {
    return (
      <div style={{ paddingLeft: depth * 16 }}>
        {keyName !== undefined && (
          <>
            <span className={colors.key}>"{keyName}"</span>
            <span className={colors.punctuation}>: </span>
          </>
        )}
        {renderValue()}
        <span className={colors.punctuation}>{comma}</span>
      </div>
    );
  }

  const entries = Object.entries(data as object);
  const bracketOpen = isArray ? "[" : "{";
  const bracketClose = isArray ? "]" : "}";

  if (isEmpty) {
    return (
      <div style={{ paddingLeft: depth * 16 }}>
        {keyName !== undefined && (
          <>
            <span className={colors.key}>"{keyName}"</span>
            <span className={colors.punctuation}>: </span>
          </>
        )}
        <span className={colors.punctuation}>
          {bracketOpen}
          {bracketClose}
          {comma}
        </span>
      </div>
    );
  }

  return (
    <div>
      <div
        className={cn(
          "cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 rounded -mx-1 px-1",
          depth === 0 && "mx-0 px-0"
        )}
        style={{ paddingLeft: depth * 16 }}
        onClick={() => setExpanded(!expanded)}
      >
        <span className={cn("w-4 inline-flex items-center justify-center", colors.muted)}>
          {expanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </span>
        {keyName !== undefined && (
          <>
            <span className={colors.key}>"{keyName}"</span>
            <span className={colors.punctuation}>: </span>
          </>
        )}
        <span className={colors.punctuation}>{bracketOpen}</span>
        {!expanded && (
          <>
            <span className={cn(colors.muted, "mx-1")}>
              {isArray ? `${entries.length} items` : `${entries.length} keys`}
            </span>
            <span className={colors.punctuation}>
              {bracketClose}
              {comma}
            </span>
          </>
        )}
      </div>
      {expanded && (
        <>
          {entries.map(([key, value], index) => (
            <JsonNode
              key={key}
              data={value}
              keyName={isArray ? undefined : key}
              isLast={index === entries.length - 1}
              depth={depth + 1}
              initialExpanded={true}
            />
          ))}
          <div style={{ paddingLeft: depth * 16 }}>
            <span className="w-4 inline-block" />
            <span className={colors.punctuation}>
              {bracketClose}
              {comma}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export function JsonViewer({ content }: JsonViewerProps) {
  const parsed = useMemo(() => {
    try {
      return { data: JSON.parse(content), error: null };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : "Invalid JSON" };
    }
  }, [content]);

  if (parsed.error) {
    return (
      <div className="px-4 py-4">
        <div className="text-red-600 dark:text-red-400 text-sm mb-2">
          Failed to parse JSON: {parsed.error}
        </div>
        <pre className={cn("text-sm font-mono whitespace-pre-wrap select-text", colors.muted)}>
          {content}
        </pre>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 text-sm font-mono select-text">
      <JsonNode data={parsed.data} initialExpanded={true} />
    </div>
  );
}
