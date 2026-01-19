/**
 * Main module - CLI entry point and orchestration
 */

import { parseCliArgs, parseParallelConfigStream, validateConfig, loadEnvConfig } from './config.mjs';
import { selectBackend } from './backend.mjs';
import { runTask, runParallel } from './executor.mjs';
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

Options:
  --backend <name>      Backend to use (codex, claude, gemini, opencode)
  --model <model>       Model to use
  --agent <name>        Agent configuration name
  --prompt-file <path>  Path to prompt file
  --skip-permissions    Skip permission checks (YOLO mode)
  --parallel            Run tasks in parallel mode
  --full-output         Show full output in parallel mode
  --timeout <seconds>   Timeout in seconds (default: 7200)
  --cleanup             Clean up old log files
  --force               Force overwrite without confirmation (for init)
  --help, -h            Show this help
  --version, -v         Show version

Commands:
  init                  Install codeagent skill to ~/.claude/skills/

Environment Variables:
  CODEX_TIMEOUT                    Timeout in milliseconds or seconds
  CODEAGENT_SKIP_PERMISSIONS       Skip permissions if set
  CODEAGENT_MAX_PARALLEL_WORKERS   Max parallel workers (0 = unlimited, default: min(100, cpuCount*4))
  CODEAGENT_ASCII_MODE             Use ASCII symbols instead of Unicode

Examples:
  codeagent-wrapper "Fix the bug in auth.js"
  codeagent-wrapper --backend claude "Add tests" ./src
  codeagent-wrapper --agent oracle "Review this code"
  codeagent-wrapper resume abc123 "Continue from where we left off"
  echo "Build the project" | codeagent-wrapper -
  codeagent-wrapper init
  codeagent-wrapper init --force
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
  validateConfig(config);

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
        logger
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
