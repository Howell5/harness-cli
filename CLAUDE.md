# CLAUDE.md — harnex

## Project Overview

Multi-agent orchestration CLI on top of Claude Code. Spawns `claude` CLI subprocesses with role-specific system prompts (Planner → Generator → Evaluator) and coordinates them via filesystem state.

## Tech Stack

- TypeScript (ESM, Node16 module resolution)
- pnpm, tsx (dev), tsup (build to JS for npm publish)
- vitest for testing
- biome for lint/format (tabs, 100 char line width)
- yaml + chalk as runtime dependencies

## Architecture

```
bin/harnex.ts           CLI entry point (parseArgs routing)
src/commands/           Thin command handlers (run, plan, eval)
src/orchestrator/       Core loop + process manager
src/state/              Filesystem state (feature-list.json, state.yaml, progress.txt)
src/evaluator/          Criteria loading + weighted scoring
src/events/             Typed event emitter + colored text renderer
src/config/             harnex.yaml loader with deep merge
prompts/                System prompts for planner/generator/evaluator agents
templates/              Default config + criteria YAML templates
```

## Key Patterns

- **All inter-agent communication is via filesystem.** No IPC, no sockets.
- **Process manager** spawns `claude -p` with `--system-prompt`, `--allowedTools`, `--max-turns`, `--output-format text`.
- **Context reset** = kill the generator process and restart with fresh context. `progress.txt` carries state across windows.
- **Evaluation** is checklist-driven: `(passed / total) * 10` per dimension, then weighted average.

## Commands

```bash
pnpm test              # vitest run (33 tests, 11 files)
pnpm lint              # biome check src/ bin/ tests/
pnpm lint:fix          # biome check --write
npx tsc --noEmit       # type check
```

## Conventions

- Types in `src/types.ts` — single source of truth
- Tests mirror source: `src/foo/bar.ts` → `tests/foo/bar.test.ts`
- TDD: test first, implement, verify
- One commit per logical unit
- Prefer Node.js built-ins (`parseArgs`, `child_process`) over external deps
