# AGENTS.md — harnex

Guide for AI agents working on this codebase.

## Quick Start

```bash
pnpm install
pnpm test           # must pass before and after changes
npx tsc --noEmit    # must have zero errors
pnpm lint           # biome check, fix with pnpm lint:fix
```

## Where Things Are

| What | Where |
|------|-------|
| Shared types | `src/types.ts` |
| CLI entry | `bin/harnex.ts` |
| Core loop | `src/orchestrator/loop.ts` |
| Process spawning | `src/orchestrator/process-manager.ts` |
| State files | `src/state/` (feature-list, state-store, progress) |
| Evaluation | `src/evaluator/` (criteria-loader, scoring) |
| Events/output | `src/events/` (emitter, text-renderer) |
| Config | `src/config/loader.ts` |
| Agent prompts | `prompts/` (planner.md, generator.md, evaluator.md) |
| Templates | `templates/` (harnex.yaml, criteria/default.yaml) |
| Tests | `tests/` (mirrors src/ structure) |

## How the System Works

1. `harnex run --spec "..."` calls `runHarnessLoop()` in `src/orchestrator/loop.ts`
2. Loop spawns `claude -p` subprocesses via `ProcessManager`
3. Each agent reads/writes files in the target project directory
4. State flows through filesystem: `spec.md` → `feature-list.json` → `progress.txt` → `scores.json` → `feedback.md`
5. `.harnex/state.yaml` tracks orchestration state (phase, iteration, resets)

## Adding a New Agent Role

1. Add the role to `AgentRole` type in `src/types.ts`
2. Create a system prompt in `prompts/<role>.md`
3. Add role config to `HarnessConfig` and `DEFAULT_CONFIG` in `src/config/loader.ts`
4. Add prefix color in `src/events/text-renderer.ts`
5. Wire it into `src/orchestrator/loop.ts`

## Testing

- Tests use `vitest` with temp directories (`.test-tmp/`)
- Process manager tests use `tests/fixtures/mock-claude.sh` (a bash script that simulates claude CLI)
- Integration tests spawn the real CLI via `execFileSync`
- No tests require actual Claude API access

## Formatting

- biome: tabs, 100 char width
- Run `pnpm lint:fix` before committing
- Commit format: `feat:`, `fix:`, `chore:`
