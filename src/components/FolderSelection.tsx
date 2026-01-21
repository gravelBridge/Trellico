import { useEffect, useState } from "react";

interface FolderSelectionProps {
  onSelectFolder: () => void;
}

export function FolderSelection({ onSelectFolder }: FolderSelectionProps) {
  const [mounted, setMounted] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <main className="min-h-screen flex flex-col relative overflow-hidden bg-background">
      {/* Drag region */}
      <div className="h-12 shrink-0" data-tauri-drag-region />

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-8 relative z-10 min-h-0">
        <div
          className="max-w-lg w-full"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(12px)',
            transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {/* Logo */}
          <div className="mb-4 sm:mb-6">
            <h1
              className="text-[32px] sm:text-[42px] font-bold tracking-[-0.04em] text-foreground"
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
              }}
            >
              TRELLICO
            </h1>
          </div>

          {/* Tagline */}
          <p
            className="text-[11px] tracking-[0.2em] uppercase mb-8 sm:mb-12 text-muted-foreground"
            style={{
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.5s ease 0.1s',
            }}
          >
            The beautiful, opinionated app for Ralph loops
          </p>

          {/* Description */}
          <p
            className="text-[22px] sm:text-[28px] leading-[1.3] font-light text-foreground/70 mb-8 sm:mb-12 max-w-md"
            style={{
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.5s ease 0.15s',
            }}
          >
            Plan, execute, and review Ralph loops with precision.
          </p>

          {/* Action section */}
          <div
            style={{
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.5s ease 0.2s',
            }}
          >
            <div className="text-[11px] tracking-[0.2em] uppercase mb-3 text-muted-foreground">
              Get Started
            </div>

            {/* Button styled like terminal command */}
            <button
              onClick={onSelectFolder}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              className="group flex items-center gap-3 px-5 py-3 rounded-lg border transition-colors duration-150"
              style={{
                backgroundColor: isHovered ? 'oklch(0.67 0.16 58 / 0.08)' : 'transparent',
                borderColor: isHovered ? 'oklch(0.67 0.16 58 / 0.4)' : 'var(--border)',
              }}
            >
              <span className="text-muted-foreground text-sm font-mono">$</span>
              <span
                className="text-sm font-mono transition-colors duration-150"
                style={{ color: isHovered ? 'oklch(0.55 0.14 58)' : 'var(--foreground)' }}
              >
                select-folder
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ml-2 transition-colors duration-150"
                style={{ color: isHovered ? 'oklch(0.67 0.16 58)' : 'var(--muted-foreground)' }}
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Features row */}
          <div
            className="flex gap-8 sm:gap-12 mt-10 sm:mt-16"
            style={{
              opacity: mounted ? 1 : 0,
              transition: 'opacity 0.5s ease 0.3s',
            }}
          >
            {[
              { num: '01', label: 'Plan' },
              { num: '02', label: 'Execute' },
              { num: '03', label: 'Review' },
            ].map((item) => (
              <div key={item.num} className="flex items-baseline gap-2">
                <span className="text-[10px] text-muted-foreground/50 font-mono">{item.num}</span>
                <span className="text-[13px] text-muted-foreground tracking-wide">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
