# harnex

Multi-agent orchestration layer for Claude Code. Coordinates three specialized agents — **Planner**, **Generator**, and **Evaluator** — to implement complex coding tasks with iterative quality feedback.

## How It Works

```
User provides task description
        │
        ▼
   ┌─────────┐
   │ Planner  │  → spec.md + feature-list.json
   └────┬────┘
        │
   ┌────▼────┐
   │Generator │  → code + commits (one feature at a time)
   └────┬────┘
        │         ↺ context reset if max-turns hit
   ┌────▼─────┐
   │Evaluator  │  → scores.json + feedback.md
   └────┬─────┘
        │
   pass? ──yes──→ done
        │
       no → feed back into Generator, repeat
```

- **Planner** expands a vague task into a detailed spec and ordered feature list
- **Generator** implements features one at a time, committing after each. Auto-restarts on context window limits
- **Evaluator** runs checklists (tsc, lint, tests) and scores per dimension. Feedback loops back

All inter-agent communication happens via filesystem (spec.md, feature-list.json, progress.txt, feedback.md). No IPC, no shared memory.

## Prerequisites

- Node.js >= 20
- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- pnpm

## Install

```bash
npm install -g harnex
```

After install, the `harnex` command is available globally.

## Usage

### Full orchestration loop

```bash
# Inline spec
harnex run --spec "Add user authentication with JWT"

# Spec from file
harnex run --spec-file ./task.md

# With custom config
harnex run --spec "..." --config ./harnex.yaml
```

### Run planner only

```bash
harnex plan --spec "Build a dashboard with charts"
```

### Run evaluator only

```bash
harnex eval --criteria ./criteria.yaml
```

### Verbosity

```bash
harnex run --spec "..." -v    # agent actions
harnex run --spec "..." -vv   # full claude stdout
```

## Configuration

Copy `templates/harnex.yaml` to your project root:

```yaml
max_iterations: 15        # max generate→evaluate cycles
passing_threshold: 7.5    # weighted score to pass (0-10)

generator:
  max_turns: 50           # claude --max-turns per run
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
```

## Evaluation Criteria

Define scoring dimensions in a YAML file (see `templates/criteria/default.yaml`):

```yaml
dimensions:
  - id: functionality
    weight: 0.40
    checklist:
      - "All features work as described"
      - "No runtime errors"

  - id: code_quality
    weight: 0.35
    checklist:
      - "No TypeScript errors"
      - "No linter errors"

  - id: design_consistency
    weight: 0.25
    checklist:
      - "Follows project conventions"

passing_threshold: 7.5
```

Weights must sum to 1.0. Scores are calculated as `(passed items / total items) * 10` per dimension, then weighted.

## State Management

Runtime state is stored in `.harnex/` within the target project:

```
.harnex/
  state.yaml          # orchestration state (phase, iteration, progress)
feature-list.json     # feature checklist with status tracking
progress.txt          # human-readable progress for context continuity
spec.md               # generated specification
scores.json           # evaluation scores
feedback.md           # evaluator feedback
```

## Project Structure

```
harnex/
├── bin/harnex.ts               # CLI entry point
├── src/
│   ├── types.ts                # shared type definitions
│   ├── commands/               # run, plan, eval command handlers
│   ├── orchestrator/
│   │   ├── loop.ts             # plan → generate → evaluate cycle
│   │   └── process-manager.ts  # claude CLI subprocess management
│   ├── state/                  # feature-list, state-store, progress
│   ├── evaluator/              # criteria loading + weighted scoring
│   ├── events/                 # typed event emitter + colored output
│   └── config/                 # harnex.yaml loader with defaults
├── prompts/                    # system prompts for each agent role
├── templates/                  # default config + criteria templates
└── tests/                      # vitest — 33 tests across 11 files
```

## Development

```bash
pnpm test           # run tests
pnpm test:watch     # watch mode
pnpm lint           # biome check
pnpm lint:fix       # auto-fix
```

## License

MIT
