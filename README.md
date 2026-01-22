# Trellico

A beautiful UI to plan and execute Ralph loops.

![Trellico](public/hero.png)

## Download

[Download the latest release](https://github.com/gravelBridge/Trellico/releases/latest)

## What is Trellico?

Trellico is a Tauri MacOS app that allows you to run Ralph loops—long-running agents that get shit done. Create plans, generate PRDs, and execute agentic loops with full visibility into the AI's reasoning and progress.

### Features

- **Plan Management** - Create and organize development plans
- **Ralph Loops** - Execute iterative AI development cycles with story-by-story tracking
- **Multi-Folder Support** - Work on multiple projects simultaneously with isolated state
- **Live Streaming** - Watch Claude's output in real-time as it works
- **Session Persistence** - Pause and resume AI sessions without losing context

## Requirements

- macOS (Apple Silicon or Intel)
- [Claude Code](https://claude.com/product/claude-code) installed and authenticated (support for other AI coding CLIs coming soon)

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode
pnpm tauri dev

# Build for production
pnpm tauri build
```

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Backend**: Rust, Tauri v2