## ADDED Requirements

### Requirement: Real-time Progress Feedback
The CLI system SHALL provide real-time visual feedback to users during task execution, displaying the current execution stage, elapsed time, and task status.

#### Scenario: Task execution with progress display
- **WHEN** a user executes `codeagent-wrapper "task"` without `--quiet` flag
- **THEN** the system SHALL display progress updates in real-time:
  - Task start with emoji ⏳ and task ID
  - Stage transitions (Analyzing 🔍, Executing ⚡) with elapsed time
  - Task completion with emoji ✓ and total time
- **AND** all progress messages SHALL appear before the final task output

#### Scenario: Multiple tasks with progress tracking
- **WHEN** multiple tasks are executed in parallel
- **THEN** each task's progress SHALL be displayed with its unique task ID
- **AND** progress updates SHALL be distinguishable per task

#### Scenario: Quiet mode suppresses progress
- **WHEN** a user executes with `--quiet` or `-q` flag
- **THEN** no progress updates SHALL be displayed
- **AND** only the final task output SHALL be shown
- **AND** this behavior SHALL match the legacy output format (backward compatible)

### Requirement: Progress Stage Visualization
The system SHALL visually represent different execution stages using consistent emoji indicators and formatted messages.

#### Scenario: Task start visualization
- **WHEN** a task begins execution
- **THEN** the system SHALL display: `⏳ Task started: {task-id}`
- **AND** the message SHALL be timestamped

#### Scenario: Analysis stage visualization
- **WHEN** the backend is analyzing or thinking
- **THEN** the system SHALL display: `🔍 Analyzing... ({elapsed}s)`
- **AND** elapsed time SHALL be updated for each occurrence

#### Scenario: Execution stage visualization
- **WHEN** the backend is executing a tool or action
- **THEN** the system SHALL display: `⚡ Executing tool: {tool-name} ({elapsed}s)`
- **AND** tool-name SHALL be extracted from backend events when available

#### Scenario: Completion visualization
- **WHEN** a task completes successfully
- **THEN** the system SHALL display: `✓ Task completed ({total-time}s)`
- **AND** total-time SHALL reflect the sum of all stages

### Requirement: Progress Formatting
The system SHALL format progress messages with consistent structure, timing information, and visual indicators.

#### Scenario: Elapsed time formatting
- **WHEN** displaying elapsed time for any stage
- **THEN** time SHALL be formatted as floating-point seconds with 1 decimal place
- **AND** time values < 0.1s SHALL display as "0.0s"

#### Scenario: ANSI color support
- **WHEN** the terminal supports ANSI colors
- **THEN** in-progress stages SHALL use yellow color
- **AND** completed stages SHALL use green color
- **AND** error stages SHALL use red color

#### Scenario: Color-disabled terminal compatibility
- **WHEN** the terminal does not support colors (detected via environment)
- **THEN** progress SHALL display without color codes
- **AND** emoji and text formatting SHALL remain intact

### Requirement: Progress Callback Integration
The CLI layer SHALL integrate with the existing executor progress tracking mechanism through callback functions.

#### Scenario: Progress callback registration
- **WHEN** `runTask()` is invoked from `main.mjs`
- **THEN** an `onProgress` callback SHALL be provided
- **AND** the callback SHALL receive stage, taskId, and elapsed time

#### Scenario: Progress callback invocation
- **WHEN** the executor detects a progress event
- **THEN** the registered `onProgress` callback SHALL be invoked
- **AND** the callback SHALL format and output the progress message

#### Scenario: Backward compatibility without callback
- **WHEN** `runTask()` is invoked without `onProgress` parameter
- **THEN** the system SHALL execute normally
- **AND** no progress shall be displayed (legacy behavior)

### Requirement: Configuration Control
Users SHALL be able to control progress display behavior through command-line flags and environment variables.

#### Scenario: --quiet flag
- **WHEN** user provides `--quiet` or `-q` flag
- **THEN** `config.quiet` SHALL be set to `true`
- **AND** no progress messages SHALL be output

#### Scenario: CODEAGENT_QUIET environment variable
- **WHEN** `CODEAGENT_QUIET=true` is set
- **THEN** quiet mode SHALL be activated
- **AND** behavior SHALL match `--quiet` flag

#### Scenario: Default behavior
- **WHEN** neither `--quiet` nor `CODEAGENT_QUIET` is specified
- **THEN** progress display SHALL be enabled by default
- **AND** users SHALL see real-time progress feedback
