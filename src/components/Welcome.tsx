import { useState } from "react";

interface WelcomeProps {
  onSelectFolder: () => void;
}

export function Welcome({ onSelectFolder }: WelcomeProps) {
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
        <div className="max-w-xl w-full animate-fade-slide-in py-4">
          {/* Logo */}
          <h1
            className="text-[48px] sm:text-[64px] lg:text-[80px] font-bold tracking-[-0.04em] text-foreground mb-6 sm:mb-8"
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
            }}
          >
            TRELLICO
          </h1>

          {/* Description */}
          <p className="text-[18px] sm:text-[22px] lg:text-[26px] leading-[1.4] text-muted-foreground mb-10 sm:mb-12 lg:mb-14 max-w-md animate-fade-in-100">
            Plan, execute, and review Ralph loops with precision.
          </p>

          {/* CTA - Terminal style */}
          <div className="animate-fade-in-200">
            <div className="text-[11px] tracking-[0.2em] uppercase mb-3 text-muted-foreground font-medium">
              Get Started
            </div>
            <button
              onClick={onSelectFolder}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              className="group flex items-center gap-3 px-5 py-3.5 rounded-lg border border-border transition-all duration-150"
              style={{
                backgroundColor: isHovered ? 'var(--foreground)' : 'transparent',
              }}
            >
              <span
                className="text-sm font-mono transition-colors duration-150"
                style={{ color: isHovered ? 'var(--background)' : 'var(--muted-foreground)' }}
              >
                $
              </span>
              <span
                className="text-sm font-mono font-medium transition-colors duration-150"
                style={{ color: isHovered ? 'var(--background)' : 'var(--foreground)' }}
              >
                select-folder
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ml-2 transition-colors duration-150"
                style={{ color: isHovered ? 'var(--background)' : 'var(--muted-foreground)' }}
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Features row */}
          <div className="hidden sm:flex gap-10 lg:gap-14 mt-14 lg:mt-20 animate-fade-in-300">
            {['Plan', 'Execute', 'Review'].map((label, i) => (
              <div key={label} className="flex items-baseline gap-2">
                <span className="text-[11px] text-muted-foreground/40 font-mono">0{i + 1}</span>
                <span className="text-[13px] text-muted-foreground/70 tracking-wide">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
