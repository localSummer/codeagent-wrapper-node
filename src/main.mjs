/**
 * Main module - CLI entry point and orchestration
 */

import { parseCliArgs, parseParallelConfigStream, validateConfig, loadEnvConfig } from './config.mjs';
import { selectBackend } from './backend.mjs';
import { runTask, runParallel } from './executor.mjs';
import { createLogger, cleanupOldLogs } from './logger.mjs';
import { generateFinalOutput, formatProgressMessage } from './utils.mjs';
import { getAgentConfig, loadModelsConfig } from './agent-config.mjs';
import { runInit } from './init.mjs';
import * as readline from 'readline';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');
const VERSION = pkg.version;

const HELP_HEADER = `
codeagent-wrapper v${VERSION}
Unified wrapper for AI CLI backends (Codex, Claude, Gemini, Opencode)
`;

const HELP_USAGE = `
Usage:
  codeagent-wrapper [options] <task> [workdir]
  codeagent-wrapper resume <session_id> <task> [workdir]
  codeagent-wrapper --parallel < tasks.txt
  codeagent-wrapper init [--force]
  codeagent-wrapper --cleanup
`;

const HELP_COMMANDS = `
Commands:
  init [--force]        Install codeagent skill to ~/.claude/skills/
                        Use --force to overwrite existing installation
                        Example: codeagent-wrapper init

  resume <session_id>   Resume a previous session and continue with a new task
                        The session ID can be found in previous task output
                        Example: codeagent-wrapper resume abc123 "Continue work"

  --parallel            Run multiple tasks in parallel, reading from stdin
                        Each line should be a JSON task definition
                        Example: cat tasks.txt | codeagent-wrapper --parallel

  --cleanup             Remove old log files to free up disk space
                        Logs older than 30 days are deleted
                        Example: codeagent-wrapper --cleanup
`;

const HELP_OPTIONS = `
Options:
  Backend Configuration:
    --backend <name>    Backend to use (codex, claude, gemini, opencode)
    --model <model>     Model to use
    --agent <name>      Agent configuration name

  Input:
    --prompt-file <path>  Path to prompt file

  Execution Control:
    --timeout <seconds>       Timeout in seconds (default: 7200)
    --skip-permissions        Skip permission checks (YOLO mode)
    --max-parallel-workers <n>  Max parallel workers (default: min(100, CPU*4))

  Output Control:
    --quiet             Suppress progress output
    --full-output       Show full output in parallel mode
    --backend-output    Show backend stderr output (for debugging)
    --debug             Enable debug mode (auto-enables --backend-output)

  Meta:
    --help, -h          Show this help
    --version, -v       Show version
    --force             Force overwrite without confirmation (for init)
`;

const HELP_ENV = `
Environment Variables:
  CODEX_TIMEOUT                   Timeout (seconds or milliseconds)
                                  Example: export CODEX_TIMEOUT=3600

  CODEAGENT_SKIP_PERMISSIONS      Skip permission checks (YOLO mode)
                                  Example: export CODEAGENT_SKIP_PERMISSIONS=1

  CODEAGENT_MAX_PARALLEL_WORKERS  Max parallel workers
                                  Default: min(100, CPU_count * 4)
                                  Example: export CODEAGENT_MAX_PARALLEL_WORKERS=20

  CODEAGENT_QUIET                 Suppress progress output
                                  Values: Set to 1 to enable
                                  Example: export CODEAGENT_QUIET=1

  CODEAGENT_ASCII_MODE            Use ASCII symbols instead of Unicode
                                  Values: Set to 1 to enable
                                  Example: export CODEAGENT_ASCII_MODE=1

  CODEAGENT_BACKEND_OUTPUT        Show backend stderr output
                                  Values: Set to 1 to enable
                                  Example: export CODEAGENT_BACKEND_OUTPUT=1

  CODEAGENT_DEBUG                 Enable debug mode (auto-enables backend output)
                                  Values: Set to 1 to enable
                                  Example: export CODEAGENT_DEBUG=1

  CODEAGENT_BACKEND               Default backend to use
                                  Values: codex, claude, gemini, opencode
                                  Example: export CODEAGENT_BACKEND=claude

  CODEAGENT_MODEL                 Default model to use
                                  Example: export CODEAGENT_MODEL=claude-opus-4-5-20251101

  CODEAGENT_STDERR_BUFFER_SIZE    Stderr buffer size in bytes
                                  Default: 65536 (64KB)
                                  Example: export CODEAGENT_STDERR_BUFFER_SIZE=131072
`;

const HELP_EXAMPLES = `
Examples:
  # Basic usage - run a simple task
  codeagent-wrapper "Fix the bug in auth.js"

  # Specify backend and working directory
  codeagent-wrapper --backend claude "Add tests" ./src

  # Use predefined agent configuration
  codeagent-wrapper --agent oracle "Review this code"

  # Resume previous session
  codeagent-wrapper resume abc123 "Continue from where we left off"

  # Read task from stdin
  echo "Build the project" | codeagent-wrapper -

  # Parallel execution from file
  cat tasks.txt | codeagent-wrapper --parallel

  # Debug mode with backend output
  codeagent-wrapper --debug --backend-output "Debug this issue"

  # Install codeagent skill to Claude
  codeagent-wrapper init
`;

const HELP_QUICKSTART = `
Quick Start:
  1. Install a backend:
     npm install -g @anthropic-ai/claude-code

  2. Run your first task:
     codeagent-wrapper "Your task description here"

  3. For more options:
     codeagent-wrapper --help

Documentation: https://github.com/codeagent-wrapper-node#readme
`;

const HELP_TEXT = [
  HELP_HEADER,
  HELP_USAGE,
  HELP_COMMANDS,
  HELP_OPTIONS,
  HELP_ENV,
  HELP_EXAMPLES,
  HELP_QUICKSTART
].join('\n');

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
        logger,
        backendOutput: config.backendOutput,
        minimalEnv: config.minimalEnv
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

  // Validate configuration (after reading stdin and applying agent overrides)
  try {
    await validateConfig(config);
  } catch (error) {
    throw error; // Re-throw to be caught by bin/codeagent-wrapper.mjs
  }

  // Load agent configuration if specified
  if (config.agent) {
    const agentConfig = getAgentConfig(config.agent);
    if (!config.backend) config.backend = agentConfig.backend;
    if (!config.model) config.model = agentConfig.model;
    if (!config.promptFile) config.promptFile = agentConfig.promptFile;
    if (!config.reasoningEffort) config.reasoningEffort = agentConfig.reasoningEffort;
  }

  // Select backend
  const backend = selectBackend(config.backend || 'codex');

  // Create logger
  const logger = createLogger();

  // Track task start time for elapsed calculation
  const taskStartTime = Date.now();

  // Create progress callback (only if not in quiet mode)
  const onProgress = config.quiet ? null : (progressEvent) => {
    try {
      const message = formatProgressMessage(progressEvent, taskStartTime);
      if (message) {
        process.stderr.write(message + '\n');
      }
    } catch (error) {
      logger.error(`Progress callback error: ${error.message}`);
    }
  };

  try {
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
        skipPermissions: config.skipPermissions,
        minimalEnv: config.minimalEnv
      },
      backend,
      {
        timeout: config.timeout * 1000,
        logger,
        onProgress,
        backendOutput: config.backendOutput,
        minimalEnv: config.minimalEnv
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

  return merged;
}
