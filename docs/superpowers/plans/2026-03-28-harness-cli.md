# Harness CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI tool that orchestrates multiple Claude Code instances (Planner, Generator, Evaluator) to implement complex coding tasks with iterative quality feedback.

**Architecture:** CLI subprocess orchestration — harness spawns `claude` CLI processes with role-specific system prompts, coordinates via filesystem state files (feature-list.json, progress.txt, feedback.md), and controls the generate-evaluate loop with configurable iteration/threshold limits.

**Tech Stack:** TypeScript, Node.js 20+, pnpm, tsx (runtime), vitest (testing), yaml (config parsing), chalk (colors)

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/types.ts` | All shared types: HarnessConfig, AgentConfig, AgentRole, AgentResult, HarnessState, Feature, EvalScores, HarnessEvent |
| `src/events/emitter.ts` | Typed EventEmitter for HarnessEvent |
| `src/events/text-renderer.ts` | Subscribes to emitter, formats colored prefix output |
| `src/config/loader.ts` | Load/validate/merge harness.yaml with defaults |
| `src/state/feature-list.ts` | CRUD for feature-list.json |
| `src/state/state-store.ts` | CRUD for .harness/state.yaml |
| `src/state/progress.ts` | Generate progress.txt from state + feature list |
| `src/evaluator/criteria-loader.ts` | Load/validate criteria.yaml |
| `src/evaluator/scoring.ts` | Calculate weighted scores from eval output |
| `src/orchestrator/process-manager.ts` | Spawn/monitor/terminate claude CLI processes |
| `src/orchestrator/loop.ts` | Main orchestration: plan, generate, evaluate, decide |
| `src/commands/run.ts` | `harness run` command handler |
| `src/commands/plan.ts` | `harness plan` command handler |
| `src/commands/eval.ts` | `harness eval` command handler |
| `bin/harness.ts` | CLI entry point, arg parsing, command routing |
| `prompts/planner.md` | Planner agent system prompt |
| `prompts/generator.md` | Generator agent system prompt |
| `prompts/evaluator.md` | Evaluator agent system prompt |
| `templates/harness.yaml` | Default config template |
| `templates/criteria/default.yaml` | Default evaluation criteria |

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `src/types.ts`
- Create: `.gitignore`

- [ ] **Step 1: Initialize package.json**

Run `pnpm init`, then edit `package.json` to:

```json
{
  "name": "harness-cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "harness": "./bin/harness.ts"
  },
  "scripts": {
    "dev": "tsx bin/harness.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "biome check src/ bin/ tests/",
    "lint:fix": "biome check --write src/ bin/ tests/"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
pnpm add yaml@latest chalk@latest
pnpm add -D typescript@latest tsx@latest vitest@latest @biomejs/biome@latest @types/node@latest
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*", "bin/**/*", "tests/**/*"]
}
```

- [ ] **Step 4: Create biome.json**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "tab",
    "lineWidth": 100
  }
}
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.test-tmp/
*.tsbuildinfo
```

- [ ] **Step 6: Create src/types.ts with all shared types**

```typescript
export type AgentRole = "planner" | "generator" | "evaluator";

export interface AgentConfig {
  role: AgentRole;
  systemPrompt: string;
  allowedTools: string[];
  maxTurns?: number;
  inputPrompt: string;
  workingDir: string;
}

export interface AgentResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface Feature {
  id: string;
  desc: string;
  status: "pending" | "in_progress" | "completed";
  commit?: string;
}

export interface EvalScores {
  [dimension: string]: number;
}

export interface EvaluationRecord {
  iteration: number;
  scores: EvalScores;
  weighted_avg: number;
  passed: boolean;
  feedback_file: string;
}

export interface HarnessState {
  version: string;
  task: {
    id: string;
    description: string;
    spec_file: string;
    started_at: string;
  };
  progress: {
    phase: "planning" | "generation" | "evaluation" | "complete";
    iteration: number;
    max_iterations: number;
    features_total: number;
    features_completed: number;
  };
  context: {
    generator_reset_count: number;
    last_reset_at: string | null;
  };
  evaluations: EvaluationRecord[];
}

export interface AgentYamlConfig {
  max_turns?: number;
  allowed_tools: string[];
  criteria_file?: string;
}

export interface HarnessConfig {
  max_iterations: number;
  passing_threshold: number;
  generator: AgentYamlConfig;
  evaluator: AgentYamlConfig;
  planner: AgentYamlConfig;
  prompts: {
    planner: string;
    generator: string;
    evaluator: string;
  };
}

export interface CriteriaDimension {
  id: string;
  weight: number;
  checklist: string[];
  tool?: string;
}

export interface CriteriaConfig {
  dimensions: CriteriaDimension[];
  passing_threshold: number;
}

export type HarnessEvent =
  | { type: "harness:start"; task: string }
  | { type: "harness:done"; iterations: number; resets: number; score: number }
  | { type: "agent:start"; agent: AgentRole }
  | { type: "agent:output"; agent: AgentRole; line: string }
  | { type: "agent:exit"; agent: AgentRole; exitCode: number }
  | { type: "agent:reset"; agent: AgentRole; count: number }
  | { type: "eval:score"; iteration: number; scores: EvalScores; avg: number; passed: boolean }
  | { type: "feature:complete"; id: string; desc: string; commit?: string }
  | { type: "error"; message: string };

export type Verbosity = 0 | 1 | 2;
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json biome.json .gitignore src/types.ts
git commit -m "feat: scaffold project with types, tooling config"
```

---

### Task 2: Event System

**Files:**
- Create: `src/events/emitter.ts`
- Create: `src/events/text-renderer.ts`
- Create: `tests/events/emitter.test.ts`
- Create: `tests/events/text-renderer.test.ts`

- [ ] **Step 1: Write failing test for emitter**

Write `tests/events/emitter.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { HarnessEmitter } from "../../src/events/emitter.js";

describe("HarnessEmitter", () => {
  it("emits and receives typed events", () => {
    const emitter = new HarnessEmitter();
    const handler = vi.fn();
    emitter.on(handler);
    emitter.emit({ type: "harness:start", task: "test task" });
    expect(handler).toHaveBeenCalledWith({ type: "harness:start", task: "test task" });
  });

  it("supports multiple listeners", () => {
    const emitter = new HarnessEmitter();
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    emitter.on(handler1);
    emitter.on(handler2);
    emitter.emit({ type: "error", message: "boom" });
    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
  });

  it("supports unsubscribe via returned function", () => {
    const emitter = new HarnessEmitter();
    const handler = vi.fn();
    const unsub = emitter.on(handler);
    unsub();
    emitter.emit({ type: "error", message: "should not receive" });
    expect(handler).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/events/emitter.test.ts
```

Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement emitter**

Write `src/events/emitter.ts`:

```typescript
import type { HarnessEvent } from "../types.js";

type EventHandler = (event: HarnessEvent) => void;

export class HarnessEmitter {
  private handlers: Set<EventHandler> = new Set();

  on(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  emit(event: HarnessEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/events/emitter.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Write failing test for text renderer**

Write `tests/events/text-renderer.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { HarnessEmitter } from "../../src/events/emitter.js";
import { TextRenderer } from "../../src/events/text-renderer.js";

describe("TextRenderer", () => {
  it("renders harness:start with [HARNESS] prefix", () => {
    const emitter = new HarnessEmitter();
    const output: string[] = [];
    new TextRenderer(emitter, 0, (line) => output.push(line));
    emitter.emit({ type: "harness:start", task: "test task" });
    expect(output).toHaveLength(1);
    expect(output[0]).toContain("[HARNESS]");
    expect(output[0]).toContain("test task");
  });

  it("renders agent:output only at verbosity >= 1", () => {
    const emitter = new HarnessEmitter();
    const output: string[] = [];
    new TextRenderer(emitter, 0, (line) => output.push(line));
    emitter.emit({ type: "agent:output", agent: "generator", line: "writing file" });
    expect(output).toHaveLength(0);

    const output2: string[] = [];
    const emitter2 = new HarnessEmitter();
    new TextRenderer(emitter2, 1, (line) => output2.push(line));
    emitter2.emit({ type: "agent:output", agent: "generator", line: "writing file" });
    expect(output2).toHaveLength(1);
    expect(output2[0]).toContain("[GEN]");
  });

  it("renders eval:score with score value", () => {
    const emitter = new HarnessEmitter();
    const output: string[] = [];
    new TextRenderer(emitter, 0, (line) => output.push(line));
    emitter.emit({
      type: "eval:score",
      iteration: 1,
      scores: { functionality: 8.5, code_quality: 7.2 },
      avg: 7.85,
      passed: false,
    });
    expect(output).toHaveLength(1);
    expect(output[0]).toContain("[EVAL]");
    expect(output[0]).toContain("7.85");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run tests/events/text-renderer.test.ts
```

Expected: FAIL.

- [ ] **Step 7: Implement text renderer**

Write `src/events/text-renderer.ts`:

```typescript
import chalk from "chalk";
import type { AgentRole, HarnessEvent, Verbosity } from "../types.js";

type OutputFn = (line: string) => void;

const AGENT_PREFIX: Record<AgentRole, string> = {
  planner: chalk.cyan("[PLAN]    "),
  generator: chalk.green("[GEN]     "),
  evaluator: chalk.yellow("[EVAL]    "),
};

const HARNESS_PREFIX = chalk.white.bold("[HARNESS] ");
const ERROR_PREFIX = chalk.red("[ERROR]   ");

export class TextRenderer {
  private unsub: () => void;

  constructor(
    emitter: { on: (handler: (event: HarnessEvent) => void) => () => void },
    private verbosity: Verbosity,
    private output: OutputFn = console.log,
  ) {
    this.unsub = emitter.on((event) => this.handle(event));
  }

  dispose(): void {
    this.unsub();
  }

  private handle(event: HarnessEvent): void {
    switch (event.type) {
      case "harness:start":
        this.output(`${HARNESS_PREFIX}Task started: ${event.task}`);
        break;
      case "harness:done":
        this.output(
          `${HARNESS_PREFIX}${chalk.green("✓")} Done, ${event.iterations} iteration(s), ${event.resets} reset(s), final score ${event.score}`,
        );
        break;
      case "agent:start":
        this.output(`${AGENT_PREFIX[event.agent]}Starting...`);
        break;
      case "agent:output":
        if (this.verbosity >= 1) {
          this.output(`${AGENT_PREFIX[event.agent]}${event.line}`);
        }
        break;
      case "agent:exit":
        if (this.verbosity >= 1) {
          this.output(`${AGENT_PREFIX[event.agent]}Exited (code ${event.exitCode})`);
        }
        break;
      case "agent:reset":
        this.output(
          `${AGENT_PREFIX[event.agent]}${chalk.yellow("⚠")} Context reset #${event.count}`,
        );
        break;
      case "eval:score": {
        const scoreEntries = Object.entries(event.scores)
          .map(([k, v]) => `${k} ${v}`)
          .join(" / ");
        const indicator = event.passed ? chalk.green("✓") : chalk.red("✗");
        this.output(`${AGENT_PREFIX.evaluator}${scoreEntries} → avg ${event.avg} ${indicator}`);
        break;
      }
      case "feature:complete":
        this.output(
          `${AGENT_PREFIX.generator}${event.id}: ${event.desc} ${chalk.green("✓")}${event.commit ? `  commit ${event.commit}` : ""}`,
        );
        break;
      case "error":
        this.output(`${ERROR_PREFIX}${event.message}`);
        break;
    }
  }
}
```

- [ ] **Step 8: Run all event tests**

```bash
npx vitest run tests/events/
```

Expected: 6 tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/events/ tests/events/
git commit -m "feat: event emitter and text renderer with colored output"
```

---

### Task 3: Config Loader

**Files:**
- Create: `src/config/loader.ts`
- Create: `templates/harness.yaml`
- Create: `tests/config/loader.test.ts`

- [ ] **Step 1: Write failing test**

Write `tests/config/loader.test.ts`:

```typescript
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, DEFAULT_CONFIG } from "../../src/config/loader.js";

const TMP = join(import.meta.dirname, "../../.test-tmp/config");

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("loadConfig", () => {
  it("returns defaults when no config file provided", () => {
    const config = loadConfig();
    expect(config.max_iterations).toBe(DEFAULT_CONFIG.max_iterations);
    expect(config.passing_threshold).toBe(DEFAULT_CONFIG.passing_threshold);
    expect(config.generator.max_turns).toBe(50);
  });

  it("merges user config over defaults", () => {
    const userConfig = join(TMP, "harness.yaml");
    writeFileSync(userConfig, "max_iterations: 5\npassing_threshold: 9.0\n");
    const config = loadConfig(userConfig);
    expect(config.max_iterations).toBe(5);
    expect(config.passing_threshold).toBe(9.0);
    expect(config.generator.max_turns).toBe(50);
  });

  it("throws on invalid YAML", () => {
    const badFile = join(TMP, "bad.yaml");
    writeFileSync(badFile, "{{invalid yaml");
    expect(() => loadConfig(badFile)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/config/loader.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement config loader**

Write `src/config/loader.ts`:

```typescript
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { HarnessConfig } from "../types.js";

export const DEFAULT_CONFIG: HarnessConfig = {
  max_iterations: 15,
  passing_threshold: 7.5,
  generator: {
    max_turns: 50,
    allowed_tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
  },
  evaluator: {
    allowed_tools: ["Read", "Bash", "Glob", "Grep"],
    criteria_file: "./criteria/default.yaml",
  },
  planner: {
    allowed_tools: ["Read", "Write", "Glob", "Grep"],
  },
  prompts: {
    planner: "./prompts/planner.md",
    generator: "./prompts/generator.md",
    evaluator: "./prompts/evaluator.md",
  },
};

export function loadConfig(configPath?: string): HarnessConfig {
  if (!configPath) {
    return structuredClone(DEFAULT_CONFIG);
  }
  const raw = readFileSync(configPath, "utf-8");
  const userConfig = parseYaml(raw);
  if (typeof userConfig !== "object" || userConfig === null) {
    throw new Error(`Invalid config file: ${configPath}`);
  }
  return deepMerge(structuredClone(DEFAULT_CONFIG), userConfig) as HarnessConfig;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      typeof sourceVal === "object" &&
      sourceVal !== null &&
      !Array.isArray(sourceVal) &&
      typeof targetVal === "object" &&
      targetVal !== null &&
      !Array.isArray(targetVal)
    ) {
      target[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      target[key] = sourceVal;
    }
  }
  return target;
}
```

- [ ] **Step 4: Create default template**

Write `templates/harness.yaml`:

```yaml
# Harness CLI configuration
# Copy to your project root as harness.yaml and customize

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

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/config/loader.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/config/ templates/harness.yaml tests/config/
git commit -m "feat: config loader with YAML parsing and default merging"
```

---

### Task 4: State Management

**Files:**
- Create: `src/state/feature-list.ts`
- Create: `src/state/state-store.ts`
- Create: `src/state/progress.ts`
- Create: `tests/state/feature-list.test.ts`
- Create: `tests/state/state-store.test.ts`
- Create: `tests/state/progress.test.ts`

- [ ] **Step 1: Write failing test for feature list**

Write `tests/state/feature-list.test.ts`:

```typescript
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadFeatureList, saveFeatureList, getPendingFeatures, getCompletedCount, isAllComplete,
} from "../../src/state/feature-list.js";

const TMP = join(import.meta.dirname, "../../.test-tmp/features");
beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("feature-list", () => {
  const filePath = () => join(TMP, "feature-list.json");

  it("saves and loads feature list", () => {
    const features = [
      { id: "feat-001", desc: "Add login", status: "pending" as const },
      { id: "feat-002", desc: "Add logout", status: "completed" as const, commit: "abc123" },
    ];
    saveFeatureList(filePath(), features);
    expect(loadFeatureList(filePath())).toEqual(features);
  });

  it("returns empty array if file does not exist", () => {
    expect(loadFeatureList(join(TMP, "nonexistent.json"))).toEqual([]);
  });

  it("getPendingFeatures returns only pending items", () => {
    const features = [
      { id: "feat-001", desc: "A", status: "completed" as const },
      { id: "feat-002", desc: "B", status: "pending" as const },
      { id: "feat-003", desc: "C", status: "in_progress" as const },
    ];
    expect(getPendingFeatures(features)).toEqual([features[1]]);
  });

  it("getCompletedCount returns correct count", () => {
    const features = [
      { id: "feat-001", desc: "A", status: "completed" as const },
      { id: "feat-002", desc: "B", status: "completed" as const },
      { id: "feat-003", desc: "C", status: "pending" as const },
    ];
    expect(getCompletedCount(features)).toBe(2);
  });

  it("isAllComplete works correctly", () => {
    expect(isAllComplete([
      { id: "1", desc: "A", status: "completed" },
      { id: "2", desc: "B", status: "completed" },
    ])).toBe(true);
    expect(isAllComplete([
      { id: "1", desc: "A", status: "completed" },
      { id: "2", desc: "B", status: "pending" },
    ])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/state/feature-list.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement feature list**

Write `src/state/feature-list.ts`:

```typescript
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { Feature } from "../types.js";

export function loadFeatureList(filePath: string): Feature[] {
  if (!existsSync(filePath)) return [];
  return JSON.parse(readFileSync(filePath, "utf-8")) as Feature[];
}

export function saveFeatureList(filePath: string, features: Feature[]): void {
  writeFileSync(filePath, JSON.stringify(features, null, 2) + "\n");
}

export function getPendingFeatures(features: Feature[]): Feature[] {
  return features.filter((f) => f.status === "pending");
}

export function getCompletedCount(features: Feature[]): number {
  return features.filter((f) => f.status === "completed").length;
}

export function isAllComplete(features: Feature[]): boolean {
  return features.length > 0 && features.every((f) => f.status === "completed");
}
```

- [ ] **Step 4: Run feature list tests**

```bash
npx vitest run tests/state/feature-list.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Write failing test for state store**

Write `tests/state/state-store.test.ts`:

```typescript
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StateStore } from "../../src/state/state-store.js";

const TMP = join(import.meta.dirname, "../../.test-tmp/state");
beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("StateStore", () => {
  it("creates initial state for a new task", () => {
    const store = new StateStore(TMP);
    const state = store.initialize("Build a todo app", 15);
    expect(state.version).toBe("1");
    expect(state.task.description).toBe("Build a todo app");
    expect(state.progress.phase).toBe("planning");
    expect(existsSync(join(TMP, "state.yaml"))).toBe(true);
  });

  it("loads existing state", () => {
    const store = new StateStore(TMP);
    store.initialize("Build a todo app", 15);
    const loaded = new StateStore(TMP).load();
    expect(loaded).not.toBeNull();
    expect(loaded!.task.description).toBe("Build a todo app");
  });

  it("returns null when no state file exists", () => {
    const emptyDir = join(TMP, "empty");
    mkdirSync(emptyDir, { recursive: true });
    expect(new StateStore(emptyDir).load()).toBeNull();
  });

  it("updates phase", () => {
    const store = new StateStore(TMP);
    store.initialize("task", 10);
    store.updatePhase("generation");
    expect(store.load()!.progress.phase).toBe("generation");
  });

  it("records evaluation", () => {
    const store = new StateStore(TMP);
    store.initialize("task", 10);
    store.addEvaluation({
      iteration: 1,
      scores: { quality: 8.0 },
      weighted_avg: 8.0,
      passed: true,
      feedback_file: ".harness/feedback/iter-1.md",
    });
    const loaded = store.load()!;
    expect(loaded.evaluations).toHaveLength(1);
    expect(loaded.evaluations[0].weighted_avg).toBe(8.0);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
npx vitest run tests/state/state-store.test.ts
```

Expected: FAIL.

- [ ] **Step 7: Implement state store**

Write `src/state/state-store.ts`:

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { EvaluationRecord, HarnessState } from "../types.js";

export class StateStore {
  private filePath: string;

  constructor(private harnessDir: string) {
    this.filePath = join(harnessDir, "state.yaml");
  }

  initialize(description: string, maxIterations: number): HarnessState {
    mkdirSync(this.harnessDir, { recursive: true });
    const now = new Date().toISOString();
    const taskId = `task-${now.slice(0, 10).replace(/-/g, "")}-${String(Math.floor(Math.random() * 1000)).padStart(3, "0")}`;

    const state: HarnessState = {
      version: "1",
      task: { id: taskId, description, spec_file: "./spec.md", started_at: now },
      progress: {
        phase: "planning",
        iteration: 0,
        max_iterations: maxIterations,
        features_total: 0,
        features_completed: 0,
      },
      context: { generator_reset_count: 0, last_reset_at: null },
      evaluations: [],
    };
    this.save(state);
    return state;
  }

  load(): HarnessState | null {
    if (!existsSync(this.filePath)) return null;
    return parseYaml(readFileSync(this.filePath, "utf-8")) as HarnessState;
  }

  updatePhase(phase: HarnessState["progress"]["phase"]): void {
    const state = this.loadOrThrow();
    state.progress.phase = phase;
    this.save(state);
  }

  updateProgress(featuresTotal: number, featuresCompleted: number): void {
    const state = this.loadOrThrow();
    state.progress.features_total = featuresTotal;
    state.progress.features_completed = featuresCompleted;
    this.save(state);
  }

  incrementIteration(): void {
    const state = this.loadOrThrow();
    state.progress.iteration++;
    this.save(state);
  }

  recordReset(): void {
    const state = this.loadOrThrow();
    state.context.generator_reset_count++;
    state.context.last_reset_at = new Date().toISOString();
    this.save(state);
  }

  addEvaluation(record: EvaluationRecord): void {
    const state = this.loadOrThrow();
    state.evaluations.push(record);
    this.save(state);
  }

  private loadOrThrow(): HarnessState {
    const state = this.load();
    if (!state) throw new Error("No state file found");
    return state;
  }

  private save(state: HarnessState): void {
    writeFileSync(this.filePath, stringifyYaml(state));
  }
}
```

- [ ] **Step 8: Run state store tests**

```bash
npx vitest run tests/state/state-store.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 9: Write failing test for progress writer**

Write `tests/state/progress.test.ts`:

```typescript
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeProgressFile } from "../../src/state/progress.js";
import type { Feature, HarnessState } from "../../src/types.js";

const TMP = join(import.meta.dirname, "../../.test-tmp/progress");
beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("writeProgressFile", () => {
  it("generates human-readable progress", () => {
    const state: HarnessState = {
      version: "1",
      task: { id: "t-001", description: "Build feature X", spec_file: "./spec.md", started_at: "2026-03-28T10:00:00Z" },
      progress: { phase: "generation", iteration: 2, max_iterations: 15, features_total: 3, features_completed: 1 },
      context: { generator_reset_count: 1, last_reset_at: "2026-03-28T11:00:00Z" },
      evaluations: [],
    };
    const features: Feature[] = [
      { id: "feat-001", desc: "Login page", status: "completed", commit: "abc123" },
      { id: "feat-002", desc: "Dashboard", status: "in_progress" },
      { id: "feat-003", desc: "Settings", status: "pending" },
    ];
    const filePath = join(TMP, "progress.txt");
    writeProgressFile(filePath, state, features);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("Build feature X");
    expect(content).toContain("feat-001");
    expect(content).toContain("Login page");
    expect(content).toContain("feat-003");
  });
});
```

- [ ] **Step 10: Implement progress writer**

Write `src/state/progress.ts`:

```typescript
import { writeFileSync } from "node:fs";
import type { Feature, HarnessState } from "../types.js";

export function writeProgressFile(
  filePath: string,
  state: HarnessState,
  features: Feature[],
  feedbackSummary?: string,
): void {
  const lines: string[] = [];
  lines.push(`# Task: ${state.task.description}`);
  lines.push(
    `# Phase: ${state.progress.phase}, iteration ${state.progress.iteration}/${state.progress.max_iterations}, resets: ${state.context.generator_reset_count}`,
  );
  lines.push("");

  const completed = features.filter((f) => f.status === "completed");
  if (completed.length > 0) {
    lines.push(`## Completed (${completed.length}/${features.length})`);
    for (const f of completed) {
      lines.push(`- [${f.id}] ${f.desc} ✓${f.commit ? ` commit ${f.commit}` : ""}`);
    }
    lines.push("");
  }

  const inProgress = features.filter((f) => f.status === "in_progress");
  if (inProgress.length > 0) {
    lines.push("## In Progress");
    for (const f of inProgress) lines.push(`- [${f.id}] ${f.desc}`);
    lines.push("");
  }

  const pending = features.filter((f) => f.status === "pending");
  if (pending.length > 0) {
    lines.push("## Pending");
    for (const f of pending) lines.push(`- [${f.id}] ${f.desc}`);
    lines.push("");
  }

  if (feedbackSummary) {
    lines.push("## Last Evaluation Feedback");
    lines.push(feedbackSummary);
    lines.push("");
  }

  writeFileSync(filePath, lines.join("\n") + "\n");
}
```

- [ ] **Step 11: Run all state tests**

```bash
npx vitest run tests/state/
```

Expected: 11 tests pass.

- [ ] **Step 12: Commit**

```bash
git add src/state/ tests/state/
git commit -m "feat: state management — feature list, state store, progress writer"
```

---

### Task 5: Criteria Loader + Scoring

**Files:**
- Create: `src/evaluator/criteria-loader.ts`
- Create: `src/evaluator/scoring.ts`
- Create: `templates/criteria/default.yaml`
- Create: `tests/evaluator/criteria-loader.test.ts`
- Create: `tests/evaluator/scoring.test.ts`

- [ ] **Step 1: Write failing test for criteria loader**

Write `tests/evaluator/criteria-loader.test.ts`:

```typescript
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCriteria } from "../../src/evaluator/criteria-loader.js";

const TMP = join(import.meta.dirname, "../../.test-tmp/criteria");
beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("loadCriteria", () => {
  it("loads and validates criteria YAML", () => {
    const file = join(TMP, "criteria.yaml");
    writeFileSync(file, `dimensions:
  - id: functionality
    weight: 0.6
    checklist:
      - "App starts without errors"
  - id: code_quality
    weight: 0.4
    checklist:
      - "No TypeScript errors"
passing_threshold: 7.5
`);
    const criteria = loadCriteria(file);
    expect(criteria.dimensions).toHaveLength(2);
    expect(criteria.dimensions[0].id).toBe("functionality");
    expect(criteria.passing_threshold).toBe(7.5);
  });

  it("throws if weights do not sum to 1.0", () => {
    const file = join(TMP, "bad.yaml");
    writeFileSync(file, `dimensions:
  - id: a
    weight: 0.3
    checklist: ["x"]
  - id: b
    weight: 0.3
    checklist: ["y"]
passing_threshold: 7.0
`);
    expect(() => loadCriteria(file)).toThrow(/weights must sum to 1/i);
  });

  it("throws if dimensions array is empty", () => {
    const file = join(TMP, "empty.yaml");
    writeFileSync(file, "dimensions: []\npassing_threshold: 7.0\n");
    expect(() => loadCriteria(file)).toThrow(/at least one dimension/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/evaluator/criteria-loader.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement criteria loader**

Write `src/evaluator/criteria-loader.ts`:

```typescript
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import type { CriteriaConfig } from "../types.js";

export function loadCriteria(filePath: string): CriteriaConfig {
  const raw = readFileSync(filePath, "utf-8");
  const config = parseYaml(raw) as CriteriaConfig;
  if (!config.dimensions || config.dimensions.length === 0) {
    throw new Error("Criteria must have at least one dimension");
  }
  const totalWeight = config.dimensions.reduce((sum, d) => sum + d.weight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    throw new Error(`Dimension weights must sum to 1.0, got ${totalWeight.toFixed(2)}`);
  }
  return config;
}
```

- [ ] **Step 4: Write failing test for scoring**

Write `tests/evaluator/scoring.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { calculateWeightedScore } from "../../src/evaluator/scoring.js";
import type { CriteriaConfig, EvalScores } from "../../src/types.js";

describe("calculateWeightedScore", () => {
  it("calculates weighted average", () => {
    const criteria: CriteriaConfig = {
      dimensions: [
        { id: "functionality", weight: 0.6, checklist: [] },
        { id: "code_quality", weight: 0.4, checklist: [] },
      ],
      passing_threshold: 7.5,
    };
    const scores: EvalScores = { functionality: 8.0, code_quality: 7.0 };
    expect(calculateWeightedScore(scores, criteria)).toBeCloseTo(7.6);
  });

  it("handles missing dimension scores by treating as 0", () => {
    const criteria: CriteriaConfig = {
      dimensions: [
        { id: "a", weight: 0.5, checklist: [] },
        { id: "b", weight: 0.5, checklist: [] },
      ],
      passing_threshold: 5.0,
    };
    expect(calculateWeightedScore({ a: 8.0 }, criteria)).toBeCloseTo(4.0);
  });
});
```

- [ ] **Step 5: Implement scoring**

Write `src/evaluator/scoring.ts`:

```typescript
import type { CriteriaConfig, EvalScores } from "../types.js";

export function calculateWeightedScore(scores: EvalScores, criteria: CriteriaConfig): number {
  let total = 0;
  for (const dim of criteria.dimensions) {
    total += (scores[dim.id] ?? 0) * dim.weight;
  }
  return Math.round(total * 100) / 100;
}
```

- [ ] **Step 6: Create default criteria template**

Write `templates/criteria/default.yaml`:

```yaml
dimensions:
  - id: functionality
    weight: 0.40
    checklist:
      - "All features in feature-list.json work as described"
      - "No runtime errors in console"
      - "Page loads without errors"
    tool: bash_command

  - id: code_quality
    weight: 0.35
    checklist:
      - "No TypeScript compilation errors (tsc --noEmit)"
      - "No linter errors"
      - "No unused imports or variables"
    tool: bash_command

  - id: design_consistency
    weight: 0.25
    checklist:
      - "Uses existing project components and patterns"
      - "Follows project naming conventions"
      - "Consistent spacing and layout approach"
    tool: code_review

passing_threshold: 7.5
```

- [ ] **Step 7: Run all evaluator tests**

```bash
npx vitest run tests/evaluator/
```

Expected: 5 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/evaluator/ tests/evaluator/ templates/criteria/
git commit -m "feat: criteria loader and weighted scoring"
```

---

### Task 6: Process Manager

**Files:**
- Create: `src/orchestrator/process-manager.ts`
- Create: `tests/orchestrator/process-manager.test.ts`
- Create: `tests/fixtures/mock-claude.sh`

- [ ] **Step 1: Create mock claude script**

Write `tests/fixtures/mock-claude.sh`:

```bash
#!/bin/bash
# Mock claude CLI for testing process manager
echo "Mock claude running with args: $@"
while [[ $# -gt 0 ]]; do
  case "$1" in
    -p) echo "PROMPT: $2"; shift 2 ;;
    --max-turns) echo "MAX_TURNS: $2"; shift 2 ;;
    *) shift ;;
  esac
done
echo "Mock claude completed"
exit 0
```

Make it executable:

```bash
chmod +x tests/fixtures/mock-claude.sh
```

- [ ] **Step 2: Write failing test**

Write `tests/orchestrator/process-manager.test.ts`:

```typescript
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ProcessManager } from "../../src/orchestrator/process-manager.js";
import { HarnessEmitter } from "../../src/events/emitter.js";
import type { AgentConfig } from "../../src/types.js";

const MOCK_CLAUDE = join(import.meta.dirname, "../fixtures/mock-claude.sh");

describe("ProcessManager", () => {
  it("spawns a process and captures output", async () => {
    const emitter = new HarnessEmitter();
    const events: string[] = [];
    emitter.on((e) => events.push(e.type));

    const pm = new ProcessManager(emitter, MOCK_CLAUDE);
    const result = await pm.spawn({
      role: "planner",
      systemPrompt: "/dev/null",
      allowedTools: ["Read", "Write"],
      inputPrompt: "Plan a todo app",
      workingDir: "/tmp",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Mock claude");
    expect(events).toContain("agent:start");
    expect(events).toContain("agent:exit");
  });

  it("passes max-turns flag", async () => {
    const emitter = new HarnessEmitter();
    const pm = new ProcessManager(emitter, MOCK_CLAUDE);
    const result = await pm.spawn({
      role: "generator",
      systemPrompt: "/dev/null",
      allowedTools: ["Read"],
      maxTurns: 25,
      inputPrompt: "Generate code",
      workingDir: "/tmp",
    });
    expect(result.stdout).toContain("MAX_TURNS: 25");
  });

  it("reports non-zero exit codes", async () => {
    const emitter = new HarnessEmitter();
    const pm = new ProcessManager(emitter, "false");
    const result = await pm.spawn({
      role: "evaluator",
      systemPrompt: "/dev/null",
      allowedTools: [],
      inputPrompt: "Evaluate",
      workingDir: "/tmp",
    });
    expect(result.exitCode).not.toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/orchestrator/process-manager.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement process manager**

Write `src/orchestrator/process-manager.ts`:

```typescript
import { spawn } from "node:child_process";
import type { AgentConfig, AgentResult, HarnessEvent } from "../types.js";

interface Emitter {
  emit(event: HarnessEvent): void;
}

export class ProcessManager {
  constructor(
    private emitter: Emitter,
    private claudeBinary: string = "claude",
  ) {}

  async spawn(config: AgentConfig): Promise<AgentResult> {
    const args = this.buildArgs(config);
    this.emitter.emit({ type: "agent:start", agent: config.role });

    return new Promise((resolve) => {
      const proc = spawn(this.claudeBinary, args, {
        cwd: config.workingDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      proc.stdout.on("data", (data: Buffer) => {
        const text = data.toString();
        stdoutChunks.push(text);
        for (const line of text.split("\n").filter(Boolean)) {
          this.emitter.emit({ type: "agent:output", agent: config.role, line });
        }
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderrChunks.push(data.toString());
      });

      proc.on("close", (code) => {
        const exitCode = code ?? 1;
        this.emitter.emit({ type: "agent:exit", agent: config.role, exitCode });
        resolve({ exitCode, stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") });
      });

      proc.on("error", (err) => {
        this.emitter.emit({ type: "error", message: `Failed to spawn ${config.role}: ${err.message}` });
        resolve({ exitCode: 1, stdout: stdoutChunks.join(""), stderr: err.message });
      });
    });
  }

  private buildArgs(config: AgentConfig): string[] {
    const args = [
      "-p", config.inputPrompt,
      "--system-prompt", config.systemPrompt,
      "--allowedTools", config.allowedTools.join(","),
      "--output-format", "text",
    ];
    if (config.maxTurns !== undefined) {
      args.push("--max-turns", String(config.maxTurns));
    }
    return args;
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/orchestrator/process-manager.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/orchestrator/process-manager.ts tests/orchestrator/ tests/fixtures/
git commit -m "feat: process manager for spawning claude CLI subprocesses"
```

---

### Task 7: System Prompts

**Files:**
- Create: `prompts/planner.md`
- Create: `prompts/generator.md`
- Create: `prompts/evaluator.md`

- [ ] **Step 1: Write planner prompt**

Write `prompts/planner.md`:

````markdown
# Role: Project Planner

You are a meticulous project planner. Your job is to take a vague task description and produce a precise, actionable engineering specification.

## Your Outputs

You MUST create exactly two files in the project root:

### 1. `spec.md`

- **Overview**: What we're building and why
- **Functional Requirements**: Numbered list of specific behaviors
- **Technical Constraints**: Technology choices, patterns to follow, things to avoid
- **Acceptance Criteria**: How to verify each requirement is met
- **Out of Scope**: What we're explicitly NOT building

### 2. `feature-list.json`

A JSON array where each item represents one atomic unit of work:

```json
[
  { "id": "feat-001", "desc": "Description of what to implement", "status": "pending" }
]
```

## Rules

- Over-specify, don't under-specify. If something is ambiguous, make a decision and document it.
- Order features by dependency. feat-002 should not depend on feat-005.
- Each feature should be independently testable.
- Granularity: one commit per feature.
- Read the existing codebase first. Use existing patterns, libraries, and conventions.
````

- [ ] **Step 2: Write generator prompt**

Write `prompts/generator.md`:

````markdown
# Role: Code Generator

You are an implementation-focused developer. Implement features one at a time, following the specification precisely.

## First Steps (Every Time You Start)

1. Read `spec.md` — understand what we're building
2. Read `feature-list.json` — find the first item with status "pending"
3. Read `progress.txt` (if it exists) — understand what's been done so far
4. Read `feedback.md` (if it exists) — address feedback BEFORE starting new features

## Workflow Per Feature

1. Understand the feature and any related existing code
2. Implement the minimal code needed
3. Run any relevant tests or verification
4. Git commit with format: `feat(<feature-id>): <description>`
5. Update `feature-list.json`: set status to "completed", add commit hash
6. Update `progress.txt`: add to completed section

## Rules

- One feature at a time. Do NOT implement multiple features in one go.
- Follow existing patterns and conventions.
- If feedback.md exists, address it first.
- Write progress.txt for the NEXT context window. Assume you might be replaced by a fresh instance.
- Every commit must compile and not break existing functionality.
- Don't over-engineer. Implement exactly what the spec says.

## When Done

If all features in feature-list.json are "completed" and no outstanding feedback, write "ALL_FEATURES_COMPLETE" as the last line of progress.txt.
````

- [ ] **Step 3: Write evaluator prompt**

````markdown
# Role: Critical Evaluator

You are an extremely strict QA engineer and code reviewer. Your job is to find problems, not to praise work.

## Mindset

- You are NOT here to be nice. You are here to be thorough.
- If you can't find at least 3 concrete issues, you haven't looked hard enough.
- Trust evidence (test results, linter output, actual behavior) over impressions.

## Process

1. Read `criteria.yaml` for evaluation dimensions and checklists
2. Read `feature-list.json` for what was supposed to be built
3. Read `spec.md` for full requirements
4. For each dimension: go through EVERY checklist item — PASS or FAIL
5. For each FAIL: document what failed, where (exact file:line), and what the fix should be
6. Calculate dimension score: (passed / total) * 10

### Run these verification commands:
- `tsc --noEmit`
- Project test command (check package.json)
- Project lint command (check package.json)

## Outputs

### 1. `scores.json`

```json
{ "functionality": 7.5, "code_quality": 8.0, "design_consistency": 6.5 }
```

Dimension IDs must match criteria.yaml exactly.

### 2. `feedback.md`

```markdown
# Evaluation Feedback

## Critical Issues (must fix)
- [file:line] Description and specific fix

## Improvements (should fix)
- [file:line] Description and suggestion

## Observations (minor)
- Notes about patterns or potential issues
```

## Rules

- Checklist FIRST, scores SECOND. Do not assign scores then justify.
- Be specific. "Code quality is poor" is useless. "src/utils.ts:45 has unhandled promise rejection" is actionable.
- Verify with tools. Run commands, don't just read code.
- Score honestly. 10/10 means every checklist item passes.
````

- [ ] **Step 4: Commit**

```bash
git add prompts/
git commit -m "feat: system prompts for planner, generator, and evaluator agents"
```

---

### Task 8: Orchestration Loop

**Files:**
- Create: `src/orchestrator/loop.ts`
- Create: `tests/orchestrator/loop.test.ts`

- [ ] **Step 1: Write failing test**

Write `tests/orchestrator/loop.test.ts`:

```typescript
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HarnessEmitter } from "../../src/events/emitter.js";
import { runHarnessLoop } from "../../src/orchestrator/loop.js";
import type { AgentConfig, AgentResult, HarnessConfig } from "../../src/types.js";

const TMP = join(import.meta.dirname, "../../.test-tmp/loop");
beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

function createMockPM(behaviors: Record<string, (config: AgentConfig) => Promise<AgentResult>>) {
  return {
    spawn: vi.fn(async (config: AgentConfig) => {
      const behavior = behaviors[config.role];
      if (!behavior) throw new Error(`No mock for role: ${config.role}`);
      return behavior(config);
    }),
  };
}

describe("runHarnessLoop", () => {
  it("completes full plan-generate-evaluate cycle", async () => {
    const emitter = new HarnessEmitter();
    const events: string[] = [];
    emitter.on((e) => events.push(e.type));

    // Write criteria file
    writeFileSync(join(TMP, "criteria.yaml"), `dimensions:
  - id: functionality
    weight: 0.4
    checklist: ["Works"]
  - id: code_quality
    weight: 0.35
    checklist: ["Clean"]
  - id: design_consistency
    weight: 0.25
    checklist: ["Consistent"]
passing_threshold: 7.5
`);

    const pm = createMockPM({
      planner: async () => {
        writeFileSync(join(TMP, "spec.md"), "# Spec\nBuild a thing\n");
        writeFileSync(join(TMP, "feature-list.json"),
          JSON.stringify([{ id: "feat-001", desc: "Do thing", status: "pending" }]));
        return { exitCode: 0, stdout: "done", stderr: "" };
      },
      generator: async () => {
        writeFileSync(join(TMP, "feature-list.json"),
          JSON.stringify([{ id: "feat-001", desc: "Do thing", status: "completed", commit: "abc" }]));
        writeFileSync(join(TMP, "progress.txt"), "ALL_FEATURES_COMPLETE\n");
        return { exitCode: 0, stdout: "done", stderr: "" };
      },
      evaluator: async () => {
        writeFileSync(join(TMP, "scores.json"),
          JSON.stringify({ functionality: 9.0, code_quality: 8.5, design_consistency: 8.0 }));
        writeFileSync(join(TMP, "feedback.md"), "# Feedback\nLooks good.\n");
        return { exitCode: 0, stdout: "done", stderr: "" };
      },
    });

    const config: HarnessConfig = {
      max_iterations: 5,
      passing_threshold: 7.5,
      generator: { max_turns: 50, allowed_tools: ["Read", "Write", "Bash"] },
      evaluator: { allowed_tools: ["Read", "Bash"], criteria_file: join(TMP, "criteria.yaml") },
      planner: { allowed_tools: ["Read", "Write"] },
      prompts: { planner: "/dev/null", generator: "/dev/null", evaluator: "/dev/null" },
    };

    const result = await runHarnessLoop({
      config,
      projectDir: TMP,
      spec: "Build a thing",
      emitter,
      processManager: pm as any,
    });

    expect(result.success).toBe(true);
    expect(result.iterations).toBe(1);
    expect(pm.spawn).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/orchestrator/loop.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the orchestration loop**

Write `src/orchestrator/loop.ts`:

```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { HarnessConfig, HarnessEvent } from "../types.js";
import { loadCriteria } from "../evaluator/criteria-loader.js";
import { calculateWeightedScore } from "../evaluator/scoring.js";
import { getCompletedCount, isAllComplete, loadFeatureList } from "../state/feature-list.js";
import { writeProgressFile } from "../state/progress.js";
import { StateStore } from "../state/state-store.js";
import type { ProcessManager } from "./process-manager.js";

interface LoopOptions {
  config: HarnessConfig;
  projectDir: string;
  spec: string;
  specFile?: string;
  emitter: { emit(event: HarnessEvent): void };
  processManager: ProcessManager;
}

interface LoopResult {
  success: boolean;
  iterations: number;
  resets: number;
  finalScore: number;
}

export async function runHarnessLoop(options: LoopOptions): Promise<LoopResult> {
  const { config, projectDir, spec, specFile, emitter, processManager } = options;
  const harnessDir = join(projectDir, ".harness");
  const stateStore = new StateStore(harnessDir);
  const featureListPath = join(projectDir, "feature-list.json");
  const progressPath = join(projectDir, "progress.txt");

  emitter.emit({ type: "harness:start", task: spec });
  stateStore.initialize(spec, config.max_iterations);

  // Phase 1: Planning
  const plannerPrompt = specFile
    ? `Read the task from: ${specFile}\n\nCreate spec.md and feature-list.json.`
    : `Task: ${spec}\n\nCreate spec.md and feature-list.json. Read the existing codebase first.`;

  const plannerResult = await processManager.spawn({
    role: "planner",
    systemPrompt: config.prompts.planner,
    allowedTools: config.planner.allowed_tools,
    inputPrompt: plannerPrompt,
    workingDir: projectDir,
  });

  if (plannerResult.exitCode !== 0) {
    emitter.emit({ type: "error", message: `Planner failed (exit ${plannerResult.exitCode})` });
    return { success: false, iterations: 0, resets: 0, finalScore: 0 };
  }

  if (!existsSync(join(projectDir, "spec.md")) || !existsSync(featureListPath)) {
    emitter.emit({ type: "error", message: "Planner did not produce spec.md and/or feature-list.json" });
    return { success: false, iterations: 0, resets: 0, finalScore: 0 };
  }

  const initialFeatures = loadFeatureList(featureListPath);
  stateStore.updatePhase("generation");
  stateStore.updateProgress(initialFeatures.length, 0);

  // Phase 2: Generate + Evaluate loop
  let iteration = 0;
  let resetCount = 0;
  let finalScore = 0;

  while (iteration < config.max_iterations) {
    stateStore.incrementIteration();
    iteration++;

    // Generator loop (may restart multiple times within one iteration)
    let allDone = false;
    let stuckCount = 0;

    while (!allDone) {
      const beforeFeatures = loadFeatureList(featureListPath);
      const beforeCompleted = getCompletedCount(beforeFeatures);

      await processManager.spawn({
        role: "generator",
        systemPrompt: config.prompts.generator,
        allowedTools: config.generator.allowed_tools,
        maxTurns: config.generator.max_turns,
        inputPrompt: buildGeneratorPrompt(projectDir),
        workingDir: projectDir,
      });

      const afterFeatures = loadFeatureList(featureListPath);
      const afterCompleted = getCompletedCount(afterFeatures);
      stateStore.updateProgress(afterFeatures.length, afterCompleted);

      if (isAllComplete(afterFeatures)) {
        allDone = true;
      } else if (afterCompleted > beforeCompleted) {
        // Progress made but not done — context reset
        stuckCount = 0;
        resetCount++;
        stateStore.recordReset();
        emitter.emit({ type: "agent:reset", agent: "generator", count: resetCount });

        const latestState = stateStore.load()!;
        writeProgressFile(progressPath, latestState, afterFeatures);
      } else {
        // No progress
        stuckCount++;
        if (stuckCount >= 2) {
          emitter.emit({ type: "error", message: "Generator stuck — no progress across 2 consecutive runs" });
          return { success: false, iterations: iteration, resets: resetCount, finalScore: 0 };
        }
        resetCount++;
        stateStore.recordReset();
        emitter.emit({ type: "agent:reset", agent: "generator", count: resetCount });
      }
    }

    // Evaluation
    stateStore.updatePhase("evaluation");
    const criteriaPath = config.evaluator.criteria_file || join(projectDir, "criteria.yaml");

    if (!existsSync(criteriaPath)) {
      emitter.emit({ type: "error", message: `Criteria file not found: ${criteriaPath}` });
      return { success: false, iterations: iteration, resets: resetCount, finalScore: 0 };
    }

    const criteria = loadCriteria(criteriaPath);

    await processManager.spawn({
      role: "evaluator",
      systemPrompt: config.prompts.evaluator,
      allowedTools: config.evaluator.allowed_tools,
      inputPrompt: buildEvaluatorPrompt(projectDir, criteriaPath),
      workingDir: projectDir,
    });

    const scoresPath = join(projectDir, "scores.json");
    if (!existsSync(scoresPath)) {
      emitter.emit({ type: "error", message: "Evaluator did not produce scores.json" });
      return { success: false, iterations: iteration, resets: resetCount, finalScore: 0 };
    }

    const scores = JSON.parse(readFileSync(scoresPath, "utf-8"));
    const weightedAvg = calculateWeightedScore(scores, criteria);
    const passed = weightedAvg >= config.passing_threshold;
    finalScore = weightedAvg;

    emitter.emit({ type: "eval:score", iteration, scores, avg: weightedAvg, passed });
    stateStore.addEvaluation({
      iteration, scores, weighted_avg: weightedAvg, passed,
      feedback_file: join(".harness", "feedback", `iter-${iteration}.md`),
    });

    if (passed) {
      stateStore.updatePhase("complete");
      emitter.emit({ type: "harness:done", iterations: iteration, resets: resetCount, score: finalScore });
      return { success: true, iterations: iteration, resets: resetCount, finalScore };
    }

    stateStore.updatePhase("generation");
  }

  emitter.emit({ type: "error", message: `Max iterations (${config.max_iterations}) reached. Score: ${finalScore}` });
  return { success: false, iterations: iteration, resets: resetCount, finalScore };
}

function buildGeneratorPrompt(projectDir: string): string {
  return `Read your input files and implement the next pending feature:
1. Read spec.md for requirements
2. Read feature-list.json to find the next pending feature
3. Read progress.txt (if exists) for context from previous work
4. Read feedback.md (if exists) and address feedback first
5. Implement the feature, commit, and update state files
Working directory: ${projectDir}`;
}

function buildEvaluatorPrompt(projectDir: string, criteriaPath: string): string {
  return `Evaluate the current state of the project:
1. Read the criteria file: ${criteriaPath}
2. Read feature-list.json to see what was built
3. Read spec.md for full requirements
4. Run verification commands (tsc, linter, tests)
5. Check each dimension's checklist items
6. Write scores.json with per-dimension scores
7. Write feedback.md with specific, actionable improvements
Working directory: ${projectDir}`;
}
```

- [ ] **Step 4: Run test**

```bash
npx vitest run tests/orchestrator/loop.test.ts
```

Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add src/orchestrator/loop.ts tests/orchestrator/loop.test.ts
git commit -m "feat: main orchestration loop — plan, generate, evaluate cycle"
```

---

### Task 9: CLI Entry Point + Commands

**Files:**
- Create: `src/commands/run.ts`
- Create: `src/commands/plan.ts`
- Create: `src/commands/eval.ts`
- Create: `bin/harness.ts`

- [ ] **Step 1: Write run command**

Write `src/commands/run.ts`:

```typescript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../config/loader.js";
import { HarnessEmitter } from "../events/emitter.js";
import { TextRenderer } from "../events/text-renderer.js";
import { runHarnessLoop } from "../orchestrator/loop.js";
import { ProcessManager } from "../orchestrator/process-manager.js";
import type { Verbosity } from "../types.js";

export interface RunOptions {
  spec?: string;
  specFile?: string;
  config?: string;
  resume?: boolean;
  verbosity: Verbosity;
}

export async function runCommand(options: RunOptions): Promise<void> {
  if (options.resume) {
    console.error("Resume not yet implemented");
    process.exit(1);
  }

  let taskSpec: string;
  if (options.specFile) {
    taskSpec = readFileSync(resolve(options.specFile), "utf-8");
  } else if (options.spec) {
    taskSpec = options.spec;
  } else {
    console.error("Either --spec or --spec-file is required");
    process.exit(1);
  }

  const config = loadConfig(options.config);
  const emitter = new HarnessEmitter();
  const renderer = new TextRenderer(emitter, options.verbosity);
  const pm = new ProcessManager(emitter);

  const result = await runHarnessLoop({
    config,
    projectDir: process.cwd(),
    spec: taskSpec,
    specFile: options.specFile,
    emitter,
    processManager: pm,
  });

  renderer.dispose();
  process.exit(result.success ? 0 : 1);
}
```

- [ ] **Step 2: Write plan command**

Write `src/commands/plan.ts`:

```typescript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../config/loader.js";
import { HarnessEmitter } from "../events/emitter.js";
import { TextRenderer } from "../events/text-renderer.js";
import { ProcessManager } from "../orchestrator/process-manager.js";
import type { Verbosity } from "../types.js";

export interface PlanOptions {
  spec?: string;
  specFile?: string;
  output?: string;
  config?: string;
  verbosity: Verbosity;
}

export async function planCommand(options: PlanOptions): Promise<void> {
  let taskSpec: string;
  if (options.specFile) {
    taskSpec = readFileSync(resolve(options.specFile), "utf-8");
  } else if (options.spec) {
    taskSpec = options.spec;
  } else {
    console.error("Either --spec or --spec-file is required");
    process.exit(1);
  }

  const config = loadConfig(options.config);
  const emitter = new HarnessEmitter();
  const renderer = new TextRenderer(emitter, options.verbosity);
  const pm = new ProcessManager(emitter);

  const prompt = options.output
    ? `Task: ${taskSpec}\n\nCreate the spec at ${options.output} and feature-list.json.`
    : `Task: ${taskSpec}\n\nCreate spec.md and feature-list.json. Read the existing codebase first.`;

  const result = await pm.spawn({
    role: "planner",
    systemPrompt: config.prompts.planner,
    allowedTools: config.planner.allowed_tools,
    inputPrompt: prompt,
    workingDir: process.cwd(),
  });

  renderer.dispose();
  process.exit(result.exitCode === 0 ? 0 : 1);
}
```

- [ ] **Step 3: Write eval command**

Write `src/commands/eval.ts`:

```typescript
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../config/loader.js";
import { loadCriteria } from "../evaluator/criteria-loader.js";
import { HarnessEmitter } from "../events/emitter.js";
import { TextRenderer } from "../events/text-renderer.js";
import { ProcessManager } from "../orchestrator/process-manager.js";
import type { Verbosity } from "../types.js";

export interface EvalOptions {
  criteria: string;
  url?: string;
  config?: string;
  verbosity: Verbosity;
}

export async function evalCommand(options: EvalOptions): Promise<void> {
  const criteriaPath = resolve(options.criteria);
  if (!existsSync(criteriaPath)) {
    console.error(`Criteria file not found: ${criteriaPath}`);
    process.exit(1);
  }

  loadCriteria(criteriaPath); // validate

  const config = loadConfig(options.config);
  const emitter = new HarnessEmitter();
  const renderer = new TextRenderer(emitter, options.verbosity);
  const pm = new ProcessManager(emitter);

  const prompt = options.url
    ? `Evaluate the project. Criteria: ${criteriaPath}\nURL: ${options.url}\n\nWrite scores.json and feedback.md.`
    : `Evaluate the project. Criteria: ${criteriaPath}\n\nWrite scores.json and feedback.md.`;

  const result = await pm.spawn({
    role: "evaluator",
    systemPrompt: config.prompts.evaluator,
    allowedTools: config.evaluator.allowed_tools,
    inputPrompt: prompt,
    workingDir: process.cwd(),
  });

  renderer.dispose();

  const scoresPath = resolve("scores.json");
  if (existsSync(scoresPath)) {
    console.log("\nScores:", JSON.stringify(JSON.parse(readFileSync(scoresPath, "utf-8")), null, 2));
  }

  process.exit(result.exitCode === 0 ? 0 : 1);
}
```

- [ ] **Step 4: Write CLI entry point**

Write `bin/harness.ts`:

```typescript
#!/usr/bin/env tsx
import { parseArgs } from "node:util";
import type { Verbosity } from "../src/types.js";

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

function getVerbosity(argv: string[]): Verbosity {
  if (argv.includes("-vv")) return 2;
  if (argv.includes("-v")) return 1;
  return 0;
}

async function main() {
  switch (command) {
    case "run": {
      const { values } = parseArgs({
        args: args.slice(1),
        options: {
          spec: { type: "string" },
          "spec-file": { type: "string" },
          config: { type: "string" },
          resume: { type: "boolean", default: false },
        },
        strict: false,
      });
      const { runCommand } = await import("../src/commands/run.js");
      await runCommand({
        spec: values.spec as string | undefined,
        specFile: values["spec-file"] as string | undefined,
        config: values.config as string | undefined,
        resume: values.resume as boolean,
        verbosity: getVerbosity(args),
      });
      break;
    }
    case "plan": {
      const { values } = parseArgs({
        args: args.slice(1),
        options: {
          spec: { type: "string" },
          "spec-file": { type: "string" },
          output: { type: "string" },
          config: { type: "string" },
        },
        strict: false,
      });
      const { planCommand } = await import("../src/commands/plan.js");
      await planCommand({
        spec: values.spec as string | undefined,
        specFile: values["spec-file"] as string | undefined,
        output: values.output as string | undefined,
        config: values.config as string | undefined,
        verbosity: getVerbosity(args),
      });
      break;
    }
    case "eval": {
      const { values } = parseArgs({
        args: args.slice(1),
        options: {
          criteria: { type: "string" },
          url: { type: "string" },
          config: { type: "string" },
        },
        strict: false,
      });
      if (!values.criteria) {
        console.error("--criteria is required for eval command");
        process.exit(1);
      }
      const { evalCommand } = await import("../src/commands/eval.js");
      await evalCommand({
        criteria: values.criteria as string,
        url: values.url as string | undefined,
        config: values.config as string | undefined,
        verbosity: getVerbosity(args),
      });
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`
harness — Multi-agent orchestration for Claude Code

Usage:
  harness run --spec "..."              Full plan → generate → evaluate loop
  harness run --spec-file ./task.md     Spec from file
  harness run --resume                  Resume from .harness/state.yaml
  harness plan --spec "..."             Run planner only
  harness eval --criteria ./criteria.yaml  Run evaluator only

Options:
  --config <path>    Path to harness.yaml config
  -v                 Verbose output (agent actions)
  -vv                Debug output (full claude stdout)
  -h, --help         Show this help
`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
```

- [ ] **Step 5: Make CLI executable and test help**

```bash
chmod +x bin/harness.ts
npx tsx bin/harness.ts --help
```

Expected: prints help text.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/commands/ bin/harness.ts
git commit -m "feat: CLI commands — run, plan, eval with arg parsing"
```

---

### Task 10: Integration Test + Final Verification

**Files:**
- Create: `tests/integration/cli.test.ts`

- [ ] **Step 1: Write integration test**

Write `tests/integration/cli.test.ts`:

```typescript
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const TSX = join(import.meta.dirname, "../../node_modules/.bin/tsx");
const CLI = join(import.meta.dirname, "../../bin/harness.ts");

describe("CLI integration", () => {
  it("prints help with --help flag", () => {
    const output = execFileSync(TSX, [CLI, "--help"], { encoding: "utf-8" });
    expect(output).toContain("harness");
    expect(output).toContain("run");
    expect(output).toContain("plan");
    expect(output).toContain("eval");
  });

  it("prints help with no arguments", () => {
    const output = execFileSync(TSX, [CLI], { encoding: "utf-8" });
    expect(output).toContain("harness");
  });

  it("errors on unknown command", () => {
    try {
      execFileSync(TSX, [CLI, "foobar"], { encoding: "utf-8", stdio: "pipe" });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.status).not.toBe(0);
    }
  });

  it("errors on run without --spec", () => {
    try {
      execFileSync(TSX, [CLI, "run"], { encoding: "utf-8", stdio: "pipe" });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.status).not.toBe(0);
    }
  });
});
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass (~33 total).

- [ ] **Step 3: Run linter and fix issues**

```bash
npx biome check src/ bin/ tests/
```

Fix any issues, then:

```bash
npx biome check --write src/ bin/ tests/
```

- [ ] **Step 4: Final verification**

```bash
npx tsc --noEmit && npx vitest run && npx biome check src/ bin/ tests/
```

Expected: compiles, all tests pass, no lint errors.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: integration tests and final verification"
```
