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
  extractKeyOutputFromLines
} from './utils.mjs';
import { nullLogger } from './logger.mjs';
import { expandHome } from './utils.mjs';

const FORCE_KILL_DELAY = 1000; // 1 second
const STDERR_BUFFER_SIZE = 4096;

/**
 * @typedef {import('./config.mjs').TaskSpec} TaskSpec
 * @typedef {import('./config.mjs').TaskResult} TaskResult
 * @typedef {import('./backend.mjs').Backend} Backend
 * @typedef {import('./logger.mjs').Logger} Logger
 */

/**
 * Run a single task
 * @param {TaskSpec} taskSpec - Task specification
 * @param {Backend} backend - Backend to use
 * @param {object} [options] - Options
 * @param {number} [options.timeout] - Timeout in milliseconds
 * @param {Logger} [options.logger] - Logger instance
 * @param {AbortSignal} [options.signal] - Abort signal
 * @returns {Promise<TaskResult>}
 */
export async function runTask(taskSpec, backend, options = {}) {
  const { 
    timeout = 7200000, 
    logger = nullLogger,
    signal: externalSignal 
  } = options;

  const taskId = taskSpec.id || 'main';
  logger.info(`Starting task: ${taskId}`);

  // Determine if we should use stdin
  const useStdin = shouldUseStdin(taskSpec.task, false, taskSpec.useStdin);

  // Build arguments
  const targetArg = useStdin ? '-' : taskSpec.task;
  const args = backend.buildArgs(taskSpec, targetArg);
  const command = backend.command();

  logger.info(`Executing: ${command} ${args.join(' ')}`);

  // Spawn process
  const child = spawn(command, args, {
    cwd: taskSpec.workDir || process.cwd(),
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe']
  });

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

  // Set up external abort signal
  if (externalSignal) {
    externalSignal.addEventListener('abort', () => {
      interrupted = true;
      terminateProcess(child);
    });
  }

  // Set up signal handlers
  const signalHandler = setupSignalHandlers((sig) => {
    interrupted = true;
    logger.info(`Received ${sig}, forwarding to child process`);
    forwardSignal(child, sig);
  });

  // Write task to stdin if needed
  if (useStdin) {
    child.stdin.write(taskSpec.task);
    child.stdin.end();
  } else {
    child.stdin.end();
  }

  // Collect stderr (limited buffer)
  let stderrBuffer = '';
  child.stderr.on('data', (data) => {
    const chunk = data.toString();
    stderrBuffer += chunk;
    // Keep only last N bytes
    if (stderrBuffer.length > STDERR_BUFFER_SIZE) {
      stderrBuffer = stderrBuffer.slice(-STDERR_BUFFER_SIZE);
    }
  });

  // Parse stdout
  let parseResult;
  try {
    parseResult = await parseJSONStream(child.stdout, {
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

  // Extract structured information
  const { coverage, coverageNum } = extractCoverageFromLines(lines);
  const filesChanged = extractFilesChangedFromLines(lines);
  const { passed: testsPassed, failed: testsFailed } = extractTestResultsFromLines(lines);
  const keyOutput = extractKeyOutputFromLines(lines);

  logger.info(`Task ${taskId} completed with exit code ${finalExitCode}`);

  return {
    taskId,
    exitCode: finalExitCode,
    message: filteredMessage,
    sessionId: parseResult.sessionId,
    error: finalExitCode !== 0 ? sanitizeOutput(stderrBuffer) : '',
    logPath: logger.path,
    coverage,
    coverageNum,
    filesChanged,
    keyOutput,
    testsPassed,
    testsFailed
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

  // Kahn's algorithm with layer tracking
  const layers = [];
  let remaining = tasks.length;

  while (remaining > 0) {
    // Find all tasks with in-degree 0
    const layer = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        layer.push(taskMap.get(id));
        inDegree.set(id, -1); // Mark as processed
      }
    }

    if (layer.length === 0) {
      const error = new Error('Circular dependency detected');
      error.exitCode = 2;
      throw error;
    }

    // Update in-degrees
    for (const task of layer) {
      for (const dependent of adjList.get(task.id)) {
        if (inDegree.get(dependent) > 0) {
          inDegree.set(dependent, inDegree.get(dependent) - 1);
        }
      }
    }

    layers.push(layer);
    remaining -= layer.length;
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

  // Import backend selector
  const { selectBackend } = await import('./backend.mjs');
  const { getAgentConfig } = await import('./agent-config.mjs');

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
