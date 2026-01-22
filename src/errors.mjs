/**
 * Error handling module
 * Provides structured error formatting and helpful suggestions
 */

/**
 * Error categories
 */
export const ErrorCategory = {
  CONFIGURATION: 'configuration',
  BACKEND: 'backend',
  PERMISSION: 'permission',
  FILE_SYSTEM: 'file_system',
  TIMEOUT: 'timeout',
  NETWORK: 'network',
  UNKNOWN: 'unknown'
};

/**
 * Error codes
 */
export const ErrorCode = {
  // Configuration errors (2xx)
  CONFIG_MISSING_TASK: { code: 2, category: ErrorCategory.CONFIGURATION, message: 'No task provided' },
  CONFIG_INVALID_SESSION: { code: 2, category: ErrorCategory.CONFIGURATION, message: 'Invalid session ID format' },
  CONFIG_INVALID_TIMEOUT: { code: 2, category: ErrorCategory.CONFIGURATION, message: 'Timeout must be positive' },
  CONFIG_INVALID_AGENT: { code: 2, category: ErrorCategory.CONFIGURATION, message: 'Invalid agent name format' },
  CONFIG_WORKDIR_INVALID: { code: 2, category: ErrorCategory.CONFIGURATION, message: 'Working directory cannot be "-" or empty' },

  // Backend errors (3xx)
  BACKEND_NOT_FOUND: { code: 127, category: ErrorCategory.BACKEND, message: 'Backend command not found' },
  BACKEND_EXECUTION_FAILED: { code: 1, category: ErrorCategory.BACKEND, message: 'Backend execution failed' },
  BACKEND_INVALID_RESPONSE: { code: 1, category: ErrorCategory.BACKEND, message: 'Invalid response from backend' },

  // Permission errors (4xx)
  PERMISSION_DENIED: { code: 126, category: ErrorCategory.PERMISSION, message: 'Permission denied' },
  WORKDIR_NOT_WRITABLE: { code: 126, category: ErrorCategory.PERMISSION, message: 'Working directory is not writable' },

  // File system errors (5xx)
  FILE_NOT_FOUND: { code: 1, category: ErrorCategory.FILE_SYSTEM, message: 'File not found' },
  FILE_READ_ERROR: { code: 1, category: ErrorCategory.FILE_SYSTEM, message: 'Failed to read file' },
  PROMPT_FILE_ERROR: { code: 1, category: ErrorCategory.FILE_SYSTEM, message: 'Failed to load prompt file' },

  // Timeout errors
  TASK_TIMEOUT: { code: 124, category: ErrorCategory.TIMEOUT, message: 'Task timed out' },

  // Unknown errors
  UNKNOWN_ERROR: { code: 1, category: ErrorCategory.UNKNOWN, message: 'Unknown error occurred' }
};

/**
 * Error suggestion mappings for common errors
 */
const ERROR_SUGGESTIONS = {
  'ENOENT': {
    message: 'File or directory does not exist',
    suggestions: [
      'Check the file path for typos',
      'Ensure the file exists before running the command',
      'Use absolute paths instead of relative paths'
    ]
  },
  'EACCES': {
    message: 'Permission denied',
    suggestions: [
      'Check file/directory permissions with ls -la',
      'Use chmod to modify permissions if needed',
      'Run with appropriate user privileges'
    ]
  },
  'ENOSPC': {
    message: 'No space left on device',
    suggestions: [
      'Free up disk space',
      'Clean up temporary files',
      'Check disk usage with df -h'
    ]
  },
  'ETIMEDOUT': {
    message: 'Connection timed out',
    suggestions: [
      'Check network connectivity',
      'Increase timeout value with --timeout option',
      'Try again later'
    ]
  },
  '127': {
    message: 'Command not found',
    suggestions: [
      'Ensure the backend is installed (codex, claude, gemini, opencode)',
      'Check that the backend is in your PATH',
      'Verify backend installation with <backend> --version'
    ]
  },
  'spawn': {
    message: 'Failed to spawn process',
    suggestions: [
      'Check system resources (memory, CPU)',
      'Verify the backend command exists',
      'Check for conflicting processes'
    ]
  },
  'timeout': {
    message: 'Task execution timed out',
    suggestions: [
      'Increase timeout with --timeout <seconds>',
      'Break down complex tasks into smaller steps',
      'Check backend responsiveness'
    ]
  }
};

/**
 * Get error category from error message or code
 * @param {string|number} error - Error message or code
 * @returns {string}
 */
export function getErrorCategory(error) {
  const errorStr = String(error).toLowerCase();

  if (errorStr.includes('permission') || errorStr.includes('eacces')) {
    return ErrorCategory.PERMISSION;
  }
  // Check backend errors before file system (backend not found vs file not found)
  if (errorStr.includes('command') || errorStr.includes('backend')) {
    return ErrorCategory.BACKEND;
  }
  if (errorStr.includes('enoent')) {
    return ErrorCategory.FILE_SYSTEM;
  }
  if (errorStr.includes('timeout') || errorStr.includes('etimedout')) {
    return ErrorCategory.TIMEOUT;
  }
  // Check generic "not found" after more specific patterns
  if (errorStr.includes('not found')) {
    return ErrorCategory.FILE_SYSTEM;
  }
  if (errorStr.includes('config') || errorStr.includes('invalid')) {
    return ErrorCategory.CONFIGURATION;
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Get suggestions for a given error
 * @param {string|object} error - Error message or error object
 * @returns {object}
 */
export function getErrorSuggestions(error) {
  const errorStr = String(error).toLowerCase();

  // Check for specific error codes
  for (const [key, suggestion] of Object.entries(ERROR_SUGGESTIONS)) {
    if (errorStr.includes(key)) {
      return suggestion;
    }
  }

  // Default suggestions
  return {
    message: 'An error occurred',
    suggestions: [
      'Check the error message above for details',
      'Verify your configuration is correct',
      'Try running with --verbose for more information'
    ]
  };
}

/**
 * Format error for display
 * @param {Error|string} error - Error object or message
 * @param {object} [options] - Formatting options
 * @param {boolean} [options.showStack=false] - Show error stack trace
 * @param {boolean} [options.showSuggestions=true] - Show error suggestions
 * @param {boolean} [options.colorize=true] - Use ANSI colors
 * @returns {string}
 */
export function formatError(error, options = {}) {
  const {
    showStack = false,
    showSuggestions = true,
    colorize = true
  } = options;

  const reset = colorize ? '\x1b[0m' : '';
  const red = colorize ? '\x1b[31m' : '';
  const yellow = colorize ? '\x1b[33m' : '';
  const cyan = colorize ? '\x1b[36m' : '';
  const bold = colorize ? '\x1b[1m' : '';

  let output = '';

  // Error header
  output += `${red}${bold}Error${reset}\n`;
  output += `${red}${error.message || error}${reset}\n`;

  // Error code if available
  if (error.exitCode !== undefined) {
    output += `${cyan}Exit code: ${error.exitCode}${reset}\n`;
  }

  // Error category
  const category = error.category || getErrorCategory(error.message || error);
  output += `${cyan}Category: ${category}${reset}\n`;

  // Suggestions
  if (showSuggestions) {
    const suggestions = getErrorSuggestions(error.message || error);
    output += `\n${yellow}${bold}Suggestions:${reset}\n`;
    for (const suggestion of suggestions.suggestions) {
      output += `  ${cyan}•${reset} ${suggestion}\n`;
    }
  }

  // Stack trace (only in verbose mode)
  if (showStack && error.stack) {
    output += `\n${yellow}${bold}Stack trace:${reset}\n`;
    output += error.stack.split('\n').slice(1).join('\n');
  }

  return output;
}

/**
 * Create a formatted error with exit code
 * @param {string} message - Error message
 * @param {number} exitCode - Exit code
 * @param {string} [category] - Error category
 * @returns {Error}
 */
export function createError(message, exitCode, category = ErrorCategory.UNKNOWN) {
  const error = new Error(message);
  error.exitCode = exitCode;
  error.category = category;
  return error;
}

/**
 * Create a backend not found error
 * @param {string} backendName - Backend name
 * @returns {Error}
 */
export function createBackendNotFoundError(backendName) {
  const error = new Error(`Backend '${backendName}' not found`);
  error.exitCode = 127;
  error.category = ErrorCategory.BACKEND;
  error.suggestions = [
    `Install ${backendName} or check it's available in your PATH`,
    'Supported backends: codex, claude, gemini, opencode',
    'Run <backend> --version to verify installation'
  ];
  return error;
}

/**
 * Create a timeout error
 * @param {number} timeout - Timeout value in seconds
 * @returns {Error}
 */
export function createTimeoutError(timeout) {
  const error = new Error(`Task timed out after ${timeout} seconds`);
  error.exitCode = 124;
  error.category = ErrorCategory.TIMEOUT;
  error.suggestions = [
    `Increase timeout with --timeout ${timeout * 2}`,
    'Break down the task into smaller steps',
    'Check if the backend is responsive'
  ];
  return error;
}

/**
 * Safe error handler - formats error without throwing
 * @param {Error|string} error - Error to handle
 * @param {object} [options] - Formatting options
 * @returns {string}
 */
export function safeFormatError(error, options = {}) {
  try {
    return formatError(error, options);
  } catch (e) {
    return `Error: ${String(error)}`;
  }
}

/**
 * Logger fallback when main logger fails to initialize
 */
export const nullLoggerFallback = {
  info: () => {},
  warn: (msg) => console.error(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  debug: () => {},
  path: '',
  async close() {}
};

/**
 * Try to create logger with fallback (synchronous version)
 * @param {string} [sessionId] - Session ID
 * @returns {object}
 */
export function createLoggerWithFallbackSync(sessionId) {
  try {
    return {
      info: () => {},
      warn: (msg) => console.error(`[WARN] ${msg}`),
      error: (msg) => console.error(`[ERROR] ${msg}`),
      debug: () => {},
      path: '',
      async close() {}
    };
  } catch (error) {
    return nullLoggerFallback;
  }
}
