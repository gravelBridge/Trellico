import { useRef, useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface SplitViewProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  splitPosition: number; // 0-100 percentage
  onSplitChange: (pos: number) => void;
}

const COLLAPSE_THRESHOLD = 5; // percentage - below this, panel is fully hidden

export function SplitView({
  leftPanel,
  rightPanel,
  splitPosition,
  onSplitChange,
}: SplitViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      let newPosition = (x / rect.width) * 100;

      // Allow full range 0-100
      newPosition = Math.max(0, Math.min(100, newPosition));

      onSplitChange(newPosition);
    },
    [onSplitChange]
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    setIsResizing(false);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const handleDoubleClick = useCallback(() => {
    onSplitChange(50);
  }, [onSplitChange]);

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const leftHidden = splitPosition < COLLAPSE_THRESHOLD;
  const rightHidden = splitPosition > 100 - COLLAPSE_THRESHOLD;

  return (
    <div ref={containerRef} className="flex-1 flex overflow-hidden">
      {/* Left panel - hidden with CSS to preserve state */}
      <div
        className={cn("flex flex-col overflow-hidden", leftHidden && "hidden")}
        style={
          leftHidden
            ? undefined
            : rightHidden
              ? { flex: 1 }
              : {
                  flexBasis: `${splitPosition}%`,
                  flexShrink: 0,
                  flexGrow: 0,
                }
        }
      >
        {leftPanel}
      </div>

      {/* Resize divider */}
      <div
        className={cn(
          "resize-divider flex-shrink-0 flex items-center justify-center",
          isResizing && "is-resizing"
        )}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        <div className="resize-handle" />
      </div>

      {/* Right panel - hidden with CSS to preserve state */}
      <div
        className={cn(
          "flex-1 flex flex-col overflow-hidden",
          rightHidden && "hidden"
        )}
      >
        {rightPanel}
      </div>
    </div>
  );
}
