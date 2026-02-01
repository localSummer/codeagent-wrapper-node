# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
