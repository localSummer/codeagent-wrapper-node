/**
 * Main module - CLI entry point and orchestration
 */

import { parseCliArgs, parseParallelConfigStream, validateConfig, loadEnvConfig } from './config.mjs';
import { selectBackend } from './backend.mjs';
import { runTask, runParallel, ProgressStage } from './executor.mjs';
import { createLogger, cleanupOldLogs } from './logger.mjs';
import { generateFinalOutput } from './utils.mjs';
import { getAgentConfig, loadModelsConfig } from './agent-config.mjs';
import { runInit } from './init.mjs';
import * as readline from 'readline';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const VERSION = pkg.version;

const HELP_TEXT = `
codeagent-wrapper v${VERSION}
Unified wrapper for AI CLI backends (Codex, Claude, Gemini, Opencode)

Usage:
  codeagent-wrapper [options] <task> [workdir]
  codeagent-wrapper resume <session_id> <task> [workdir]
  codeagent-wrapper --parallel < tasks.txt
  codeagent-wrapper --cleanup
  codeagent-wrapper init [--force]

Required Arguments:
  task                 Task description (or "-" to read from stdin)

Optional Arguments:
  workdir              Working directory (default: current directory)

Options:
  --backend <name>     Backend to use: codex, claude, gemini, opencode
  --model <model>      Model to use (backend-specific)
  --agent <name>       Agent configuration name (from ~/.codeagent/models.json)
  --prompt-file <path> Path to prompt file
  --timeout <seconds>  Timeout in seconds (default: 7200, max: 86400)
  --reasoning-effort   Reasoning effort level (claude only: low, medium, high)
  --skip-permissions   Skip permission checks (YOLO mode)
  --backend-output     Forward backend output to terminal (for debugging)
  --parallel           Run tasks in parallel mode
  --full-output        Show full output in parallel mode
  --quiet, -q          Disable real-time progress output
  --cleanup            Clean up old log files
  --force              Force overwrite without confirmation (for init)
  --help, -h           Show this help
  --version, -v        Show version

Commands:
  init                 Install codeagent skill to ~/.claude/skills/
  resume <id>          Resume a previous session

Environment Variables:
  CODEX_TIMEOUT                    Timeout in milliseconds or seconds
  CODEAGENT_SKIP_PERMISSIONS       Skip permissions if set
  CODEAGENT_MAX_PARALLEL_WORKERS   Max parallel workers (default: min(100, cpuCount*4))
  CODEAGENT_QUIET                  Disable progress output if set
  CODEAGENT_ASCII_MODE             Use ASCII symbols instead of Unicode

Examples:
  # Basic usage
  codeagent-wrapper "Fix the bug in auth.js"

  # Specify backend and model
  codeagent-wrapper --backend claude --model sonnet "Add tests" ./src

  # Use agent configuration
  codeagent-wrapper --agent oracle "Review this code"

  # Read task from stdin
  echo "Build the project" | codeagent-wrapper -

  # Resume previous session
  codeagent-wrapper resume abc123 "Continue from where we left off"

  # Debug backend output
  codeagent-wrapper --backend-output "Debug this issue"

  # Parallel task execution
  codeagent-wrapper --parallel < tasks.txt

Documentation:
  GitHub: https://github.com/anthropics/codeagent-wrapper
  Issues: https://github.com/anthropics/codeagent-wrapper/issues
`;

/**
 * Read task from stdin
 * @returns {Promise<string>}
 */
async function readStdinTask() {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  const lines = [];
  for await (const line of rl) {
    lines.push(line);
  }
  return lines.join('\n').trim();
}

/**
 * Read parallel config from stdin (streaming parse)
 * @returns {Promise<import('./config.mjs').ParallelConfig>}
 */
async function readParallelInput() {
  return parseParallelConfigStream(process.stdin);
}

/**
 * Stage emoji mapping
 */
const STAGE_EMOJIS = {
  [ProgressStage.STARTED]: '⏳',
  [ProgressStage.ANALYZING]: '🔍',
  [ProgressStage.EXECUTING]: '⚡',
  [ProgressStage.COMPLETED]: '✓'
};

/**
 * ANSI color codes
 */
const COLORS = {
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  CYAN: '\x1b[36m',
  RESET: '\x1b[0m'
};

/**
 * Format progress event for console output
 * @param {string} stage - Progress stage
 * @param {string} taskId - Task identifier
 * @param {number} elapsed - Elapsed time in ms
 * @param {object} [details] - Additional details
 * @returns {string}
 */
function formatProgress(stage, taskId, elapsed, details = {}) {
  const emoji = STAGE_EMOJIS[stage] || '•';
  const elapsedSec = (elapsed / 1000).toFixed(1);
  
  let message = '';
  let color = COLORS.YELLOW;
  
  switch (stage) {
    case ProgressStage.STARTED:
      message = `${emoji} Task started`;
      color = COLORS.CYAN;
      break;
    case ProgressStage.ANALYZING:
      message = `${emoji} Analyzing...`;
      break;
    case ProgressStage.EXECUTING:
      const tool = details.tool ? ` (${details.tool})` : '';
      message = `${emoji} Executing${tool}`;
      break;
    case ProgressStage.COMPLETED:
      message = `${emoji} Task completed (${elapsedSec}s)`;
      color = COLORS.GREEN;
      break;
    default:
      message = `${emoji} ${stage}`;
  }
  
  // Use ASCII mode if env var is set
  const useAscii = process.env.CODEAGENT_ASCII_MODE;
  if (useAscii) {
    message = message.replace(/[⏳🔍⚡✓]/g, match => {
      const asciiMap = { '⏳': '[*]', '🔍': '[?]', '⚡': '[!]', '✓': '[√]' };
      return asciiMap[match] || '[·]';
    });
  }
  
  return `${color}${message}${COLORS.RESET}`;
}


/**
 * Main function
 * @param {string[]} args - Command line arguments
 */
export async function main(args) {
  // Handle --help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP_TEXT);
    return;
  }

  // Handle --version
  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    return;
  }

  // Handle --cleanup
  if (args.includes('--cleanup')) {
    const count = await cleanupOldLogs();
    console.log(`Cleaned up ${count} old log files`);
    return;
  }

  // Handle init command
  if (args.includes('init')) {
    const force = args.includes('--force') || args.includes('-f');
    await runInit({ force });
    return;
  }

  // Pre-load agent configuration (ensures sync calls have cached data)
  await loadModelsConfig();

  // Parse configuration
  const envConfig = loadEnvConfig();
  let config = parseCliArgs(args);
  config = applyEnvConfigOverrides(config, envConfig, args);

  // Handle parallel mode
  if (config.parallel) {
    const parallelConfig = await readParallelInput();
    const logger = createLogger('parallel');

    try {
      const results = await runParallel(parallelConfig.tasks, {
        maxWorkers: config.maxParallelWorkers,
        timeout: config.timeout * 1000,
        fullOutput: config.fullOutput,
        logger
      });

      // Output results
      for (const result of results) {
        if (config.fullOutput) {
          console.log(`\n=== Task: ${result.taskId} ===`);
          console.log(result.message);
        } else {
          const status = result.exitCode === 0 ? 'OK' : 'FAILED';
          console.log(`[${status}] ${result.taskId}`);
        }
      }

      const failed = results.filter(r => r.exitCode !== 0);
      if (failed.length > 0) {
        const error = new Error(`${failed.length} task(s) failed`);
        error.exitCode = 1;
        throw error;
      }
    } finally {
      await logger.close();
    }
    return;
  }

  // Handle stdin task
  if (config.explicitStdin || config.task === '-') {
    config.task = await readStdinTask();
  }

  // Validate configuration
  await validateConfig(config);

  // Load agent configuration if specified
  if (config.agent) {
    const agentConfig = getAgentConfig(config.agent);
    if (!config.backend) config.backend = agentConfig.backend;
    if (!config.model) config.model = agentConfig.model;
    if (!config.promptFile) config.promptFile = agentConfig.promptFile;
  }

  // Select backend
  const backend = selectBackend(config.backend || 'codex');

  // Create logger
  const logger = createLogger();

  try {
    // Track start time for progress elapsed calculation
    const startTime = Date.now();

    // Create progress callback if not in quiet mode
    const progressCallback = config.quiet ? null : (progressEvent) => {
      const elapsed = Date.now() - startTime;
      const formatted = formatProgress(
        progressEvent.stage,
        'main',
        elapsed,
        progressEvent.details || {}
      );
      console.error(formatted);
    };

    // Run task
    const result = await runTask(
      {
        id: 'main',
        task: config.task,
        workDir: config.workDir || process.cwd(),
        sessionId: config.sessionId,
        backend: config.backend,
        model: config.model,
        promptFile: config.promptFile,
        skipPermissions: config.skipPermissions
      },
      backend,
      {
        timeout: config.timeout * 1000,
        logger,
        onProgress: progressCallback,
        backendOutput: config.backendOutput
      }
    );

    // Generate output
    const output = generateFinalOutput(result);
    console.log(output);

    if (result.exitCode !== 0) {
      const error = new Error(result.error || 'Task failed');
      error.exitCode = result.exitCode;
      throw error;
    }
  } finally {
    await logger.close();
  }
}

/**
 * Apply environment config values without overriding explicit CLI flags
 * @param {import('./config.mjs').Config} config
 * @param {Partial<import('./config.mjs').Config>} envConfig
 * @param {string[]} args
 * @returns {import('./config.mjs').Config}
 */
function applyEnvConfigOverrides(config, envConfig, args) {
  const merged = { ...config };
  const hasTimeoutFlag = args.includes('--timeout');
  const hasSkipFlag = args.includes('--skip-permissions') || args.includes('--yolo');
  const hasQuietFlag = args.includes('--quiet') || args.includes('-q');

  if (Number.isFinite(envConfig.timeout) && !hasTimeoutFlag) {
    merged.timeout = envConfig.timeout;
  }

  if (envConfig.skipPermissions && !hasSkipFlag) {
    merged.skipPermissions = true;
    merged.yolo = true;
  }

  if (Number.isFinite(envConfig.maxParallelWorkers)) {
    merged.maxParallelWorkers = envConfig.maxParallelWorkers;
  }

  if (envConfig.quiet && !hasQuietFlag) {
    merged.quiet = true;
  }

  return merged;
}
