import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { kebabToTitle } from "@/lib/formatting";

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
}: SidebarProps) {
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
                            ? "bg-muted text-foreground"
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
                    {ralphPrds.map((prd) => (
                      <button
                        key={prd}
                        onClick={() => onSelectRalphPrd(prd)}
                        className={cn(
                          "w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors truncate",
                          selectedRalphPrd === prd
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                      >
                        {kebabToTitle(prd)}
                      </button>
                    ))}
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
