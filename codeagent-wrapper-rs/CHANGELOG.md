# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.7] - 2026-02-02

### Added

- `--yolo` 参数别名支持，作为 `--skip-permissions` 的快捷方式
- `--reasoning-effort` 参数支持，用于 Codex backend 的推理强度控制
- `--minimal-env` 参数支持，启用最小环境变量模式以优化性能
- 环境变量过滤机制，在 `--minimal-env` 模式下只传递必要的环境变量（~20-30个）
- 完整的参数测试覆盖：`test_cli_yolo_alias`, `test_cli_reasoning_effort`, `test_cli_minimal_env`, `test_cli_combined_flags`
- CLI 参数对比文档 `docs/CLI_PARAMETERS_COMPARISON.md`

### Fixed

- 修复了缺少 `--yolo` 参数导致的 "unexpected argument '--yolo' found" 错误
- 修复了与 Node.js 版本在 CLI 参数上的不兼容问题

### Changed

- `Config` 和 `TaskSpec` 结构添加 `reasoning_effort` 和 `minimal_env` 字段
- `CodexBackend::build_args()` 现在支持 `--reasoning-effort` 参数传递
- `TaskExecutor::run()` 现在根据 `minimal_env` 配置过滤环境变量

### Performance

- `--minimal-env` 模式可减少进程启动开销 5-10ms，适合批量并行任务

## [1.0.5] - 2026-02-02

### Fixed

- **CLI help examples**: Fixed binary name from `codeagent` to `codeagent-wrapper`
- **SKILL.md documentation**: Fixed Gemini backend flag format (`--yolo` → `--yolo`)

## [1.0.4] - 2026-02-02

### Improved

- **CLI --help Examples**: Enhanced help text coverage
  - Added stdin HEREDOC usage example (most important missing item)
  - Added workdir positional argument example
  - Improved feature coverage from 42.9% to 71.4%
  - Aligned help text with SKILL.md documentation

## [1.0.3] - 2026-02-01

### Improved

- **SKILL.md documentation**: Enhanced usage documentation
  - Added Quick Reference section for CLI usage patterns
  - Added important warning about stdin (-) mode + workdir restriction
  - Improved HEREDOC usage examples with two recommended approaches
  - Fixed table format alignment
  - Added blank lines before code blocks for readability

## [1.0.2] - 2026-02-01

### Fixed

- **stdin input handling**: Critical bug fix for task input processing
  - Fixed issue where only long tasks (>4096 bytes) were written to stdin
  - Added intelligent stdin detection logic (length + special character check)
  - Added stdin support for `resume` command
- **Code formatting**: Fixed cargo fmt issues after clippy --fix
  - Fixed if-else expression formatting
  - Fixed long array formatting

## [1.0.1] - 2026-02-01

### Fixed

- **Code quality**: Removed global `#![allow(clippy::all)]` directive and fixed all warnings
- **Clippy warnings**: Fixed 18 clippy warnings (15 automatic + 3 manual)
  - Replaced `min().max()` with `clamp()` for better readability
  - Simplified nested if-let chains using let-chains syntax
  - Consolidated consecutive `str::replace()` calls
- **Code formatting**: Applied `rustfmt` to ensure consistent formatting

### Changed

- **Reserved APIs**: Added documented `#![allow(dead_code)]` attributes for reserved public APIs
  - Preserved compatibility interfaces for future features
  - Each allow directive includes a comment explaining the rationale
- **CI compliance**: All builds now pass with `-D warnings` flag (zero warnings policy)

## [1.0.0] - 2026-02-01

### Added

- **Rust implementation**: Complete rewrite from Node.js to Rust
- **Multi-backend support**: Claude, Codex, Gemini, Opencode
- **Parallel execution**: DAG-based task orchestration with dependency resolution
- **Session resume**: Continue conversations with `resume` subcommand
- **Skill installation**: Install Claude skill with `init` subcommand
- **Log rotation**: Automatic cleanup of old log files
- **Cross-platform**: Support for macOS (ARM64/x86_64), Linux (ARM64/x86_64), Windows

### Performance

- **13x faster cold start**: 6ms vs 80ms (Node.js)
- **22x faster JSON parsing**: 1.03ms for 1000 events
- **12x less memory**: ~3MB vs ~35MB (Node.js)
- **2.1MB binary**: Zero runtime dependencies

### Changed

- Backend auto-detection now uses `which` crate for reliability
- Improved error messages with context
- Structured logging with `tracing`

### Compatibility

- Full API compatibility with Node.js version
- Same CLI flags and options
- Same config file formats
- Same environment variables

## [Unreleased]

### Planned

- Windows native signals support
- SIMD-optimized JSON parsing
- Profile-Guided Optimization (PGO) builds
