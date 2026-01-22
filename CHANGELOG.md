# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Real-time progress display during task execution
  - Shows task stages: started, analyzing, executing, completed
  - Displays elapsed time for each stage
  - Uses color-coded emoji indicators (⏳ 🔍 ⚡ ✓)
  - Progress output sent to stderr (task output to stdout)
- `--quiet` / `-q` flag to disable progress output
- `CODEAGENT_QUIET` environment variable for quiet mode
- `CODEAGENT_ASCII_MODE` environment variable for ASCII-only progress symbols
- Unit tests for progress output functionality in `test/progress-output.test.mjs`
- **Feature enhancements (feature-enhancements)**:
  - `--backend-output` flag to forward backend stdout/stderr to terminal for debugging
  - `src/errors.mjs` error handling module with structured error formatting
  - Enhanced `validateConfig()` with backend validation and warning messages
  - Improved help text with parameter grouping, examples, and documentation links
  - Unit tests for error handling in `test/error-handling.test.mjs`
  - Unit tests for configuration validation in `test/config-validation.test.mjs`

### Changed
- Help text updated to include `--quiet` option and progress display examples
- README.md updated with real-time progress display documentation
- CLAUDE.md updated with progress display system architecture documentation
- Help text restructured with parameter groups (Required vs Optional arguments)
- Enhanced error messages with suggestions for common errors
- Configuration validation now async with detailed error collection

### Technical Details
- Modified `src/main.mjs`: Added `formatProgress()` function and progress callback integration
- Modified `src/config.mjs`: Added `quiet` parameter support (CLI flag and env var)
- Leveraged existing `ProgressStage` enum and progress detection in `src/executor.mjs`
- Progress callback system fully backward compatible (no breaking changes)

## [0.0.2] - 2025-01-XX

### Added
- Initial release with multi-backend support
- Agent configuration presets
- Parallel execution with DAG-based dependency management
- Session resume functionality
- Prompt file support
