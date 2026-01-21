import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { kebabToTitle } from "@/lib/formatting";
import type { RalphIteration } from "@/types";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  plans: string[];
  selectedPlan: string | null;
  onSelectPlan: (plan: string) => void;
  onNewPlan: () => void;
  ralphPrds: string[];
  selectedRalphPrd: string | null;
  onSelectRalphPrd: (prd: string) => void;
  folderPath: string;
  onChangeFolder: () => void;
  isRunning: boolean;
  ralphIterations: Record<string, RalphIteration[]>;
  selectedRalphIteration: { prd: string; iteration: number } | null;
  onSelectRalphIteration: (prd: string, iteration: number) => void;
}

function SidebarToggleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn(
        "transition-transform shrink-0",
        expanded ? "rotate-90" : "rotate-0"
      )}
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "w-1.5 h-1.5 rounded-full shrink-0",
        status === "running" && "bg-yellow-500 animate-pulse",
        status === "completed" && "bg-green-500",
        status === "stopped" && "bg-red-500"
      )}
    />
  );
}

export function Sidebar({
  isOpen,
  onToggle,
  activeTab,
  onTabChange,
  plans,
  selectedPlan,
  onSelectPlan,
  onNewPlan,
  ralphPrds,
  selectedRalphPrd,
  onSelectRalphPrd,
  folderPath,
  onChangeFolder,
  isRunning,
  ralphIterations,
  selectedRalphIteration,
  onSelectRalphIteration,
}: SidebarProps) {
  const [expandedPrds, setExpandedPrds] = useState<Set<string>>(new Set());
  const [prevIterationsKeys, setPrevIterationsKeys] = useState<string[]>([]);

  // Auto-expand PRDs when they get iterations (React pattern for syncing with props)
  const currentKeys = Object.keys(ralphIterations).filter(
    (prd) => ralphIterations[prd]?.length > 0
  );
  const keysChanged = currentKeys.length !== prevIterationsKeys.length ||
    currentKeys.some((key) => !prevIterationsKeys.includes(key));

  if (keysChanged) {
    setPrevIterationsKeys(currentKeys);
    const newPrds = currentKeys.filter((prd) => !expandedPrds.has(prd));
    if (newPrds.length > 0) {
      const next = new Set(expandedPrds);
      newPrds.forEach((prd) => next.add(prd));
      setExpandedPrds(next);
    }
  }

  const togglePrdExpand = (prd: string) => {
    setExpandedPrds((prev) => {
      const next = new Set(prev);
      if (next.has(prd)) {
        next.delete(prd);
      } else {
        next.add(prd);
      }
      return next;
    });
  };

  return (
    <>
      {/* Sidebar */}
      <aside
        className={cn(
          "border-r flex flex-col bg-muted/30 transition-all duration-200 relative z-10",
          isOpen ? "w-64" : "w-0 border-r-0"
        )}
      >
        <div
          className={cn(
            "flex flex-col h-full overflow-hidden w-64",
            isOpen ? "opacity-100" : "opacity-0"
          )}
        >
          {/* Titlebar area with toggle button next to traffic lights */}
          <div className="h-12 relative shrink-0">
            <div className="absolute inset-0" data-tauri-drag-region />
            <button
              onClick={onToggle}
              className="absolute left-[85px] top-1/2 -translate-y-[calc(50%+2px)] p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground z-10"
            >
              <SidebarToggleIcon />
            </button>
          </div>
          <div className="px-2">
            <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="plans" className="flex-1">
                  Plans
                </TabsTrigger>
                <TabsTrigger value="ralph" className="flex-1">
                  Ralph
                </TabsTrigger>
              </TabsList>
              <TabsContent value="plans" className="mt-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 hover:bg-muted"
                  onClick={onNewPlan}
                  disabled={isRunning}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M8 3v10M3 8h10" />
                  </svg>
                  New plan
                </Button>
                {plans.length > 0 ? (
                  <div className="mt-2 space-y-0.5">
                    {plans.map((plan) => (
                      <button
                        key={plan}
                        onClick={() => onSelectPlan(plan)}
                        className={cn(
                          "w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors truncate",
                          selectedPlan === plan
                            ? "bg-primary/15 text-foreground font-medium"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                      >
                        {kebabToTitle(plan)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground px-1 mt-2">No plans yet</p>
                )}
              </TabsContent>
              <TabsContent value="ralph" className="mt-0">
                {ralphPrds.length > 0 ? (
                  <div className="mt-2 space-y-0.5">
                    {ralphPrds.map((prd) => {
                      const iterations = ralphIterations[prd] || [];
                      const hasIterations = iterations.length > 0;
                      const isExpanded = expandedPrds.has(prd);
                      const isPrdSelected = selectedRalphPrd === prd && !selectedRalphIteration;

                      return (
                        <div key={prd}>
                          <div className="flex items-center gap-1">
                            {hasIterations && (
                              <button
                                onClick={() => togglePrdExpand(prd)}
                                className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                              >
                                <ChevronIcon expanded={isExpanded} />
                              </button>
                            )}
                            <button
                              onClick={() => onSelectRalphPrd(prd)}
                              className={cn(
                                "flex-1 text-left py-1.5 text-sm rounded-md transition-colors truncate",
                                hasIterations ? "px-1" : "px-2",
                                isPrdSelected
                                  ? "bg-primary/15 text-foreground font-medium"
                                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                              )}
                            >
                              {kebabToTitle(prd)}
                            </button>
                          </div>
                          {hasIterations && isExpanded && (
                            <div className="ml-6 space-y-0.5 mt-0.5">
                              {iterations.map((iter) => {
                                const isIterSelected =
                                  selectedRalphIteration?.prd === prd &&
                                  selectedRalphIteration?.iteration === iter.iteration_number;
                                return (
                                  <button
                                    key={iter.iteration_number}
                                    onClick={() => onSelectRalphIteration(prd, iter.iteration_number)}
                                    className={cn(
                                      "w-full text-left px-2 py-1 text-xs rounded-md transition-colors flex items-center gap-2",
                                      isIterSelected
                                        ? "bg-primary/15 text-foreground font-medium"
                                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                    )}
                                  >
                                    <StatusDot status={iter.status} />
                                    <span>Iteration {iter.iteration_number}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground px-1 mt-2">No Ralph PRDs yet</p>
                )}
              </TabsContent>
            </Tabs>
          </div>
          <div className="mt-auto px-4 py-2 border-t">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate">{folderPath.split("/").pop()}</span>
              <Button variant="ghost" size="sm" onClick={onChangeFolder} disabled={isRunning}>
                Change
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Toggle button and drag region when sidebar is closed */}
      {!isOpen && (
        <div className="absolute top-0 left-0 h-12 w-32 z-50">
          <div className="absolute inset-0" data-tauri-drag-region />
          <button
            onClick={onToggle}
            className="absolute left-[85px] top-1/2 -translate-y-[calc(50%+2px)] p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground z-10"
          >
            <SidebarToggleIcon />
          </button>
        </div>
      )}
    </>
  );
}
