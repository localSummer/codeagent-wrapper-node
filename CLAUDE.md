<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

```bash
# Run all tests
bun test test/*.test.mjs

# Run all tests with Node.js
node --test test/*.test.mjs

# Run a specific test file
bun test test/config.test.mjs

# Run CLI directly during development
bun bin/codeagent-wrapper.mjs <task>

# Install globally for testing
npm link
```

## Architecture

This is a Node.js/Bun CLI wrapper that provides a unified interface for multiple AI CLI backends (Codex, Claude, Gemini, Opencode). Uses pure ESM modules (`.mjs`) with no external dependencies - only Node.js/Bun built-ins.

**Runtime**: Supports both Node.js >= 18.0.0 and Bun >= 1.0.0. Bun provides ~2x faster cold start performance.

### Core Flow

1. **Entry Point**: `bin/codeagent-wrapper.mjs` → `src/main.mjs`
2. **Configuration**: CLI args + env vars → `config.mjs` parses into unified config object
3. **Agent Resolution**: If `--agent` specified, `agent-config.mjs` resolves to backend/model/promptFile
4. **Backend Selection**: `backend.mjs` provides backend-specific command builders
5. **Execution**: `executor.mjs` spawns child process with appropriate args
6. **Output Parsing**: `parser.mjs` auto-detects backend type from JSON stream and normalizes output

### Backend Abstraction Pattern

Each backend (Codex, Claude, Gemini, Opencode) implements the same interface:
- `name()` - Backend identifier
- `command()` - CLI command to execute
- `buildArgs(config, targetArg)` - Build backend-specific arguments

The parser auto-detects backend type from JSON stream structure rather than explicit configuration.

### IPC Optimization

Performance optimizations to reduce inter-process communication overhead:

1. **stderr Buffer Handling** (`executor.mjs`)
   - Stores raw Buffer objects instead of converting to strings immediately
   - Delays string conversion until final output/logging
   - Uses `Buffer.concat()` for efficient memory management

2. **Transform Stream JSON Parser** (`parser.mjs`)
   - Custom `JSONLineTransform` stream for efficient parsing
   - Buffer-level first-byte checking ('{' or '[') before JSON.parse
   - Reduces string allocations and trim operations
   - 15-20% faster on large JSON streams

3. **Minimal Environment Variables** (optional)
   - `--minimal-env` flag reduces environment variables passed to child processes
   - Filters to ~20-30 essential variables (PATH, API keys, etc.) vs 100+
   - Reduces process creation overhead by 5-10ms per spawn
   - Useful for parallel batch tasks

**Usage**:
```bash
# Enable minimal environment for performance
codeagent-wrapper --minimal-env "task"
```

**See**: `docs/IPC_OPTIMIZATION.md` for detailed benchmarks and implementation notes

### Progress Display System

Real-time progress tracking and display (implemented in `src/main.mjs` and `src/executor.mjs`):

**Architecture**:
1. `executor.mjs` - Contains `ProgressStage` enum and `detectProgressFromEvent()` function
2. Backend-specific progress detection parses JSON stream events to identify current stage
3. `main.mjs` - Formats progress events and outputs to stderr (does not block stdout)

**ProgressStage Enum** (in `executor.mjs`):
- `STARTED` - Task begins execution
- `ANALYZING` - AI is thinking/analyzing  
- `EXECUTING` - Running tools/commands
- `COMPLETED` - Task finished

**Progress Callback Flow**:
```
runTask() → detectProgressFromEvent() → onProgress callback → formatProgress() → console.error()
```

**Configuration**:
- `--quiet` / `-q` flag disables progress output
- `CODEAGENT_QUIET` env var also disables progress
- `CODEAGENT_ASCII_MODE` env var uses ASCII symbols instead of emoji
- Progress uses stderr; task output uses stdout (allows separate redirection)

**Files Modified**:
- `src/main.mjs` - Progress formatting and callback integration
- `src/config.mjs` - Added `quiet` parameter support
- `src/executor.mjs` - Progress detection (already implemented)
- `test/progress-output.test.mjs` - Unit tests

### Key Data Structures

**TaskSpec** (in `config.mjs`): Defines a single task with id, task content, workDir, dependencies, backend/model settings

**TaskResult** (in `config.mjs`): Execution result with exitCode, message, sessionId, coverage/test metrics

### Parallel Execution

`executor.mjs` implements DAG-based parallel execution:
- `topologicalSort()` groups tasks into dependency layers
- Each layer runs concurrently with optional worker limit
- Failed dependencies cause dependent tasks to be skipped

### Configuration Sources

1. CLI arguments (highest priority)
2. Environment variables (`CODEX_TIMEOUT`, `CODEAGENT_*`)
3. Agent config from `~/.codeagent/models.json`
4. Built-in defaults in `agent-config.mjs`

## Conventions

- All source files use `.mjs` extension (ES modules)
- Exit codes follow Unix conventions: 0=success, 1=error, 2=config error, 124=timeout, 127=not found, 130=interrupted
- Logs stored in `~/.codeagent/logs/` directory
- Use `expandHome()` from utils for path expansion with `~`
