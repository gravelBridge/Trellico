# Project Overview

Trellico is a Tauri desktop application for planning and executing AI loops. It uses a React 19 + TypeScript frontend with a Rust backend.

## Commands

```bash
# Development
pnpm dev              # Start Vite dev server (port 1420)
pnpm tauri dev        # Run full Tauri app in development mode

# Build
pnpm build            # TypeScript + Vite build
pnpm tauri build      # Build distributable app

# Code quality
pnpm lint             # ESLint
pnpm typecheck        # TypeScript type checking
```

## Architecture

### Frontend-Backend Communication
```
React Frontend ↔ Tauri IPC Bridge ↔ Rust Backend
     ↓                                    ↓
 UI/State Management              File I/O, Process Management
 Claude Session Handling          File Watching, PTY Execution
```

### Multi-Folder State Model
The app supports multiple working folders simultaneously. Each folder maintains isolated state:
- Selected plan/PRD
- Running iterations
- UI state (tab selection, split positions)

State is managed through `FolderContext` (folder/UI state) and `MessageStore` (Claude session history).

### Key Data Flow

**Plan Creation:**
1. User prompt → `run_claude` Rust command → PTY subprocess
2. Claude output streams via Tauri events
3. On completion, creates `.md` plan file
4. File watcher detects change, updates UI

**Ralph Execution:**
1. Plan → PRD generation via Claude
2. Iterations tracked with session linking
3. State preserved across pause/resume
4. Operations isolated per folder

### Rust Backend Structure
- `commands/claude.rs` - Execute/stop Claude via PTY
- `commands/plans.rs` - Plan CRUD operations
- `commands/ralph.rs` - PRD/iteration management
- `commands/watchers.rs` - File system watching
- `state.rs` - Global state (process tracking, watchers)

### Frontend Structure
- `contexts/FolderContext.tsx` - Multi-folder state management
- `contexts/MessageStore.tsx` - Claude message history
- `hooks/useClaudeSession.ts` - Claude process execution
- `hooks/usePlans.ts` - Plan management
- `hooks/useRalphIterations.ts` - Iteration tracking
- `prompts/` - Claude prompt templates

## Conventions

- Path alias: `@` maps to `/src`
- UI components in `components/ui/` (shadcn/Radix primitives)
- Feature components in `components/`
- All async operations in custom hooks
- Unused parameters prefixed with `_`
- Strict TypeScript with `noUnusedLocals` and `noUnusedParameters`
