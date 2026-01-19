/**
 * Configuration parsing and validation
 */

import * as path from 'path';
import * as os from 'os';
import * as readline from 'readline';
import { expandHome, isValidSessionId } from './utils.mjs';

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
  fullOutput: false
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
 * Validate configuration
 * @param {Config} config - Configuration to validate
 * @throws {Error} If configuration is invalid
 */
export function validateConfig(config) {
  // Resume mode requires session ID
  if (config.mode === 'resume') {
    if (!config.sessionId) {
      const error = new Error('Resume mode requires a session ID');
      error.exitCode = 2;
      throw error;
    }
    if (!isValidSessionId(config.sessionId)) {
      const error = new Error('Invalid session ID format');
      error.exitCode = 2;
      throw error;
    }
  }

  // Normal mode requires a task
  if (config.mode === 'new' && !config.task && !config.explicitStdin && !config.parallel) {
    const error = new Error('No task provided');
    error.exitCode = 2;
    throw error;
  }

  // Workdir cannot be "-"
  if (config.workDir === '-') {
    const error = new Error('Working directory cannot be "-"');
    error.exitCode = 2;
    throw error;
  }

  // Validate agent name if provided
  if (config.agent && !/^[a-zA-Z0-9_-]+$/.test(config.agent)) {
    const error = new Error('Invalid agent name format');
    error.exitCode = 2;
    throw error;
  }

  // Validate timeout
  if (config.timeout <= 0) {
    const error = new Error('Timeout must be positive');
    error.exitCode = 2;
    throw error;
  }
}

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
