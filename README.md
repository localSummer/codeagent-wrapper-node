# codeagent-wrapper-node

Node.js implementation of the codeagent-wrapper - a unified wrapper for AI CLI backends (Codex, Claude, Gemini, Opencode).

## Installation

```bash
# Clone and link
cd codeagent-wrapper-node
npm link

# Or run directly
node bin/codeagent-wrapper.mjs <task>
```

## Requirements

- Node.js >= 18.0.0
- One or more AI CLI backends installed:
  - `codex` - OpenAI Codex CLI
  - `claude` - Anthropic Claude CLI
  - `gemini` - Google Gemini CLI
  - `opencode` - Opencode CLI

## Usage

### Basic Usage

```bash
# Run a task with default backend
codeagent-wrapper "Fix the bug in auth.js"

# Specify working directory
codeagent-wrapper "Add tests" ./src

# Use specific backend
codeagent-wrapper --backend claude "Review this code"

# Use specific model
codeagent-wrapper --backend claude --model claude-3-opus "Complex task"
```

### Agent Configuration

```bash
# Use predefined agent configuration
codeagent-wrapper --agent oracle "Analyze this codebase"
codeagent-wrapper --agent develop "Implement new feature"
```

Available agents:
- `oracle` - Claude Opus for complex analysis
- `librarian` - Claude Sonnet for documentation
- `explore` - Opencode for exploration
- `develop` - Codex for development
- `frontend-ui-ux-engineer` - Gemini for UI/UX
- `document-writer` - Gemini for documentation

### Session Resume

```bash
# Resume a previous session
codeagent-wrapper resume <session_id> "Continue from where we left off"
```

### Stdin Input

```bash
# Read task from stdin
echo "Build the project" | codeagent-wrapper -

# Explicit stdin mode
codeagent-wrapper - ./workdir
```

### Parallel Execution

```bash
# Run tasks in parallel
codeagent-wrapper --parallel < tasks.txt

# With full output
codeagent-wrapper --parallel --full-output < tasks.txt
```

Parallel task format:
```
---TASK---
id: build
workdir: /app
backend: codex
---CONTENT---
Build the application

---TASK---
id: test
dependencies: build
---CONTENT---
Run tests
```

### Other Commands

```bash
# Show help
codeagent-wrapper --help

# Show version
codeagent-wrapper --version

# Clean up old log files
codeagent-wrapper --cleanup
```

## Options

| Option | Description |
|--------|-------------|
| `--backend <name>` | Backend to use (codex, claude, gemini, opencode) |
| `--model <model>` | Model to use |
| `--agent <name>` | Agent configuration name |
| `--prompt-file <path>` | Path to prompt file |
| `--skip-permissions` | Skip permission checks (YOLO mode) |
| `--parallel` | Run tasks in parallel mode |
| `--full-output` | Show full output in parallel mode |
| `--timeout <seconds>` | Timeout in seconds (default: 7200) |
| `--cleanup` | Clean up old log files |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CODEX_TIMEOUT` | Timeout in milliseconds or seconds |
| `CODEAGENT_SKIP_PERMISSIONS` | Skip permissions if set |
| `CODEAGENT_MAX_PARALLEL_WORKERS` | Max parallel workers (0 = unlimited, default: min(100, cpuCount*4)) |
| `CODEAGENT_ASCII_MODE` | Use ASCII symbols instead of Unicode |
| `CODEAGENT_LOGGER_CLOSE_TIMEOUT_MS` | Logger close timeout (default: 5000) |

## Custom Agent Configuration

Create `~/.codeagent/models.json`:

```json
{
  "defaultBackend": "opencode",
  "defaultModel": "opencode/grok-code",
  "agents": {
    "my-agent": {
      "backend": "claude",
      "model": "claude-3-opus",
      "promptFile": "~/.claude/prompts/my-agent.md"
    }
  }
}
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error |
| 124 | Timeout |
| 127 | Command not found |
| 130 | Interrupted (SIGINT/SIGTERM) |

## Architecture

```
bin/
  codeagent-wrapper.mjs  # CLI entry point
src/
  main.mjs               # Main orchestration
  config.mjs             # Configuration parsing
  executor.mjs           # Task execution
  backend.mjs            # Backend implementations
  parser.mjs             # JSON stream parsing
  logger.mjs             # Async logging
  utils.mjs              # Utility functions
  filter.mjs             # Output filtering
  agent-config.mjs       # Agent configuration
  signal.mjs             # Signal handling
  process-check.mjs      # Process utilities
  wrapper-name.mjs       # Wrapper name utility
```

## Development

```bash
# Run tests
npm test

# Run specific test file
node --test test/config.test.mjs
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
