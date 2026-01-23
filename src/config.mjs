/**
 * Configuration parsing and validation
 */

import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { exec } from 'child_process';
import { promisify } from 'util';
import { access, stat } from 'fs/promises';
import { constants } from 'fs';
import { expandHome, isValidSessionId } from './utils.mjs';
import {
  InvalidParameterError,
  MissingParameterError,
  InvalidFilePathError,
  FileNotFoundError,
  PermissionDeniedError,
  BackendNotFoundError,
  SessionValidationError,
  TaskValidationError
} from './errors.mjs';

const execAsync = promisify(exec);

/**
 * @typedef {Object} Config
 * @property {string} mode - 'new' or 'resume'
 * @property {string} task - Task content
 * @property {string} sessionId - Session ID for resume mode
 * @property {string} workDir - Working directory
 * @property {string} model - Model name
 * @property {string} reasoningEffort - Reasoning effort level
 * @property {boolean} explicitStdin - Use stdin explicitly
 * @property {number} timeout - Timeout in seconds
 * @property {string} backend - Backend name
 * @property {string} agent - Agent configuration name
 * @property {string} promptFile - Prompt file path
 * @property {boolean} skipPermissions - Skip permission checks
 * @property {boolean} yolo - YOLO mode (alias for skipPermissions)
 * @property {number} maxParallelWorkers - Max parallel workers
 * @property {boolean} parallel - Parallel mode
 * @property {boolean} fullOutput - Full output in parallel mode
 * @property {boolean} quiet - Suppress progress output
 * @property {boolean} backendOutput - Forward backend stderr output
 * @property {boolean} minimalEnv - Use minimal environment variables
 * @property {boolean} debug - Enable debug mode
 */

/**
 * @typedef {Object} TaskSpec
 * @property {string} id - Task ID
 * @property {string} task - Task content
 * @property {string} workDir - Working directory
 * @property {string[]} dependencies - Dependency task IDs
 * @property {string} sessionId - Session ID
 * @property {string} backend - Backend name
 * @property {string} model - Model name
 * @property {string} agent - Agent name
 * @property {string} promptFile - Prompt file path
 * @property {boolean} skipPermissions - Skip permissions
 * @property {boolean} minimalEnv - Use minimal environment variables
 * @property {boolean} useStdin - Use stdin for task input
 */

/**
 * @typedef {Object} ParallelConfig
 * @property {TaskSpec[]} tasks - List of tasks
 */

/**
 * Get default max parallel workers based on CPU, capped at 100
 * @returns {number}
 */
export function getDefaultMaxParallelWorkers() {
  const cpuCount = os.cpus?.().length || 1;
  const adaptive = Math.max(1, cpuCount * 4);
  return Math.min(100, adaptive);
}

const DEFAULT_MAX_PARALLEL_WORKERS = getDefaultMaxParallelWorkers();

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  mode: 'new',
  task: '',
  sessionId: '',
  workDir: '',
  model: '',
  reasoningEffort: '',
  explicitStdin: false,
  timeout: 7200,
  backend: '',
  agent: '',
  promptFile: '',
  skipPermissions: false,
  yolo: false,
  maxParallelWorkers: DEFAULT_MAX_PARALLEL_WORKERS,
  parallel: false,
  fullOutput: false,
  quiet: false,
  minimalEnv: false,
  backendOutput: false,
  debug: false
};

/**
 * Parse command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {Config}
 */
export function parseCliArgs(args) {
  const config = { ...DEFAULT_CONFIG };
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Handle flags with values
    if (arg === '--backend' && i + 1 < args.length) {
      config.backend = args[++i];
    } else if (arg === '--model' && i + 1 < args.length) {
      config.model = args[++i];
    } else if (arg === '--agent' && i + 1 < args.length) {
      config.agent = args[++i];
    } else if (arg === '--prompt-file' && i + 1 < args.length) {
      config.promptFile = expandHome(args[++i]);
    } else if (arg === '--timeout' && i + 1 < args.length) {
      config.timeout = parseInt(args[++i], 10);
    } else if (arg === '--reasoning-effort' && i + 1 < args.length) {
      config.reasoningEffort = args[++i];
    }
    // Handle boolean flags
    else if (arg === '--skip-permissions' || arg === '--yolo') {
      config.skipPermissions = true;
      config.yolo = true;
    } else if (arg === '--parallel') {
      config.parallel = true;
    } else if (arg === '--full-output') {
      config.fullOutput = true;
    } else if (arg === '--quiet') {
      config.quiet = true;
    } else if (arg === '--backend-output') {
      config.backendOutput = true;
    } else if (arg === '--debug') {
      config.debug = true;
    } else if (arg === '--minimal-env') {
      config.minimalEnv = true;
    } else if (arg === '-') {
      config.explicitStdin = true;
    }
    // Handle positional arguments
    else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  // Process positional arguments
  if (positional.length > 0) {
    // Check for resume mode
    if (positional[0] === 'resume') {
      config.mode = 'resume';
      if (positional.length >= 2) {
        config.sessionId = positional[1];
      }
      if (positional.length >= 3) {
        config.task = positional[2];
      }
      if (positional.length >= 4) {
        config.workDir = path.resolve(positional[3]);
      }
    } else {
      // Normal mode: task [workdir]
      config.task = positional[0];
      if (positional.length >= 2) {
        config.workDir = path.resolve(positional[1]);
      }
    }
  }

  // Auto-enable backendOutput in debug mode
  if (config.debug) {
    config.backendOutput = true;
  }

  return config;
}

/**
 * Parse parallel configuration from input
 * @param {string} input - Parallel config input
 * @returns {ParallelConfig}
 */
export function parseParallelConfig(input) {
  const tasks = [];
  const taskBlocks = input.split('---TASK---').filter(block => block.trim());

  for (const block of taskBlocks) {
    const parts = block.split('---CONTENT---');
    if (parts.length < 2) continue;

    const headerLines = parts[0].trim().split('\n');
    const content = parts[1].trim();
    const task = buildTaskFromBlock(headerLines, content);
    if (task) tasks.push(task);
  }

  return { tasks };
}

/**
 * Parse parallel configuration from a readable stream (streaming, tolerant)
 * @param {import('stream').Readable} stream - Input stream
 * @returns {Promise<ParallelConfig>}
 */
export async function parseParallelConfigStream(stream) {
  const tasks = [];
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  let inHeader = false;
  let inContent = false;
  let headerLines = [];
  let contentLines = [];

  const flush = () => {
    if (!inContent) {
      headerLines = [];
      contentLines = [];
      return;
    }
    const content = contentLines.join('\n').trim();
    const task = buildTaskFromBlock(headerLines, content);
    if (task) tasks.push(task);
    headerLines = [];
    contentLines = [];
    inHeader = false;
    inContent = false;
  };

  for await (const line of rl) {
    const trimmed = line.trim();

    if (trimmed === '---TASK---') {
      flush();
      inHeader = true;
      inContent = false;
      continue;
    }

    if (trimmed === '---CONTENT---') {
      if (inHeader) {
        inContent = true;
        inHeader = false;
      }
      continue;
    }

    if (inContent) {
      contentLines.push(line);
    } else if (inHeader) {
      headerLines.push(line);
    }
  }

  flush();

  return { tasks };
}

/**
 * Build task spec from header lines and content
 * @param {string[]} headerLines - Header lines
 * @param {string} content - Task content
 * @returns {TaskSpec|null}
 */
function buildTaskFromBlock(headerLines, content) {
  if (!content) return null;

  const task = {
    id: '',
    task: content,
    workDir: process.cwd(),
    dependencies: [],
    sessionId: '',
    backend: '',
    model: '',
    agent: '',
    promptFile: '',
    skipPermissions: false
  };

  for (const line of headerLines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    switch (key) {
      case 'id':
        task.id = value;
        break;
      case 'workdir':
        task.workDir = path.resolve(expandHome(value));
        break;
      case 'session_id':
        task.sessionId = value;
        break;
      case 'backend':
        task.backend = value;
        break;
      case 'model':
        task.model = value;
        break;
      case 'agent':
        task.agent = value;
        break;
      case 'dependencies':
        task.dependencies = value.split(',').map(d => d.trim()).filter(Boolean);
        break;
      case 'skip_permissions':
        task.skipPermissions = value.toLowerCase() === 'true';
        break;
    }
  }

  if (!task.id) return null;
  return task;
}

/**
 * Validate file path
 * @param {string} filePath - Path to validate
 * @param {Object} options - Validation options
 * @param {boolean} [options.mustExist] - File must exist
 * @param {boolean} [options.mustBeDirectory] - Path must be a directory
 * @param {boolean} [options.mustBeReadable] - File must be readable
 * @returns {Promise<void>}
 */
async function validateFilePath(filePath, options = {}) {
  const expandedPath = expandHome(filePath);
  
  // Check existence
  if (options.mustExist) {
    try {
      await access(expandedPath, constants.F_OK);
    } catch {
      throw new FileNotFoundError(expandedPath);
    }
  }
  
  // Check if directory
  if (options.mustBeDirectory) {
    try {
      const stats = await stat(expandedPath);
      if (!stats.isDirectory()) {
        throw new InvalidFilePathError(expandedPath, 'directory', 'file');
      }
    } catch (err) {
      if (err instanceof InvalidFilePathError) throw err;
      throw new FileNotFoundError(expandedPath);
    }
  }
  
  // Check readability
  if (options.mustBeReadable) {
    try {
      await access(expandedPath, constants.R_OK);
    } catch {
      throw new PermissionDeniedError(expandedPath, 'read');
    }
  }
}

/**
 * Validate backend availability
 * @param {string} backend - Backend name
 * @returns {Promise<void>}
 */
async function validateBackendAvailability(backend) {
  // Dynamically import to avoid circular dependency
  const { selectBackend } = await import('./backend.mjs');
  const backendInstance = selectBackend(backend);
  const command = backendInstance.command();
  
  const whichCommand = process.platform === 'win32'
    ? `where ${command}`
    : `which ${command}`;
  
  try {
    await execAsync(whichCommand);
  } catch {
    throw new BackendNotFoundError(backend);
  }
}

/**
 * Validate parallel configuration
 * @param {TaskSpec[]} tasks - Tasks to validate
 */
function validateParallelConfig(tasks) {
  if (!tasks || tasks.length === 0) {
    throw new TaskValidationError('No tasks provided for parallel execution');
  }

  // Check task ID uniqueness
  const ids = new Set();
  for (const task of tasks) {
    if (ids.has(task.id)) {
      throw new TaskValidationError(`Duplicate task ID: ${task.id}`, { duplicateId: task.id });
    }
    ids.add(task.id);
  }

  // Check dependency references
  for (const task of tasks) {
    if (task.dependencies) {
      for (const dep of task.dependencies) {
        if (!ids.has(dep)) {
          throw new TaskValidationError(
            `Dependency not found: ${dep} (required by ${task.id})`,
            { taskId: task.id, missingDependency: dep }
          );
        }
      }
    }
  }

  // Check for circular dependencies
  const visited = new Set();
  const recStack = new Set();

  function hasCycle(taskId, taskMap) {
    if (recStack.has(taskId)) {
      throw new TaskValidationError(
        `Circular dependency detected involving task: ${taskId}`,
        { taskId }
      );
    }
    if (visited.has(taskId)) {
      return false;
    }

    visited.add(taskId);
    recStack.add(taskId);

    const task = taskMap.get(taskId);
    if (task && task.dependencies) {
      for (const dep of task.dependencies) {
        hasCycle(dep, taskMap);
      }
    }

    recStack.delete(taskId);
    return false;
  }

  const taskMap = new Map(tasks.map(t => [t.id, t]));
  for (const task of tasks) {
    hasCycle(task.id, taskMap);
  }
}

/**
 * Validate configuration (async)
 * @param {Config} config - Configuration to validate
 * @returns {Promise<void>}
 * @throws {ValidationError} If configuration is invalid
 */
export async function validateConfig(config) {
  // 1. Validate timeout
  if (config.timeout <= 0 || config.timeout > 86400) {
    throw new InvalidParameterError(
      'timeout',
      config.timeout,
      'must be between 1 and 86400 seconds (1s to 24h)'
    );
  }

  // 2. Validate maxParallelWorkers
  if (config.maxParallelWorkers < 0 || config.maxParallelWorkers > 1000) {
    throw new InvalidParameterError(
      'maxParallelWorkers',
      config.maxParallelWorkers,
      'must be between 0 and 1000'
    );
  }

  // 3. Validate task (if not parallel mode and not explicit stdin)
  if (config.mode === 'new' && !config.task && !config.explicitStdin && !config.parallel) {
    throw new MissingParameterError('task', 'Task cannot be empty');
  }

  // 4. Resume mode validation
  if (config.mode === 'resume') {
    if (!config.sessionId) {
      throw new MissingParameterError('sessionId', 'Session ID required in resume mode');
    }
    if (!isValidSessionId(config.sessionId)) {
      throw new SessionValidationError(config.sessionId, 'Invalid format (use alphanumeric and hyphens only)');
    }
  }

  // 5. Validate promptFile (if provided)
  if (config.promptFile) {
    await validateFilePath(config.promptFile, { mustExist: true, mustBeReadable: true });
  }

  // 6. Validate workDir (if provided and not "-")
  if (config.workDir && config.workDir !== '-') {
    await validateFilePath(config.workDir, { mustExist: true, mustBeDirectory: true });
  }

  // 7. Validate agent name format (if provided)
  if (config.agent && !/^[a-zA-Z0-9_-]+$/.test(config.agent)) {
    throw new InvalidParameterError('agent', config.agent, 'must contain only alphanumeric characters, hyphens, and underscores');
  }

  // 8. Validate backend availability (skip in parallel mode as tasks may have different backends)
  if (config.backend && !config.parallel) {
    await validateBackendAvailability(config.backend);
  }
}

/**
 * Old synchronous validateConfig for backwards compatibility
 * This is kept for existing code that calls validateConfig synchronously
 * @deprecated Use async validateConfig instead
 */
export function validateConfigSync(config) {
  // Resume mode requires session ID
  if (config.mode === 'resume') {
    if (!config.sessionId) {
      throw new MissingParameterError('sessionId', 'Session ID required in resume mode');
    }
    if (!isValidSessionId(config.sessionId)) {
      throw new SessionValidationError(config.sessionId, 'Invalid format');
    }
  }

  // Normal mode requires a task
  if (config.mode === 'new' && !config.task && !config.explicitStdin && !config.parallel) {
    throw new MissingParameterError('task', 'Task cannot be empty');
  }

  // Workdir cannot be "-"
  if (config.workDir === '-') {
    throw new InvalidParameterError('workDir', '-', 'cannot be "-"');
  }

  // Validate agent name if provided
  if (config.agent && !/^[a-zA-Z0-9_-]+$/.test(config.agent)) {
    throw new InvalidParameterError('agent', config.agent, 'must contain only alphanumeric characters, hyphens, and underscores');
  }

  // Validate timeout
  if (config.timeout <= 0) {
    throw new InvalidParameterError('timeout', config.timeout, 'must be positive');
  }
}

// Export validateParallelConfig for use in executor
export { validateParallelConfig };

/**
 * Load configuration from environment variables
 * @returns {Partial<Config>}
 */
export function loadEnvConfig() {
  const config = {};

  // CODEX_TIMEOUT - can be in milliseconds or seconds
  if (process.env.CODEX_TIMEOUT) {
    const timeout = parseInt(process.env.CODEX_TIMEOUT, 10);
    // If > 10000, assume milliseconds
    config.timeout = timeout > 10000 ? Math.floor(timeout / 1000) : timeout;
  }

  // Skip permissions
  if (process.env.CODEAGENT_SKIP_PERMISSIONS) {
    config.skipPermissions = true;
  }

  // Max parallel workers
  if (process.env.CODEAGENT_MAX_PARALLEL_WORKERS) {
    config.maxParallelWorkers = parseInt(process.env.CODEAGENT_MAX_PARALLEL_WORKERS, 10);
  }

  // Quiet mode
  if (process.env.CODEAGENT_QUIET === '1') {
    config.quiet = true;
  }

  // Backend output forwarding
  if (process.env.CODEAGENT_BACKEND_OUTPUT === '1') {
    config.backendOutput = true;
  }

  // Debug mode
  if (process.env.CODEAGENT_DEBUG === '1') {
    config.debug = true;
  }

  // Default backend
  if (process.env.CODEAGENT_BACKEND) {
    config.backend = process.env.CODEAGENT_BACKEND;
  }

  // Default model
  if (process.env.CODEAGENT_MODEL) {
    config.model = process.env.CODEAGENT_MODEL;
  }

  return config;
}

/**
 * @typedef {Object} TaskResult
 * @property {string} taskId - Task ID
 * @property {number} exitCode - Exit code
 * @property {string} message - Output message
 * @property {string} sessionId - Session ID
 * @property {string} error - Error message
 * @property {string} logPath - Log file path
 * @property {string} coverage - Coverage percentage
 * @property {number} coverageNum - Numeric coverage
 * @property {string[]} filesChanged - Changed files
 * @property {string} keyOutput - Key output summary
 * @property {number} testsPassed - Tests passed
 * @property {number} testsFailed - Tests failed
 */
