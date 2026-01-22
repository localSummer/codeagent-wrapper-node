/**
 * Task execution engine
 */

import { spawn } from 'child_process';
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
const STDERR_BUFFER_SIZE = 4096;

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
 * Run a single task
 * @param {TaskSpec} taskSpec - Task specification
 * @param {Backend} backend - Backend to use
 * @param {object} [options] - Options
 * @param {number} [options.timeout] - Timeout in milliseconds
 * @param {Logger} [options.logger] - Logger instance
 * @param {AbortSignal} [options.signal] - Abort signal
 * @param {function(ProgressEvent): void} [options.onProgress] - Progress callback
 * @param {boolean} [options.backendOutput] - Forward backend output to terminal
 * @returns {Promise<TaskResult>}
 */
export async function runTask(taskSpec, backend, options = {}) {
  const {
    timeout = 7200000,
    logger = nullLogger,
    signal: externalSignal,
    onProgress = null,
    backendOutput = false
  } = options;

  const taskId = taskSpec.id || 'main';
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

  // Build arguments
  const targetArg = useStdin ? '-' : effectiveTask;
  const args = backend.buildArgs(taskSpec, targetArg);
  const command = backend.command();

  logger.info(`Executing: ${command} ${args.join(' ')}`);

  // Determine stdio configuration based on backendOutput option
  let stdioConfig;
  let outputForwarder = null;

  if (backendOutput) {
    // When backendOutput is enabled, pipe stdout/stderr and forward in real-time
    stdioConfig = ['pipe', 'pipe', 'pipe'];
  } else {
    // Normal mode: capture output for parsing
    stdioConfig = ['pipe', 'pipe', 'pipe'];
  }

  // Spawn process
  const child = spawn(command, args, {
    cwd: taskSpec.workDir || process.cwd(),
    env: { ...process.env },
    stdio: stdioConfig
  });

  // Set up output forwarding if enabled
  if (backendOutput) {
    // Forward stdout in real-time (preserves ANSI colors)
    child.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    // Forward stderr in real-time (preserves ANSI colors)
    child.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    // Add separator to distinguish backend output from progress
    outputForwarder = {
      start: () => {
        process.stderr.write('\n--- Backend Output Start ---\n');
      },
      end: () => {
        process.stderr.write('\n--- Backend Output End ---\n');
      }
    };
  }

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

  // T3.2: Collect stderr using array buffer instead of string concatenation
  const stderrChunks = [];
  let stderrSize = 0;
  child.stderr.on('data', (data) => {
    const chunk = data.toString();
    stderrChunks.push(chunk);
    stderrSize += chunk.length;
    // Periodically clean up old chunks when exceeding buffer size
    while (stderrSize > STDERR_BUFFER_SIZE * 2 && stderrChunks.length > 1) {
      stderrSize -= stderrChunks.shift().length;
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

  // T3.2: Build final stderr buffer
  const stderrBuffer = stderrChunks.join('').slice(-STDERR_BUFFER_SIZE);

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
    const promise = fn(task).then(result => {
      executing.delete(promise);
      return result;
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
 * @returns {Promise<TaskResult[]>}
 */
export async function runParallel(tasks, options = {}) {
  const { 
    maxWorkers = 0, 
    timeout = 7200000,
    logger = nullLogger 
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
        }

        const selectedBackend = selectBackend(backend || 'codex');

        return runTask(
          { ...task, backend, model },
          selectedBackend,
          { timeout, logger }
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
