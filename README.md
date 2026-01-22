# codeagent-wrapper

[English | [中文](README.zh-CN.md)]

A unified CLI wrapper enabling **multi-model collaboration** across AI coding backends (Codex, Claude, Gemini, Opencode).

> **Core Value**: Let different AI models work together - Claude for reasoning, Codex for implementation, Gemini for UI. One command, multiple backends, seamless collaboration.

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/anthropics/codeagent-wrapper-node.git
cd codeagent-wrapper-node && npm link

# 2. Ensure at least one backend is installed (e.g., codex)
npm install -g @openai/codex

# 3. Run your first task
codeagent-wrapper --backend codex "List files in current directory"

# 4. Try multi-model collaboration
codeagent-wrapper --agent oracle "Analyze this codebase"   # Uses Claude
codeagent-wrapper --agent develop "Implement the feature"  # Uses Codex
```

## Why codeagent-wrapper?

| Challenge | Solution |
|-----------|----------|
| Different CLI syntax for each AI tool | **Unified command interface** |
| Can't easily switch between models | **`--backend` flag or `--agent` preset** |
| No parallel execution across models | **DAG-based parallel task execution** |
| Context lost between sessions | **Session resume with `resume <session_id>`** |

**Multi-model collaboration example**:

```bash
# Claude analyzes, Codex implements, Claude reviews
codeagent-wrapper --backend claude "Analyze the auth module design"
codeagent-wrapper --backend codex "Implement OAuth based on the analysis"
codeagent-wrapper --backend claude "Review the implementation"
```

## Installation

```bash
# Clone and link
git clone https://github.com/anthropics/codeagent-wrapper-node.git
cd codeagent-wrapper-node
npm link

# Or run directly without installing
node bin/codeagent-wrapper.mjs <task>

# Install Claude Code skill (optional)
codeagent-wrapper init
```

## Requirements

- Node.js >= 18.0.0
- One or more AI CLI backends installed:

| Backend | Install Command | Documentation |
|---------|----------------|---------------|
| `codex` | `npm install -g @openai/codex` | [OpenAI Codex CLI](https://github.com/openai/codex) |
| `claude` | `npm install -g @anthropic-ai/claude-code` | [Anthropic Claude Code](https://github.com/anthropics/claude-code) |
| `gemini` | `npm install -g @google/gemini-cli` | [Google Gemini CLI](https://github.com/google-gemini/gemini-cli) |
| `opencode` | `npm install -g opencode` | [Opencode CLI](https://github.com/sst/opencode) |

## Usage

### Basic Usage

```bash
# Run a task with default backend (opencode)
codeagent-wrapper "Fix the bug in auth.js"

# Specify working directory
codeagent-wrapper "Add tests" ./src

# Use specific backend
codeagent-wrapper --backend claude "Review this code"

# Use specific model
codeagent-wrapper --backend claude --model claude-3-opus "Complex task"
```

### Agent Configuration

Pre-configured agents for common use cases:

```bash
# Use predefined agent configuration
codeagent-wrapper --agent oracle "Analyze this codebase"
codeagent-wrapper --agent develop "Implement new feature"
```

| Agent | Backend | Model | Best For |
|-------|---------|-------|----------|
| `oracle` | Claude | claude-opus-4-5 | Complex analysis, architecture design |
| `librarian` | Claude | claude-sonnet-4-5 | Documentation, code explanation |
| `explore` | Opencode | grok-code | Codebase exploration |
| `develop` | Codex | (default) | Code implementation, refactoring |
| `frontend-ui-ux-engineer` | Gemini | (default) | UI/UX design, prototyping |
| `document-writer` | Gemini | (default) | Technical documentation |

### Session Resume

Each execution outputs a `SESSION_ID`. Use it to continue a conversation:

```bash
# First run - note the SESSION_ID in output
codeagent-wrapper --backend codex "Start implementing auth"
# Output: SESSION_ID: 019a7247-ac9d-71f3-89e2-a823dbd8fd14

# Resume the session later
codeagent-wrapper resume 019a7247-ac9d-71f3-89e2-a823dbd8fd14 "Continue from where we left off"
```

### Stdin Input

```bash
# Read task from stdin (use `-` as task placeholder)
echo "Build the project" | codeagent-wrapper -

# With working directory (- means stdin, ./workdir is the working directory)
echo "Run tests" | codeagent-wrapper - ./workdir

# Multi-line task via heredoc
codeagent-wrapper - <<'EOF'
Refactor the authentication module:
1. Extract common logic
2. Add error handling
3. Write unit tests
EOF
```

### Parallel Execution

Run multiple tasks concurrently with dependency management:

```bash
# Run tasks in parallel (from file)
codeagent-wrapper --parallel < tasks.txt

# Or pipe directly
codeagent-wrapper --parallel <<'EOF'
---TASK---
id: analyze
backend: claude
---CONTENT---
Analyze the codebase structure

---TASK---
id: implement
backend: codex
dependencies: analyze
---CONTENT---
Implement based on analysis
EOF

# With full output (for debugging)
codeagent-wrapper --parallel --full-output < tasks.txt
```

#### Parallel Task Format

```
---TASK---
id: <unique_id>           # Required: unique task identifier
workdir: /path/to/dir     # Optional: working directory (default: cwd)
backend: codex            # Optional: backend override
model: gpt-4              # Optional: model override
agent: oracle             # Optional: use agent config
dependencies: id1, id2    # Optional: comma-separated task IDs to wait for
skip_permissions: true    # Optional: skip permission checks (true/false)
session_id: abc123        # Optional: resume from existing session
---CONTENT---
<task content here>
```

#### Task Field Reference

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `id` | Yes | - | Unique task identifier |
| `workdir` | No | cwd | Working directory for the task |
| `backend` | No | (global) | Backend: codex, claude, gemini, opencode |
| `model` | No | (global) | Model to use |
| `agent` | No | - | Agent configuration name |
| `dependencies` | No | - | Comma-separated IDs of tasks to wait for |
| `skip_permissions` | No | false | Skip permission checks (true/false) |
| `session_id` | No | - | Resume from existing session |

### Other Commands

```bash
# Show help
codeagent-wrapper --help

# Show version
codeagent-wrapper --version

# Clean up old log files (>7 days)
codeagent-wrapper --cleanup

# Install codeagent skill to ~/.claude/skills/
codeagent-wrapper init
codeagent-wrapper init --force  # Overwrite without confirmation
```

## Options

| Option | Description |
|--------|-------------|
| `--backend <name>` | Backend to use: `codex`, `claude`, `gemini`, `opencode` |
| `--model <model>` | Model to use (backend-specific) |
| `--agent <name>` | Agent configuration name (see Agent Configuration) |
| `--prompt-file <path>` | Path to custom prompt file |
| `--reasoning-effort <level>` | Reasoning effort level (model-specific) |
| `--skip-permissions` | Skip permission checks (YOLO mode) |
| `--yolo` | Alias for `--skip-permissions` |
| `--parallel` | Run tasks in parallel mode |
| `--full-output` | Show full output in parallel mode |
| `--timeout <seconds>` | Timeout in seconds (default: 7200 = 2 hours) |
| `--cleanup` | Clean up old log files |
| `--force` | Force overwrite without confirmation (for `init`) |
| `--help`, `-h` | Show help |
| `--version`, `-v` | Show version |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CODEX_TIMEOUT` | Timeout value. **If >10000, treated as milliseconds; otherwise seconds** | 7200 (seconds) |
| `CODEAGENT_SKIP_PERMISSIONS` | Skip permissions if set to **any non-empty value** | (unset) |
| `CODEAGENT_MAX_PARALLEL_WORKERS` | Max parallel workers. 0 = unlimited | min(100, cpuCount*4) |
| `CODEAGENT_ASCII_MODE` | Use ASCII symbols instead of Unicode if set | (unset) |
| `CODEAGENT_LOGGER_CLOSE_TIMEOUT_MS` | Logger close timeout in milliseconds | 5000 |

## Custom Agent Configuration

Run `codeagent-wrapper init` to create default config at `~/.codeagent/models.json`.

Or create manually:

```json
{
  "defaultBackend": "opencode",
  "defaultModel": "opencode/grok-code",
  "agents": {
    "my-agent": {
      "backend": "claude",
      "model": "claude-3-opus",
      "promptFile": "~/.claude/prompts/my-agent.md",
      "reasoningEffort": "high"
    }
  }
}
```

### Agent Config Fields

| Field | Description |
|-------|-------------|
| `backend` | Backend to use |
| `model` | Model name |
| `promptFile` | Path to prompt file (supports `~` expansion) |
| `reasoningEffort` | Reasoning effort level |

### Prompt File Format

A prompt file is a plain text or markdown file containing system instructions:

```markdown
# ~/.claude/prompts/my-agent.md

You are a senior software engineer specializing in TypeScript.

## Guidelines
- Follow SOLID principles
- Write comprehensive tests
- Use meaningful variable names
```

## Logging & Debugging

### Log Location

All execution logs are stored in:

```
~/.codeagent/logs/
```

### Viewing Logs

```bash
# List recent logs
ls -lt ~/.codeagent/logs/ | head -10

# View a specific log
cat ~/.codeagent/logs/codeagent-<timestamp>.log

# Follow log in real-time (during execution)
tail -f ~/.codeagent/logs/codeagent-*.log
```

### Cleanup

```bash
# Remove logs older than 7 days
codeagent-wrapper --cleanup
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "Command not found: codex" | Install the backend: `npm install -g @openai/codex` |
| "Unknown agent: xyz" | Check available agents in `~/.codeagent/models.json` |
| Task hangs | Check `CODEX_TIMEOUT` env var; default is 2 hours |
| Permission errors | Use `--skip-permissions` or set `CODEAGENT_SKIP_PERMISSIONS=1` |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error |
| 124 | Timeout |
| 127 | Command not found (backend not installed) |
| 130 | Interrupted (SIGINT/SIGTERM) |

## Architecture

```
bin/
  codeagent-wrapper.mjs  # CLI entry point
src/
  main.mjs               # Main orchestration
  config.mjs             # Configuration parsing
  executor.mjs           # Task execution engine
  backend.mjs            # Backend implementations (Codex, Claude, Gemini, Opencode)
  parser.mjs             # JSON stream parsing with auto-detection
  logger.mjs             # Async logging with buffered writes
  utils.mjs              # Utility functions
  filter.mjs             # Output filtering
  agent-config.mjs       # Agent configuration management
  signal.mjs             # Signal handling
  process-check.mjs      # Process utilities
  init.mjs               # Skill installation
templates/
  skills/codeagent/      # Claude Code skill template
```

## Development

```bash
# Run tests
npm test

# Run specific test file
node --test test/config.test.mjs

# Run CLI directly
node bin/codeagent-wrapper.mjs "test task"
```

## Migration from Go Version

This is a complete port of the Go `codeagent-wrapper` to Node.js with:

- Identical CLI interface
- Same exit codes
- Same environment variables
- Same configuration file format
- Same parallel task format

Key differences:
- Uses ESM modules (`.mjs`)
- No external dependencies (uses Node.js built-ins only)
- Async/await instead of goroutines

## License

MIT
