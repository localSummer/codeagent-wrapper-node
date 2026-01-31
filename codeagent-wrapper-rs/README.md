# codeagent-wrapper (Rust)

A high-performance wrapper for AI CLI backends (Claude, Codex, Gemini, Opencode).

## Features

- 🚀 **Blazing fast**: ~3ms cold start (vs ~80ms Node.js)
- 📦 **Zero dependencies**: Single binary, no runtime needed
- 💾 **Low memory**: ~3MB (vs ~35MB Node.js)
- 🔌 **Multi-backend**: Claude, Codex, Gemini, Opencode
- ⚡ **Parallel execution**: DAG-based task orchestration
- 🔄 **Session resume**: Continue previous conversations

## Installation

### From source

```bash
cargo install --path .
```

### Pre-built binaries

Download from [Releases](https://github.com/user/codeagent-wrapper-rs/releases).

### Homebrew (macOS)

```bash
brew install codeagent-wrapper
```

## Usage

### Basic usage

```bash
# Run a task with auto-detected backend
codeagent "Fix the bug in main.rs"

# Specify a backend
codeagent --backend claude "Implement feature X"

# Specify a model
codeagent --backend codex --model gpt-4 "Optimize this function"
```

### Resume a session

```bash
codeagent resume abc123 "Continue the implementation"
```

### Parallel execution

```bash
cat tasks.txt | codeagent --parallel
```

### Install skill

```bash
codeagent init
```

### Cleanup old logs

```bash
codeagent --cleanup
```

## Configuration

### Environment variables

| Variable | Description |
|----------|-------------|
| `CODEAGENT_BACKEND` | Default backend |
| `CODEAGENT_MODEL` | Default model |
| `CODEX_TIMEOUT` | Task timeout in seconds |
| `CODEAGENT_SKIP_PERMISSIONS` | Skip permission checks |
| `CODEAGENT_QUIET` | Suppress progress output |
| `CODEAGENT_DEBUG` | Enable debug logging |

### Config files

- `~/.codeagent/agents.yaml` - Agent presets
- `~/.codeagent/models.yaml` - Model configurations

## Performance

| Metric | Node.js | Rust | Improvement |
|--------|---------|------|-------------|
| Cold start | ~80ms | ~3ms | **26x** |
| JSON parsing (1000 events) | ~23ms | ~3ms | **8x** |
| Memory usage | ~35MB | ~3MB | **12x** |
| Binary size | N/A | ~3MB | Single file |

## Development

### Build

```bash
cargo build --release
```

### Run tests

```bash
cargo test
```

### Run benchmarks

```bash
cargo bench
```

### Format code

```bash
cargo fmt
```

### Lint

```bash
cargo clippy
```

## License

MIT
