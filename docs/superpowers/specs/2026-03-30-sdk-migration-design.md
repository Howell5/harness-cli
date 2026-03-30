# Agent SDK Migration - Design Spec

> Migrate from CLI subprocess (`claude -p`) to Agent SDK (`@anthropic-ai/claude-agent-sdk`) for real-time orchestration visibility
> Date: 2026-03-30

## 1. Problem

harnex spawns `claude -p` as child processes. In `-p` mode, claude CLI outputs nothing during execution — no spinner, no tool call progress, no intermediate feedback. The user sees `Starting...` then silence for minutes, then `Done`. This defeats harnex's core value: making multi-agent orchestration visible.

The Agent SDK provides a structured message stream with real-time events for every tool call and result, enabling us to show exactly what each agent is doing as it works.

## 2. Design

### 2.1 Architecture Change

**Before:**
```
loop.ts → ProcessManager.spawn()
           → child_process.spawn("claude", ["-p", ...])
           → stdout pipe (nearly empty in -p mode)
           → emit agent:output (nothing useful)
```

**After:**
```
loop.ts → ProcessManager.spawn()
           → sdk.query({ prompt, options })
           → for await (msg of response)
              → msg.type === "assistant" + tool_use → emit agent:tool_call
              → msg.type === "user" + tool_result   → emit agent:tool_result
              → msg.type === "result"               → return AgentResult
```

### 2.2 ProcessManager Rewrite

Replace `child_process.spawn` + `buildArgs()` with `sdk.query()`:

| CLI flag | SDK option |
|---|---|
| `-p <prompt>` | `prompt` parameter |
| `--system-prompt <content>` | `options.systemPrompt` |
| `--tools Read,Write,...` | `options.allowedTools: ["Read", "Write", ...]` |
| `--max-turns 50` | `options.maxTurns: 50` |
| `--permission-mode bypassPermissions` | `options.permissionMode: "bypassPermissions"` |
| `--output-format text` | Not needed — message stream is structured |
| spawn `cwd` | `options.cwd` |

The `buildArgs()` method and `child_process` import are removed entirely.

System prompt is still read from a file path (`config.systemPrompt`) — `readFileSync` remains, just passed to `options.systemPrompt` instead of a CLI flag.

### 2.3 Message Stream Processing

Inside `spawn()`, iterate the SDK response stream:

```typescript
for await (const msg of response) {
  // Agent requests a tool call
  if (msg.type === "assistant" && msg.message?.content) {
    for (const block of msg.message.content) {
      if (block.type === "tool_use") {
        emit({ type: "agent:tool_call", agent, tool: block.name, input: block.input });
      }
    }
  }
  // Tool execution result
  if (msg.type === "user" && msg.message?.content) {
    for (const block of msg.message.content) {
      if (block.type === "tool_result") {
        const content = typeof block.content === "string"
          ? block.content
          : Array.isArray(block.content)
            ? block.content.map(c => c.text ?? "").join("\n")
            : String(block.content);
        emit({ type: "agent:tool_result", agent, tool: pendingTool, result: content });
      }
    }
  }
  // Final result
  if (msg.type === "result") {
    resultText = msg.result ?? "";
  }
}
```

### 2.4 New Event Types

```typescript
| {
    type: "agent:tool_call";
    agent: AgentRole;
    tool: string;
    input: Record<string, unknown>;
  }
| {
    type: "agent:tool_result";
    agent: AgentRole;
    tool: string;
    result: string;
  }
```

These replace the largely useless `agent:output` event (which carried empty stdout from `claude -p`). `agent:output` is kept for verbose mode — it will carry the final result text from `msg.result`.

### 2.5 TextRenderer: Tool Call Rendering

TextRenderer buffers tool_call events for tools that need result context (Write, Bash, Glob, Grep). For tools where the call itself is informative enough (Read, Edit), it renders immediately on tool_call.

**Rendering rules by tool:**

| Tool | Render on | Format |
|---|---|---|
| Read | tool_call | `▸ Read package.json` |
| Edit | tool_call | `▸ Edit src/index.ts` |
| Write | tool_result | `▸ Write src/auth.ts (85 lines)` |
| Bash | tool_result | `▸ Bash pnpm test → Tests: 12 passed` |
| Glob | tool_result | `▸ Glob **/*.ts → 23 files` |
| Grep | tool_result | `▸ Grep import.*chalk → 4 matches` |
| Other | tool_call | `▸ ToolName` |

**Result extraction:**
- Write: count newlines in result content
- Bash: take last non-empty line, truncate to 80 chars
- Glob: count lines (each line = one file path)
- Grep: count lines (each line = one match)

TextRenderer gains a `pendingToolCall` field (nullable) to hold the buffered call. When tool_result arrives, it renders the combined output and clears the buffer.

### 2.6 Context Reset

Each `query()` call is independent — no session resume. This matches the current behavior where killing and restarting the claude process gives a clean context. `progress.txt` continues to carry state across context windows.

### 2.7 Error Handling

```typescript
try {
  for await (const msg of response) { ... }
} catch (err) {
  this.emitter.emit({ type: "error", message: `${config.role} failed: ${err.message}` });
  return { exitCode: 1, stdout: "", stderr: err.message };
}
```

SDK errors (auth, rate limit, context exceeded) are caught and emitted as `error` events, same as current process spawn errors.

### 2.8 Expected Default Output

```
[HARNESS] Task started: build a todo app
[PLAN]    Starting...
[PLAN]    ▸ Read  package.json
[PLAN]    ▸ Read  tsconfig.json
[PLAN]    ▸ Bash  ls src/ → 8 entries
[PLAN]    ▸ Write spec.md (238 lines)
[PLAN]    ▸ Write feature-list.json (42 lines)
[PLAN]    Done (2m 2s)
[GEN]     Starting (iter 1, 0/6 features)
[GEN]     ▸ Read  spec.md
[GEN]     ▸ Read  feature-list.json
[GEN]     ▸ Write src/models/todo.ts (85 lines)
[GEN]     ▸ Bash  pnpm test → Tests: 12 passed (12)
[GEN]     ▸ Bash  git commit → [main a1b2c3] feat: add todo model
[GEN]     ▸ Edit  feature-list.json
[GEN]     Done (3m 15s)
[EVAL]    Starting (iter 1, 6/6 features)
[EVAL]    ▸ Read  criteria.yaml
[EVAL]    ▸ Bash  npx tsc --noEmit → clean
[EVAL]    ▸ Bash  pnpm test → Tests: 40 passed (40)
[EVAL]    ▸ Write scores.json (12 lines)
[EVAL]    ▸ Write feedback.md (45 lines)
[EVAL]    functionality 8.5 / code_quality 7.2 → avg 7.85 ✓
[HARNESS] ✓ Done, 1 iteration(s), 0 reset(s), final score 7.85
```

## 3. Files to Change

| File | Action | Change |
|---|---|---|
| `package.json` | Modify | `@anthropic-ai/claude-agent-sdk` already added as dependency |
| `src/types.ts` | Modify | Add `agent:tool_call` and `agent:tool_result` event types |
| `src/orchestrator/process-manager.ts` | **Rewrite** | Replace `child_process.spawn` with `sdk.query()`, parse message stream |
| `src/events/text-renderer.ts` | Modify | Add tool_call/tool_result rendering with buffering logic |
| `tests/orchestrator/process-manager.test.ts` | **Rewrite** | Mock `sdk.query()` instead of mock shell script |
| `tests/events/text-renderer.test.ts` | Modify | Add tool_call/tool_result rendering tests |
| `tests/fixtures/mock-claude.sh` | **Delete** | No longer needed |
| `src/orchestrator/loop.ts` | No change | |
| `src/events/emitter.ts` | No change | |
| `src/commands/*.ts` | No change | |
| `bin/harnex.ts` | No change | |
