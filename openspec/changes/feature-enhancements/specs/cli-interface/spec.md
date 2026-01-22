## ADDED Requirements

### Requirement: Improved Help Documentation
The CLI SHALL provide comprehensive, well-structured help information.

#### Scenario: Help text structure
- **WHEN** user runs with `--help` or `-h`
- **THEN** help text SHALL be organized into sections:
  - Usage synopsis
  - Required parameters
  - Optional parameters
  - Environment variables
  - Examples
  - Documentation links
- **AND** sections SHALL be visually separated

#### Scenario: Parameter descriptions
- **WHEN** displaying parameter help
- **THEN** each parameter SHALL have:
  - Short and long form (e.g., -q, --quiet)
  - Clear description of function
  - Default value if applicable
  - Example usage
- **AND** descriptions SHALL be concise and actionable

#### Scenario: Usage examples
- **WHEN** help is displayed
- **THEN** at least 3 common usage examples SHALL be shown:
  - Basic task execution
  - With optional parameters
  - Multi-task parallel execution
- **AND** examples SHALL be copy-pasteable

### Requirement: Quick Start Guidance
The CLI SHALL provide quick start guidance for new users.

#### Scenario: Documentation links
- **WHEN** help is displayed
- **THEN** links to full documentation SHALL be included
- **AND** quick start guide link SHALL be prominent
- **AND** troubleshooting guide link SHALL be provided

#### Scenario: Backend installation guidance
- **WHEN** help is displayed
- **THEN** backend installation instructions SHALL be referenced
- **AND** supported backends SHALL be listed
- **AND** links to backend-specific docs SHALL be provided
