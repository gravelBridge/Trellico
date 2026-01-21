import { useState } from "react";

interface FolderSelectionProps {
  onSelectFolder: () => void;
}

export function FolderSelection({ onSelectFolder }: FolderSelectionProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <main className="h-screen flex flex-col relative bg-background">
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-slide-in {
          animation: fadeSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in-100 {
          opacity: 0;
          animation: fadeIn 0.5s ease 0.1s forwards;
        }
        .animate-fade-in-150 {
          opacity: 0;
          animation: fadeIn 0.5s ease 0.15s forwards;
        }
        .animate-fade-in-200 {
          opacity: 0;
          animation: fadeIn 0.5s ease 0.2s forwards;
        }
        .animate-fade-in-300 {
          opacity: 0;
          animation: fadeIn 0.5s ease 0.3s forwards;
        }
      `}</style>
      {/* Drag region */}
      <div className="h-12 shrink-0" data-tauri-drag-region />

      {/* Content - scrollable on short screens */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 relative z-10 min-h-0 overflow-y-auto">
        <div className="max-w-lg w-full animate-fade-slide-in py-4">
          {/* Logo */}
          <div className="mb-3 sm:mb-4 lg:mb-6">
            <h1
              className="text-[28px] sm:text-[36px] lg:text-[42px] font-bold tracking-[-0.04em] text-foreground"
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              }}
            >
              TRELLICO
            </h1>
          </div>

          {/* Tagline */}
          <p className="text-[10px] sm:text-[11px] tracking-[0.2em] uppercase mb-4 sm:mb-6 lg:mb-10 text-muted-foreground animate-fade-in-100">
            The beautiful, opinionated app for Ralph loops
          </p>

          {/* Description */}
          <p className="text-[18px] sm:text-[22px] lg:text-[28px] leading-[1.3] font-light text-foreground/70 mb-4 sm:mb-6 lg:mb-10 max-w-md animate-fade-in-150">
            Plan, execute, and review Ralph loops with precision.
          </p>

          {/* Action section */}
          <div className="animate-fade-in-200">
            <div className="text-[10px] sm:text-[11px] tracking-[0.2em] uppercase mb-2 sm:mb-3 text-muted-foreground">
              Get Started
            </div>

            {/* Button styled like terminal command */}
            <button
              onClick={onSelectFolder}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              className="group flex items-center gap-2 sm:gap-3 px-4 sm:px-5 py-2.5 sm:py-3 rounded-lg border transition-colors duration-150"
              style={{
                backgroundColor: isHovered ? 'oklch(0.67 0.16 58 / 0.08)' : 'transparent',
                borderColor: isHovered ? 'oklch(0.67 0.16 58 / 0.4)' : 'var(--border)',
              }}
            >
              <span className="text-muted-foreground text-xs sm:text-sm font-mono">$</span>
              <span
                className="text-xs sm:text-sm font-mono transition-colors duration-150"
                style={{ color: isHovered ? 'oklch(0.55 0.14 58)' : 'var(--foreground)' }}
              >
                select-folder
              </span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="sm:w-4 sm:h-4 ml-1 sm:ml-2 transition-colors duration-150"
                style={{ color: isHovered ? 'oklch(0.67 0.16 58)' : 'var(--muted-foreground)' }}
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Features row - hidden on very short screens */}
          <div className="hidden sm:flex gap-6 lg:gap-12 mt-6 lg:mt-14 animate-fade-in-300">
            {[
              { num: '01', label: 'Plan' },
              { num: '02', label: 'Execute' },
              { num: '03', label: 'Review' },
            ].map((item) => (
              <div key={item.num} className="flex items-baseline gap-2">
                <span className="text-[10px] text-muted-foreground/50 font-mono">{item.num}</span>
                <span className="text-[12px] lg:text-[13px] text-muted-foreground tracking-wide">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
