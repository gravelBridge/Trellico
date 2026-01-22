import { useState, useMemo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { JsonViewer } from "./JsonViewer";

interface UserStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: number;
  passes: boolean;
  notes: string;
}

interface RalphPrd {
  project: string;
  branchName: string;
  description: string;
  userStories: UserStory[];
}

interface RalphPrdViewerProps {
  content: string;
}

function StoryRow({
  story,
  isCurrentTask,
}: {
  story: UserStory;
  isCurrentTask: boolean;
}) {
  const [isOpen, setIsOpen] = useState(isCurrentTask);
  const prevIsCurrentTask = useRef(isCurrentTask);
  const prevPasses = useRef(story.passes);

  // Auto-expand when story becomes active, auto-collapse when completed
  useEffect(() => {
    // Story just became active (queued → active)
    if (isCurrentTask && !prevIsCurrentTask.current) {
      setIsOpen(true);
    }
    // Story just completed (active → done)
    if (story.passes && !prevPasses.current) {
      setIsOpen(false);
    }

    prevIsCurrentTask.current = isCurrentTask;
    prevPasses.current = story.passes;
  }, [isCurrentTask, story.passes]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            "w-full py-2.5 flex items-baseline gap-4 text-left border-b border-border/50 hover:bg-muted/30 transition-colors",
            isOpen && "bg-muted/20"
          )}
        >
          <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">
            {story.id}
          </span>
          <span
            className={cn(
              "flex-1 text-sm",
              story.passes && "text-muted-foreground line-through"
            )}
          >
            {story.title}
          </span>
          <span className="font-mono text-xs text-muted-foreground w-20 text-right shrink-0">
            {story.passes ? "done" : isCurrentTask ? "active" : "queued"}
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="py-3 pl-20 pr-4 space-y-3 text-sm border-b border-border/50 bg-muted/10">
          <p className="text-muted-foreground">{story.description}</p>

          {story.acceptanceCriteria.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground/70">
                Criteria
              </span>
              <ul className="space-y-0.5">
                {story.acceptanceCriteria.map((criterion, i) => (
                  <li
                    key={i}
                    className="text-muted-foreground font-mono text-xs"
                  >
                    - {criterion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {story.notes && (
            <div className="space-y-1">
              <span className="text-xs uppercase tracking-wider text-muted-foreground/70">
                Notes
              </span>
              <p className="text-muted-foreground font-mono text-xs">
                {story.notes}
              </p>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PrettyView({ prd }: { prd: RalphPrd }) {
  const completedCount = prd.userStories.filter((s) => s.passes).length;
  const totalCount = prd.userStories.length;

  const sortedStories = [...prd.userStories].sort(
    (a, b) => a.priority - b.priority
  );
  const currentTaskId = sortedStories.find((s) => !s.passes)?.id;

  return (
    <div className="p-4 space-y-2">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-lg font-medium">{prd.project}</h1>
        <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
          <span>{prd.branchName}</span>
          <span>
            {completedCount}/{totalCount}
          </span>
        </div>
        {prd.description && (
          <p className="text-sm text-muted-foreground leading-relaxed pt-2">
            {prd.description}
          </p>
        )}
      </div>

      {/* Table */}
      <div>
        {/* Header */}
        <div className="flex items-baseline gap-4 py-2 border-b border-foreground/20 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="w-16 shrink-0">#</span>
          <span className="flex-1">Story</span>
          <span className="w-20 text-right shrink-0">Status</span>
        </div>

        {/* Rows */}
        {sortedStories.map((story) => (
          <StoryRow
            key={story.id}
            story={story}
            isCurrentTask={story.id === currentTaskId}
          />
        ))}
      </div>
    </div>
  );
}

export function RalphPrdViewer({ content }: RalphPrdViewerProps) {
  const parsed = useMemo(() => {
    try {
      const data = JSON.parse(content);
      if (
        data &&
        typeof data.project === "string" &&
        typeof data.branchName === "string" &&
        Array.isArray(data.userStories)
      ) {
        return { prd: data as RalphPrd, error: null };
      }
      return { prd: null, error: "Invalid PRD structure" };
    } catch (e) {
      return {
        prd: null,
        error: e instanceof Error ? e.message : "Invalid JSON",
      };
    }
  }, [content]);

  if (parsed.error || !parsed.prd) {
    return <JsonViewer content={content} />;
  }

  return (
    <Tabs defaultValue="pretty" className="h-full flex flex-col">
      <div className="px-4 pt-3 pb-0">
        <TabsList className="w-fit">
          <TabsTrigger value="pretty">Pretty</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="pretty" className="flex-1 overflow-auto mt-0">
        <PrettyView prd={parsed.prd} />
      </TabsContent>
      <TabsContent value="json" className="flex-1 overflow-auto mt-0">
        <JsonViewer content={content} />
      </TabsContent>
    </Tabs>
  );
}
