# codeagent-wrapper (Rust)

A high-performance wrapper for AI CLI backends (Claude, Codex, Gemini, Opencode).

## Features

- 🚀 **Blazing fast**: ~6ms cold start (vs ~80ms Node.js) - **13x faster**
- 📦 **Zero dependencies**: Single binary (~2.1MB), no runtime needed
- 💾 **Low memory**: ~3MB (vs ~35MB Node.js) - **12x less**
- 🔌 **Multi-backend**: Claude, Codex, Gemini, Opencode
- ⚡ **Parallel execution**: DAG-based task orchestration
- 🔄 **Session resume**: Continue previous conversations
- 🌍 **Cross-platform**: macOS, Linux, Windows

## Installation

### Pre-built binaries (Recommended)

Download the latest release for your platform:

```bash
# macOS (Apple Silicon)
curl -L https://github.com/user/codeagent-wrapper/releases/latest/download/codeagent-aarch64-apple-darwin -o codeagent
chmod +x codeagent
sudo mv codeagent /usr/local/bin/

# macOS (Intel)
curl -L https://github.com/user/codeagent-wrapper/releases/latest/download/codeagent-x86_64-apple-darwin -o codeagent
chmod +x codeagent
sudo mv codeagent /usr/local/bin/

# Linux (x86_64)
curl -L https://github.com/user/codeagent-wrapper/releases/latest/download/codeagent-x86_64-unknown-linux-gnu -o codeagent
chmod +x codeagent
sudo mv codeagent /usr/local/bin/

# Linux (ARM64)
curl -L https://github.com/user/codeagent-wrapper/releases/latest/download/codeagent-aarch64-unknown-linux-gnu -o codeagent
chmod +x codeagent
sudo mv codeagent /usr/local/bin/
```

### Homebrew (macOS/Linux)

```bash
brew tap user/codeagent-wrapper
brew install codeagent-wrapper
```

### Cargo (from source)

```bash
cd codeagent-wrapper-rs
cargo install --path .
```

### From crates.io

```bash
cargo install codeagent-wrapper
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

Measured on Apple M1 Pro, macOS 14.0

| Metric | Node.js | Rust | Improvement |
|--------|---------|------|-------------|
| Cold start | ~80ms | **6ms** | **13x faster** |
| JSON parsing (1K events) | ~23ms | **1.03ms** | **22x faster** |
| JSON throughput | ~10 MiB/s | **100 MiB/s** | **10x faster** |
| Memory usage | ~35MB | **~3MB** | **12x less** |
| Binary size | N/A | **2.1MB** | Single file |

### Benchmark details

```
JSON Parsing Performance:
- parse_1000_events: 1.0260ms (974.66 Kelem/s)
- parse_10k_events:  9.7982ms (100.14 MiB/s)
```

## Migration from Node.js

### Drop-in replacement

The Rust version is a drop-in replacement for the Node.js version:

```bash
# Before (Node.js)
npx codeagent-wrapper "Your task"

# After (Rust)
codeagent "Your task"
```

### Compatibility

- ✅ All CLI flags and options
- ✅ Config file formats (agents.yaml, models.yaml)
- ✅ Environment variables
- ✅ Session resume functionality
- ✅ Parallel execution
- ✅ All backends (Claude, Codex, Gemini, Opencode)

### Breaking changes

None. The Rust version maintains full API compatibility.

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
