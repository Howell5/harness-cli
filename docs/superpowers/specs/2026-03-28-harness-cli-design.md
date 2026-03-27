# Harness CLI - Design Spec

> Multi-Agent orchestration layer on top of Claude Code
> Date: 2026-03-28

## 1. Problem

Claude Code is an excellent single-agent harness, but it cannot coordinate multiple agent instances working on the same codebase with different roles (planning, generating, evaluating). For complex tasks, a single agent's context window fills up, its memory degrades, and there's no independent quality gate.

Harness CLI solves this by being the **application-level orchestrator** that spawns, monitors, and coordinates multiple Claude Code processes.

## 2. Architecture Overview

```
User
  │
  ▼
harness CLI (orchestrator)
  │  - reads harness.yaml config
  │  - manages state (.harness/)
  │  - controls iteration loop
  │  - monitors agent processes
  │
  ├──▶ claude CLI process (Planner)
  │      prompt: prompts/planner.md
  │      output: spec.md, feature-list.json
  │      lifecycle: single run
  │
  ├──▶ claude CLI process (Generator)
  │      prompt: prompts/generator.md
  │      input: spec.md, feature-list.json, progress.txt, feedback.md
  │      output: code + git commits + updated state files
  │      lifecycle: multiple runs (restart on max-turns or completion)
  │
  └──▶ claude CLI process (Evaluator)
         prompt: prompts/evaluator.md
         input: criteria.yaml + codebase
         output: scores.json, feedback.md
         lifecycle: single run per iteration
```

## 3. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Claude Code invocation | CLI subprocess (`claude -p`) | Report describes process-level control (SIGTERM, kill+restart). SDK `query()` is in-process, can't do context reset via process kill. |
| Language | TypeScript | Report examples are TS. Ecosystem match with CLAUDE.md. |
| Context reset | `--max-turns` per Generator run | Can't get precise token counts from CLI. `--max-turns` limits conversation turns per run. After exit, check progress and restart if needed. |
| Evaluator tools | Auto-detect Playwright MCP; fallback to bash + read | Check `.mcp.json` / `~/.claude.json` for playwright config at startup. If present, enable browser-based evaluation. If absent, degrade gracefully with `[WARN]`. |
| CLI framework | Node.js `parseArgs` (built-in) | Only 3 subcommands. No need for commander/yargs. |
| Config format | YAML | Matches report's harness.yaml and criteria.yaml conventions. |
| Package manager | pnpm + tsx | Direct TS execution, no build step needed. |

## 4. MVP Scope

### In scope
- `harness run --spec "..." [--config harness.yaml]` — full Plan → Generate → Evaluate loop
- `harness run --spec-file ./task.md` — spec from file
- `harness run --resume` — resume from `.harness/state.yaml`
- `harness plan --spec "..."` — run planner only
- `harness eval --criteria ./criteria.yaml` — run evaluator only
- Event emitter + text renderer with colored prefixes
- State management (`.harness/` directory)
- System prompts for all three agents
- Default `harness.yaml` config template

### Out of scope (future)
- `--daemon` mode / background execution
- `--notify slack` / notification integrations
- TUI interface (ink-based)
- `harness ctx` command
- CI/CD workflow templates

## 5. Directory Structure

```
harness-cli/
├── bin/
│   └── harness.ts            # CLI entry point (tsx shebang)
├── src/
│   ├── commands/
│   │   ├── run.ts            # harness run
│   │   ├── plan.ts           # harness plan
│   │   └── eval.ts           # harness eval
│   ├── orchestrator/
│   │   ├── loop.ts           # Main loop: plan → generate → evaluate → decide
│   │   └── process-manager.ts # Spawn, monitor, terminate claude processes
│   ├── state/
│   │   ├── state-store.ts    # Read/write .harness/state.yaml
│   │   ├── feature-list.ts   # Read/write feature-list.json
│   │   └── progress.ts       # Read/write progress.txt
│   ├── evaluator/
│   │   └── criteria-loader.ts # Load and parse criteria.yaml
│   ├── events/
│   │   ├── emitter.ts        # Typed event emitter
│   │   └── text-renderer.ts  # Colored prefix console output
│   ├── config/
│   │   └── loader.ts         # Load and validate harness.yaml
│   └── types.ts              # Shared type definitions
├── prompts/
│   ├── planner.md            # Planner system prompt
│   ├── generator.md          # Generator system prompt
│   └── evaluator.md          # Evaluator system prompt
├── templates/
│   ├── harness.yaml          # Default config template
│   └── criteria/
│       └── default.yaml      # Default evaluation criteria
├── package.json
├── tsconfig.json
└── biome.json
```

## 6. Component Design

### 6.1 CLI Entry Point (`bin/harness.ts`)

Parses args with `parseArgs`, routes to command handlers. Supports:
```bash
harness run --spec "..." [--spec-file path] [--config path] [--resume] [-v] [-vv]
harness plan --spec "..." [--output path]
harness eval --criteria path [--url url]
```

Verbosity levels:
- Default: `[HARNESS]` status + key milestones only
- `-v`: Add agent key actions
- `-vv`: Full claude stdout (indented)

### 6.2 Process Manager (`src/orchestrator/process-manager.ts`)

Spawns Claude Code CLI as child processes:

```typescript
interface AgentConfig {
  role: 'planner' | 'generator' | 'evaluator';
  systemPrompt: string;       // path to .md file
  allowedTools: string[];      // e.g., ['read', 'write', 'bash', 'git']
  maxTurns?: number;           // --max-turns flag
  inputPrompt: string;         // the task prompt injected via -p flag
  workingDir: string;          // project directory
}

interface AgentResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}
```

Key behaviors:
- Spawns via `child_process.spawn('claude', [args...])`
- Streams stdout/stderr through event emitter for rendering
- `--max-turns` controls context window usage (default: 50 for generator, unlimited for planner/evaluator)
- On generator completion, checks feature-list.json for remaining pending items
- Supports graceful termination (SIGTERM → wait 10s → SIGKILL)

### 6.3 Main Loop (`src/orchestrator/loop.ts`)

```
Phase 1: Planning
  spawn planner → wait for completion → validate outputs exist

Phase 2: Generation + Evaluation loop
  while (iteration < maxIterations):
    spawn generator (with --max-turns)
    wait for generator to exit

    if all features completed OR generator explicitly signals "done":
      spawn evaluator
      parse scores.json

      if weighted_avg >= passing_threshold:
        break (success)
      else:
        inject feedback.md for next generator run
        iteration++
    else:
      // generator hit max-turns but features remain
      // restart generator (context reset)
      generator_reset_count++
      continue (same iteration, don't evaluate yet)
```

Important distinction: **context resets** (generator hit turn limit, needs restart) are NOT the same as **iterations** (a full generate→evaluate cycle). Multiple resets can happen within one iteration.

### 6.4 State Store (`src/state/state-store.ts`)

Manages `.harness/state.yaml`:

```yaml
version: "1"
task:
  id: "task-20260328-001"      # auto-generated
  description: "..."
  spec_file: "./spec.md"
  started_at: "2026-03-28T10:00:00Z"

progress:
  phase: "generation"           # planning | generation | evaluation | complete
  iteration: 1
  max_iterations: 15
  features_total: 0             # filled after planning
  features_completed: 0

context:
  generator_reset_count: 0
  last_reset_at: null

evaluations: []                 # appended after each eval
```

State is written after every significant event (phase change, feature completion, reset, evaluation).

### 6.5 Feature List (`src/state/feature-list.ts`)

Reads/writes `feature-list.json`:
```json
[
  { "id": "feat-001", "desc": "...", "status": "completed", "commit": "a1b2c3" },
  { "id": "feat-002", "desc": "...", "status": "in_progress" },
  { "id": "feat-003", "desc": "...", "status": "pending" }
]
```

Provides helpers: `getPendingFeatures()`, `getCompletedCount()`, `isAllComplete()`.

### 6.6 Event System (`src/events/`)

Typed events:
```typescript
type HarnessEvent =
  | { type: 'harness:start'; task: string }
  | { type: 'harness:done'; iterations: number; resets: number; score: number }
  | { type: 'agent:start'; agent: AgentRole }
  | { type: 'agent:output'; agent: AgentRole; line: string }
  | { type: 'agent:exit'; agent: AgentRole; exitCode: number }
  | { type: 'agent:reset'; agent: AgentRole; count: number }
  | { type: 'eval:score'; iteration: number; scores: Record<string, number>; avg: number; passed: boolean }
  | { type: 'feature:complete'; id: string; desc: string; commit?: string }
  | { type: 'error'; message: string };
```

Text renderer subscribes to events, formats with colored prefixes:
- `[HARNESS]` white bold
- `[PLAN]` cyan
- `[GEN]` green
- `[EVAL]` yellow
- `[ERROR]` red

### 6.7 Config Loader (`src/config/loader.ts`)

Loads `harness.yaml`:
```yaml
# harness.yaml
max_iterations: 15
passing_threshold: 7.5
generator:
  max_turns: 50
  allowed_tools:
    - Read
    - Write
    - Edit
    - Bash
    - Glob
    - Grep
evaluator:
  allowed_tools:
    - Read
    - Bash
    - Glob
    - Grep
  criteria_file: ./criteria/default.yaml
planner:
  allowed_tools:
    - Read
    - Write
    - Glob
    - Grep
prompts:
  planner: ./prompts/planner.md
  generator: ./prompts/generator.md
  evaluator: ./prompts/evaluator.md
```

Merges defaults with user config. Validates required fields.

## 7. System Prompt Design

### 7.1 Planner (`prompts/planner.md`)

Core instructions:
- Expand vague task description into detailed engineering spec
- Output `spec.md` with: functional requirements, technical constraints, acceptance criteria
- Output `feature-list.json` with granular features (each ≈ one commit of work)
- Features must have IDs, descriptions, and dependency ordering
- Err on the side of over-specification, not ambiguity

### 7.2 Generator (`prompts/generator.md`)

Core instructions:
- Read `spec.md`, `feature-list.json`, `progress.txt`, `feedback.md` at start
- Work on ONE pending feature at a time (first pending in order)
- After completing a feature: git commit, update feature-list.json status, update progress.txt
- If feedback.md exists, address feedback items before moving to new features
- Write progress.txt in human-readable format (for next context window)

### 7.3 Evaluator (`prompts/evaluator.md`)

Core instructions:
- Adversarial persona: "You are a ruthless QA engineer. Your value is in finding problems."
- Load criteria.yaml, execute checklist items BEFORE assigning scores
- Must find at least 3 concrete issues (if you can't, you're not looking hard enough)
- Output scores.json with per-dimension scores
- Output feedback.md with specific, actionable improvements (file paths, component names, concrete suggestions)
- Scores derive from checklist pass rate, not subjective feeling

## 8. Process Communication

All inter-agent communication is via the filesystem. No IPC, no sockets, no shared memory.

```
Planner writes → spec.md, feature-list.json
Generator reads → spec.md, feature-list.json, progress.txt, feedback.md
Generator writes → code files, git commits, feature-list.json, progress.txt
Evaluator reads → criteria.yaml, codebase, feature-list.json
Evaluator writes → scores.json, feedback.md
Harness reads → all state files for orchestration decisions
```

The `--system-prompt` flag or appending to the `-p` prompt injects the role-specific system prompt. The task prompt tells the agent what files to read.

## 9. Error Handling

- **Agent process crash (non-zero exit)**: Log error, retry once. If second failure, abort with state preserved for `--resume`.
- **Missing output files after agent run**: Treat as failure, retry once.
- **All features stuck (no progress across 2 consecutive generator runs)**: Abort — the task may be too hard for automated implementation.
- **State file corruption**: Validate YAML/JSON on every read. If corrupt, attempt recovery from git history.

## 10. Testing Strategy

- **Unit tests**: State store, feature list, config loader, criteria loader, event system
- **Integration tests**: Process manager with mock claude binary (shell script that writes expected output files)
- **E2E tests**: Full loop with a trivial task against actual Claude Code (expensive, run manually)

Test framework: vitest (matches TS ecosystem).
