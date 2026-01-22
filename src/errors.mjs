/**
 * Error handling module - Structured error classes and formatting
 */

/**
 * Base error class for all custom errors
 */
export class BaseError extends Error {
  constructor(message, code, category, suggestion = '', context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.category = category;
    this.suggestion = suggestion;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ============================================================================
// Configuration Errors
// ============================================================================

export class ConfigurationError extends BaseError {
  constructor(message, code, suggestion, context) {
    super(message, code, 'configuration', suggestion, context);
  }
}

export class InvalidParameterError extends ConfigurationError {
  constructor(parameter, value, constraint) {
    const message = `Invalid parameter '${parameter}': ${constraint}`;
    const suggestion = `Please check the parameter value and ensure it meets the requirement: ${constraint}`;
    super(message, 'ERR_CONFIG_INVALID_PARAMETER', suggestion, {
      parameter,
      value,
      constraint
    });
  }
}

export class MissingParameterError extends ConfigurationError {
  constructor(parameter, description = '') {
    const message = `Missing required parameter: ${parameter}${description ? ' - ' + description : ''}`;
    const suggestion = `Please provide the required parameter '${parameter}'`;
    super(message, 'ERR_CONFIG_MISSING_PARAMETER', suggestion, { parameter });
  }
}

export class InvalidFilePathError extends ConfigurationError {
  constructor(path, expectedType, actualType) {
    const message = `Invalid file path: ${path} (expected ${expectedType}, got ${actualType})`;
    const suggestion = `Please provide a valid ${expectedType} path`;
    super(message, 'ERR_CONFIG_INVALID_PATH', suggestion, {
      path,
      expectedType,
      actualType
    });
  }
}

// ============================================================================
// Backend Errors
// ============================================================================

export class BackendError extends BaseError {
  constructor(message, code, suggestion, context) {
    super(message, code, 'backend', suggestion, context);
  }
}

export class BackendNotFoundError extends BackendError {
  constructor(backend) {
    const packageMap = {
      codex: '@openai/codex',
      claude: '@anthropic-ai/claude-code',
      gemini: '@google/gemini-cli',
      opencode: 'opencode'
    };
    const pkg = packageMap[backend] || backend;
    const message = `Backend not found: ${backend}`;
    const suggestion = `Install the backend CLI:\n  npm install -g ${pkg}\n\nVerify installation:\n  which ${backend}`;
    super(message, 'ERR_BACKEND_NOT_FOUND', suggestion, { backend });
  }
}

export class BackendExecutionError extends BackendError {
  constructor(backend, exitCode, stderr = '') {
    const message = `Backend execution failed: ${backend} (exit code: ${exitCode})`;
    const suggestion = stderr ? `Backend error output:\n${stderr}` : 'Check the backend output for details';
    super(message, 'ERR_BACKEND_EXECUTION', suggestion, {
      backend,
      exitCode,
      stderr
    });
  }
}

export class BackendTimeoutError extends BackendError {
  constructor(backend, timeout) {
    const message = `Backend execution timeout: ${backend} (${timeout}s)`;
    const suggestion = `Increase timeout with --timeout flag or break down the task into smaller steps`;
    super(message, 'ERR_BACKEND_TIMEOUT', suggestion, { backend, timeout });
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

export class ValidationError extends BaseError {
  constructor(message, code, suggestion, context) {
    super(message, code, 'validation', suggestion, context);
  }
}

export class SessionValidationError extends ValidationError {
  constructor(sessionId, reason) {
    const message = `Invalid session: ${sessionId} - ${reason}`;
    const suggestion = `List available sessions:\n  ls ~/.codex/sessions/\n\nOr start a new session:\n  codeagent-wrapper "Your task here"`;
    super(message, 'ERR_VALIDATION_SESSION_INVALID', suggestion, {
      sessionId,
      reason
    });
  }
}

export class TaskValidationError extends ValidationError {
  constructor(reason, details = {}) {
    const message = `Task validation failed: ${reason}`;
    const suggestion = 'Check your task configuration and dependencies';
    super(message, 'ERR_VALIDATION_TASK_INVALID', suggestion, details);
  }
}

// ============================================================================
// Filesystem Errors
// ============================================================================

export class FileSystemError extends BaseError {
  constructor(message, code, suggestion, context) {
    super(message, code, 'filesystem', suggestion, context);
  }
}

export class FileNotFoundError extends FileSystemError {
  constructor(path) {
    const message = `File not found: ${path}`;
    const suggestion = `Check the file path and ensure the file exists:\n  ls -la ${path}`;
    super(message, 'ERR_FS_FILE_NOT_FOUND', suggestion, { path });
  }
}

export class PermissionDeniedError extends FileSystemError {
  constructor(path, operation = 'access') {
    const message = `Permission denied: cannot ${operation} ${path}`;
    const suggestion = `Check file permissions:\n  ls -la ${path}\n\nFix permissions if needed:\n  chmod +r ${path}`;
    super(message, 'ERR_FS_PERMISSION_DENIED', suggestion, { path, operation });
  }
}

// ============================================================================
// Timeout Error
// ============================================================================

export class TimeoutError extends BaseError {
  constructor(timeout, context = {}) {
    const message = `Task execution timeout (${timeout}s)`;
    const suggestion = `Increase timeout: --timeout ${timeout * 2}\nOr break down complex tasks into smaller steps`;
    super(message, 'ERR_EXECUTION_TIMEOUT', 'execution', suggestion, {
      timeout,
      ...context
    });
  }
}

// ============================================================================
// Error Formatting
// ============================================================================

/**
 * Indent text by a specified number of spaces
 * @param {string} text - Text to indent
 * @param {number} spaces - Number of spaces
 * @returns {string}
 */
function indent(text, spaces) {
  const prefix = ' '.repeat(spaces);
  return text.split('\n').map(line => prefix + line).join('\n');
}

/**
 * Format error for user-friendly display
 * @param {Error} error - Error object
 * @returns {string}
 */
export function formatError(error) {
  try {
    // Check if ASCII mode is enabled
    const useAscii = process.env.CODEAGENT_ASCII_MODE === '1';
    
    // Define symbols
    const symbols = useAscii
      ? {
          error: '[ERROR]',
          info: '[INFO]',
          suggestion: '[SUGGESTION]',
          link: '[DOCS]'
        }
      : {
          error: '❌',
          info: '📋',
          suggestion: '💡',
          link: '🔗'
        };

    const lines = [];
    
    // Error title
    lines.push(`${symbols.error} Error: ${error.message}`);
    lines.push('');

    // For BaseError instances with additional info
    if (error instanceof BaseError) {
      // Description (if different from message)
      if (error.code) {
        lines.push(`${symbols.info} Error Code: ${error.code}`);
      }
      
      // Suggestion
      if (error.suggestion) {
        lines.push('');
        lines.push(`${symbols.suggestion} Suggestion:`);
        lines.push(indent(error.suggestion, 3));
      }
    }

    return lines.join('\n');
  } catch (formatErr) {
    // Fallback to simple error message if formatting fails
    return error.message || error.toString();
  }
}

/**
 * Get error description based on error type
 * @param {Error} error - Error object
 * @returns {string}
 */
function getErrorDescription(error) {
  if (error instanceof BackendNotFoundError) {
    return `The specified backend '${error.context.backend}' is not installed or not in PATH.`;
  }
  if (error instanceof InvalidParameterError) {
    return `Parameter '${error.context.parameter}' has invalid value: ${error.context.value}`;
  }
  if (error instanceof FileNotFoundError) {
    return `The file or directory does not exist at the specified path.`;
  }
  if (error instanceof PermissionDeniedError) {
    return `You don't have the necessary permissions to ${error.context.operation} this file.`;
  }
  if (error instanceof TimeoutError) {
    return `The task exceeded the maximum execution time of ${error.context.timeout} seconds.`;
  }
  return error.message;
}
