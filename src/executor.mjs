/**
 * Task execution engine
 */

import { spawn } from 'child_process';
import { performance } from 'perf_hooks';
import * as fs from 'fs/promises';
import { parseJSONStream } from './parser.mjs';
import { setupSignalHandlers, forwardSignal, getSignalExitCode } from './signal.mjs';
import { filterOutput } from './filter.mjs';
import {
  sanitizeOutput,
  shouldUseStdin,
  extractCoverageFromLines,
  extractFilesChangedFromLines,
  extractTestResultsFromLines,
  extractKeyOutputFromLines,
  extractAllMetrics
} from './utils.mjs';
import { nullLogger } from './logger.mjs';
import { expandHome } from './utils.mjs';
// T1.2: Static imports instead of dynamic imports
import { selectBackend } from './backend.mjs';
import { getAgentConfig } from './agent-config.mjs';

const FORCE_KILL_DELAY = 1000; // 1 second

/**
 * Stderr buffer size - configurable via CODEAGENT_STDERR_BUFFER_SIZE env var
 * Default: 64KB (increased from 4KB for better debugging context)
 */
const STDERR_BUFFER_SIZE = process.env.CODEAGENT_STDERR_BUFFER_SIZE
  ? parseInt(process.env.CODEAGENT_STDERR_BUFFER_SIZE, 10)
  : 65536; // 64KB default

/**
 * Task execution progress stages
 */
export const ProgressStage = {
  STARTED: 'started',    // 任务开始
  ANALYZING: 'analyzing', // 分析/思考阶段
  EXECUTING: 'executing', // 执行/工具调用阶段
  COMPLETED: 'completed'  // 任务完成
};

/**
 * @typedef {Object} ProgressEvent
 * @property {string} stage - Progress stage (ProgressStage)
 * @property {string} message - Progress message
 * @property {string} backend - Backend type
 * @property {object} [details] - Additional details
 */

/**
 * @typedef {import('./config.mjs').TaskSpec} TaskSpec
 * @typedef {import('./config.mjs').TaskResult} TaskResult
 * @typedef {import('./backend.mjs').Backend} Backend
 * @typedef {import('./logger.mjs').Logger} Logger
 */

/**
 * Detect progress from event based on backend type
 * @param {object} event - Parsed event
 * @param {string} backendType - Backend type
 * @returns {ProgressEvent|null}
 */
function detectProgressFromEvent(event, backendType) {
  switch (backendType) {
    case 'claude':
      // Claude: 利用 subtype 判断阶段
      if (event.subtype === 'tool_use') {
        return {
          stage: ProgressStage.EXECUTING,
          message: `Using tool: ${event.name || 'unknown'}`,
          backend: backendType,
          details: { toolName: event.name }
        };
      }
      if (event.subtype === 'tool_result') {
        return {
          stage: ProgressStage.EXECUTING,
          message: 'Tool completed',
          backend: backendType
        };
      }
      break;

    case 'opencode':
      // Opencode: 从 part.state 提取状态
      if (event.part?.state) {
        const stateMap = {
          'input': ProgressStage.ANALYZING,
          'running': ProgressStage.EXECUTING,
          'completed': ProgressStage.COMPLETED,
          'error': ProgressStage.COMPLETED
        };
        const stage = stateMap[event.part.state] || ProgressStage.EXECUTING;
        return {
          stage,
          message: `State: ${event.part.state}`,
          backend: backendType,
          details: { state: event.part.state }
        };
      }
      break;

    case 'codex':
      // Codex: 从 item.type 判断
      if (event.type === 'command_execution') {
        return {
          stage: ProgressStage.EXECUTING,
          message: event.item?.command || 'Running command',
          backend: backendType,
          details: { command: event.item?.command }
        };
      }
      if (event.item?.type === 'message' && !event.item.content?.startsWith('Thinking')) {
        return {
          stage: ProgressStage.ANALYZING,
          message: 'Analyzing...',
          backend: backendType
        };
      }
      break;

    case 'gemini':
      // Gemini: 从 type 和 delta 判断
      if (event.type === 'tool_use' || event.tool_use) {
        return {
          stage: ProgressStage.EXECUTING,
          message: 'Using tool',
          backend: backendType
        };
      }
      if (event.role === 'model' && event.delta) {
        return {
          stage: ProgressStage.ANALYZING,
          message: 'Generating response...',
          backend: backendType
        };
      }
      break;
  }

  return null;
}

/**
 * Forward backend stderr output to process.stderr with [BACKEND] prefix
 * @param {string} chunk - Stderr chunk
 * @param {Logger} logger - Logger instance
 */
function forwardBackendOutput(chunk, logger) {
  // Split into lines while preserving line endings
  const lines = chunk.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip empty lines (except the last one if it's empty, which means chunk ended with \n)
    if (line === '' && i === lines.length - 1) {
      continue;
    }

    // Preserve ANSI color codes if TTY, strip otherwise
    let output = line;
    if (!process.stderr.isTTY) {
      output = output.replace(/\x1b\[[0-9;]*m/g, '');
    }

    // Add [BACKEND] prefix and write to stderr
    process.stderr.write(`[BACKEND] ${output}\n`);
  }
}

/**
 * Essential environment variables for AI CLI backends
 */
const ESSENTIAL_ENV_VARS = [
  'PATH', 'HOME', 'USER', 'SHELL', 'TERM',
  'LANG', 'LC_ALL', 'LC_CTYPE',
  // AI backend API keys
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY',
  'GOOGLE_API_KEY', 'AZURE_OPENAI_API_KEY',
  // Proxy settings
  'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
  // Common development tools
  'NODE_PATH', 'PYTHONPATH', 'GEM_PATH', 'GOPATH',
  // Terminal and display
  'DISPLAY', 'COLORTERM', 'TERM_PROGRAM',
  // SSH and auth
  'SSH_AUTH_SOCK', 'GPG_AGENT_INFO',
  // Codex/Codeagent specific
  'CODEX_TIMEOUT', 'CODEX_MODEL', 'CODEX_BACKEND',
  'CODEAGENT_QUIET', 'CODEAGENT_ASCII_MODE', 'CODEAGENT_PERFORMANCE_METRICS'
];

/**
 * Build process environment based on minimalEnv setting
 * @param {boolean} minimalEnv - Whether to use minimal environment
 * @returns {object} Environment object
 */
function buildProcessEnv(minimalEnv) {
  if (!minimalEnv) {
    return { ...process.env };
  }

  // Build minimal environment with only essential variables
  const env = {};
  for (const key of ESSENTIAL_ENV_VARS) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }

  // Also include any environment variables that start with known prefixes
  const prefixes = ['CODEX_', 'CODEAGENT_', 'OPENAI_', 'ANTHROPIC_', 'GEMINI_', 'GOOGLE_'];
  for (const [key, value] of Object.entries(process.env)) {
    if (prefixes.some(prefix => key.startsWith(prefix))) {
      env[key] = value;
    }
  }

  return env;
}

/**
 * Run a single task
 * @param {TaskSpec} taskSpec - Task specification
 * @param {Backend} backend - Backend to use
 * @param {object} [options] - Options
 * @param {number} [options.timeout] - Timeout in milliseconds
 * @param {Logger} [options.logger] - Logger instance
 * @param {AbortSignal} [options.signal] - Abort signal
 * @param {function(ProgressEvent): void} [options.onProgress] - Progress callback
 * @param {boolean} [options.backendOutput] - Forward backend stderr output
 * @returns {Promise<TaskResult>}
 */
export async function runTask(taskSpec, backend, options = {}) {
  const {
    timeout = 7200000,
    logger = nullLogger,
    signal: externalSignal,
    onProgress = null,
    backendOutput = false,
    minimalEnv = false
  } = options;

  const taskId = taskSpec.id || 'main';

  // Performance: Track startup timing
  const perfMetrics = {
    taskStart: performance.now(),
    envPrepStart: 0,
    spawnStart: 0,
    firstOutputTime: 0
  };

  logger.info(`Starting task: ${taskId}`);

  // Notify task started
  if (onProgress) {
    try {
      onProgress({
        stage: ProgressStage.STARTED,
        message: `Task ${taskId} started`,
        backend: backend.name()
      });
    } catch (error) {
      logger.error(`Progress callback error: ${error.message}`);
    }
  }

  // Load and inject prompt file content if specified
  let effectiveTask = taskSpec.task;
  if (taskSpec.promptFile) {
    try {
      const promptContent = await loadPromptFile(taskSpec.promptFile);
      if (promptContent) {
        effectiveTask = `${promptContent}\n\n=== TASK ===\n${taskSpec.task}`;
        logger.info(`Loaded prompt file: ${taskSpec.promptFile}`);
      }
    } catch (error) {
      logger.warn(`Failed to load prompt file: ${error.message}`);
    }
  }

  // Determine if we should use stdin
  const useStdin = shouldUseStdin(effectiveTask, false, taskSpec.useStdin);

  // Performance: Measure environment preparation
  perfMetrics.envPrepStart = performance.now();

  // Build arguments
  const targetArg = useStdin ? '-' : effectiveTask;
  const args = backend.buildArgs(taskSpec, targetArg);
  const command = backend.command();

  const envPrepDuration = performance.now() - perfMetrics.envPrepStart;
  logger.debug(`Environment prepared in ${envPrepDuration.toFixed(2)}ms`);
  logger.info(`Executing: ${command} ${args.join(' ')}`);

  // Performance: Measure spawn time
  perfMetrics.spawnStart = performance.now();

  // Build environment (use minimal env if requested for performance)
  const processEnv = buildProcessEnv(minimalEnv || taskSpec.minimalEnv);

  // Spawn process
  const child = spawn(command, args, {
    cwd: taskSpec.workDir || process.cwd(),
    env: processEnv,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const spawnDuration = performance.now() - perfMetrics.spawnStart;
  logger.debug(`Process spawned in ${spawnDuration.toFixed(2)}ms`);

  // Track if we've been interrupted
  let interrupted = false;
  let timedOut = false;

  // Set up timeout
  let timeoutHandle = null;
  if (timeout > 0) {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      logger.warn(`Task ${taskId} timed out after ${timeout}ms`);
      terminateProcess(child);
    }, timeout);
  }

  // T2.1: Set up external abort signal with cleanup
  let abortHandler = null;
  if (externalSignal) {
    abortHandler = () => {
      interrupted = true;
      terminateProcess(child);
    };
    externalSignal.addEventListener('abort', abortHandler);
  }

  // Set up signal handlers
  const signalHandler = setupSignalHandlers((sig) => {
    interrupted = true;
    logger.info(`Received ${sig}, forwarding to child process`);
    forwardSignal(child, sig);
  });

  // Write task to stdin if needed
  if (useStdin) {
    child.stdin.write(effectiveTask);
    child.stdin.end();
  } else {
    child.stdin.end();
  }

  // T3.2: Collect stderr using Buffer array to avoid premature string conversion
  // Performance: Track first output time
  const stderrBuffers = [];
  let stderrSize = 0;
  let firstOutput = false;

  child.stderr.on('data', (data) => {
    // Performance: Record first output time
    if (!firstOutput) {
      perfMetrics.firstOutputTime = performance.now();
      const startupLatency = perfMetrics.firstOutputTime - perfMetrics.spawnStart;
      logger.debug(`First output received in ${startupLatency.toFixed(2)}ms`);
      firstOutput = true;
    }

    // Store Buffer directly to avoid string conversion overhead
    stderrBuffers.push(data);
    stderrSize += data.length;
    // Periodically clean up old chunks when exceeding buffer size
    while (stderrSize > STDERR_BUFFER_SIZE * 2 && stderrBuffers.length > 1) {
      stderrSize -= stderrBuffers.shift().length;
    }

    // Forward backend stderr output if enabled (convert to string only when needed)
    if (backendOutput) {
      forwardBackendOutput(data.toString(), logger);
    }
  });

  // Parse stdout
  let parseResult;
  try {
    parseResult = await parseJSONStream(child.stdout, {
      onEvent: (event, backendType) => {
        // Progress detection
        if (onProgress) {
          try {
            const progress = detectProgressFromEvent(event, backendType);
            if (progress) {
              onProgress(progress);
            }
          } catch (error) {
            logger.error(`Progress detection error: ${error.message}`);
          }
        }
      },
      onMessage: (msg) => {
        logger.debug(`Message: ${msg.slice(0, 100)}`);
      }
    });
  } catch (error) {
    logger.error(`Parse error: ${error.message}`);
    parseResult = { message: '', sessionId: '', backendType: 'unknown' };
  }

  // Wait for process to exit
  const exitCode = await new Promise((resolve) => {
    child.on('close', (code) => {
      resolve(code ?? 1);
    });

    child.on('error', (error) => {
      logger.error(`Process error: ${error.message}`);
      resolve(127); // Command not found
    });
  });

  // Cleanup
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }
  signalHandler.cleanup();
  // T2.1: Clean up abort signal listener
  if (abortHandler && externalSignal) {
    externalSignal.removeEventListener('abort', abortHandler);
  }

  // Determine final exit code
  let finalExitCode = exitCode;
  if (timedOut) {
    finalExitCode = 124;
  } else if (interrupted) {
    finalExitCode = 130;
  }

  // Process output
  const message = sanitizeOutput(parseResult.message);
  const filteredMessage = filterOutput(message, parseResult.backendType);
  const lines = filteredMessage.split('\n');

  // T1.3: Extract all metrics in a single pass
  const metrics = extractAllMetrics(lines);

  // T3.2: Build final stderr buffer - concatenate Buffers then convert to string
  const stderrBuffer = stderrBuffers.length > 0
    ? Buffer.concat(stderrBuffers).slice(-STDERR_BUFFER_SIZE).toString()
    : '';

  logger.info(`Task ${taskId} completed with exit code ${finalExitCode}`);

  // Notify task completed
  if (onProgress) {
    try {
      onProgress({
        stage: ProgressStage.COMPLETED,
        message: `Task ${taskId} completed with exit code ${finalExitCode}`,
        backend: backend.name()
      });
    } catch (error) {
      logger.error(`Progress completed callback error: ${error.message}`);
    }
  }

  // Performance: Output metrics if enabled
  if (process.env.CODEAGENT_PERFORMANCE_METRICS === '1') {
    const totalDuration = performance.now() - perfMetrics.taskStart;
    const startupDuration = perfMetrics.firstOutputTime > 0
      ? perfMetrics.firstOutputTime - perfMetrics.spawnStart
      : 0;

    console.error(JSON.stringify({
      metric: 'task_execution',
      task_id: taskId,
      startup_ms: Math.round(startupDuration * 100) / 100,
      total_ms: Math.round(totalDuration * 100) / 100,
      backend: backend.name(),
      timestamp: new Date().toISOString()
    }));
  }

  return {
    taskId,
    exitCode: finalExitCode,
    message: filteredMessage,
    sessionId: parseResult.sessionId,
    error: finalExitCode !== 0 ? sanitizeOutput(stderrBuffer) : '',
    logPath: logger.path,
    coverage: metrics.coverage,
    coverageNum: metrics.coverageNum,
    filesChanged: metrics.filesChanged,
    keyOutput: metrics.keyOutput,
    testsPassed: metrics.testsPassed,
    testsFailed: metrics.testsFailed
  };
}

/**
 * Gracefully terminate a process
 * @param {import('child_process').ChildProcess} child - Child process
 */
export function terminateProcess(child) {
  if (!child || child.killed || !child.pid) {
    return;
  }

  try {
    // Send SIGTERM first
    if (process.platform === 'win32') {
      child.kill();
    } else {
      child.kill('SIGTERM');
    }

    // Force kill after delay
    setTimeout(() => {
      if (!child.killed) {
        try {
          child.kill('SIGKILL');
        } catch {
          // Ignore
        }
      }
    }, FORCE_KILL_DELAY);
  } catch {
    // Process may already be dead
  }
}

/**
 * Topologically sort tasks based on dependencies
 * T2.3: Optimized using queue instead of iterating entire inDegree map each round
 * @param {TaskSpec[]} tasks - Tasks to sort
 * @returns {TaskSpec[][]} Tasks grouped into layers
 * @throws {Error} If circular dependency detected
 */
export function topologicalSort(tasks) {
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const inDegree = new Map(tasks.map(t => [t.id, 0]));
  const adjList = new Map(tasks.map(t => [t.id, []]));

  // Build graph
  for (const task of tasks) {
    for (const dep of task.dependencies || []) {
      if (!taskMap.has(dep)) {
        const error = new Error(`Unknown dependency: ${dep} (required by ${task.id})`);
        error.exitCode = 2;
        throw error;
      }
      adjList.get(dep).push(task.id);
      inDegree.set(task.id, inDegree.get(task.id) + 1);
    }
  }

  // T2.3: Initialize queue with all tasks having in-degree 0
  const queue = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  // T2.3: Kahn's algorithm with optimized layer tracking using queue + head index
  const layers = [];
  let processed = 0;
  let head = 0;

  while (head < queue.length) {
    // Snapshot current queue end to form a layer
    const layerEnd = queue.length;
    const layer = [];

    while (head < layerEnd) {
      const id = queue[head++];
      layer.push(taskMap.get(id));
      processed++;

      // Update in-degrees and add newly available tasks to queue
      for (const dependent of adjList.get(id)) {
        const newDegree = inDegree.get(dependent) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    layers.push(layer);
  }

  // Check for circular dependency
  if (processed !== tasks.length) {
    const error = new Error('Circular dependency detected');
    error.exitCode = 2;
    throw error;
  }

  return layers;
}

/**
 * Run tasks with concurrency limit
 * @param {TaskSpec[]} tasks - Tasks to run
 * @param {number} limit - Concurrency limit
 * @param {function(TaskSpec): Promise<TaskResult>} fn - Task runner function
 * @returns {Promise<TaskResult[]>}
 */
async function withConcurrencyLimit(tasks, limit, fn) {
  if (limit <= 0 || limit >= tasks.length) {
    return Promise.all(tasks.map(fn));
  }

  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    // Wrap in Promise.resolve().then() to handle both async and sync errors
    // Use finally() to ensure cleanup happens even on synchronous throws
    const promise = Promise.resolve().then(() => fn(task)).finally(() => {
      executing.delete(promise);
    });

    executing.add(promise);
    results.push(promise);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}

/**
 * Run tasks in parallel with dependency handling
 * @param {TaskSpec[]} tasks - Tasks to run
 * @param {object} [options] - Options
 * @param {number} [options.maxWorkers] - Max parallel workers
 * @param {number} [options.timeout] - Timeout per task in milliseconds
 * @param {boolean} [options.fullOutput] - Include full output
 * @param {Logger} [options.logger] - Logger instance
 * @param {boolean} [options.backendOutput] - Forward backend stderr output
 * @param {boolean} [options.minimalEnv] - Use minimal environment variables
 * @returns {Promise<TaskResult[]>}
 */
export async function runParallel(tasks, options = {}) {
  const {
    maxWorkers = 0,
    timeout = 7200000,
    logger = nullLogger,
    backendOutput = false,
    minimalEnv = false
  } = options;

  // T1.2: Using static imports from top of file (selectBackend, getAgentConfig)

  // Topologically sort tasks
  const layers = topologicalSort(tasks);
  logger.info(`Running ${tasks.length} tasks in ${layers.length} layers`);

  const allResults = [];
  const completedTasks = new Map(); // taskId -> result
  const skippedTasks = new Set();

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    logger.info(`Starting layer ${i + 1}/${layers.length} with ${layer.length} tasks`);

    // Filter out tasks whose dependencies failed
    const runnableTasks = layer.filter(task => {
      for (const dep of task.dependencies || []) {
        if (skippedTasks.has(dep)) {
          skippedTasks.add(task.id);
          logger.warn(`Skipping ${task.id}: dependency ${dep} was skipped`);
          return false;
        }
        const depResult = completedTasks.get(dep);
        if (depResult && depResult.exitCode !== 0) {
          skippedTasks.add(task.id);
          logger.warn(`Skipping ${task.id}: dependency ${dep} failed`);
          return false;
        }
      }
      return true;
    });

    // Run layer tasks
    const layerResults = await withConcurrencyLimit(
      runnableTasks,
      maxWorkers,
      async (task) => {
        // Load agent config if specified
        let backend = task.backend;
        let model = task.model;

        if (task.agent) {
          const agentConfig = getAgentConfig(task.agent);
          if (!backend) backend = agentConfig.backend;
          if (!model) model = agentConfig.model;
          if (!task.reasoningEffort && agentConfig.reasoningEffort) {
            task.reasoningEffort = agentConfig.reasoningEffort;
          }
        }

        const selectedBackend = selectBackend(backend || 'codex');

        return runTask(
          { ...task, backend, model },
          selectedBackend,
          { timeout, logger, backendOutput, minimalEnv }
        );
      }
    );

    // Record results
    for (const result of layerResults) {
      completedTasks.set(result.taskId, result);
      allResults.push(result);
    }

    // Add skipped task results
    for (const task of layer) {
      if (skippedTasks.has(task.id) && !completedTasks.has(task.id)) {
        allResults.push({
          taskId: task.id,
          exitCode: 1,
          message: 'Skipped due to dependency failure',
          sessionId: '',
          error: 'Dependency failed',
          logPath: '',
          coverage: '',
          coverageNum: 0,
          filesChanged: [],
          keyOutput: '',
          testsPassed: 0,
          testsFailed: 0
        });
      }
    }
  }

  logger.info(`Completed all tasks. ${allResults.filter(r => r.exitCode === 0).length}/${allResults.length} succeeded`);

  return allResults;
}

/**
 * Load prompt file content
 * @param {string} promptFile - Path to prompt file
 * @returns {Promise<string>}
 */
export async function loadPromptFile(promptFile) {
  if (!promptFile) {
    return '';
  }

  const expandedPath = expandHome(promptFile);

  try {
    const content = await fs.readFile(expandedPath, 'utf-8');
    return content.trim();
  } catch (error) {
    throw new Error(`Failed to load prompt file: ${expandedPath}`);
  }
}
