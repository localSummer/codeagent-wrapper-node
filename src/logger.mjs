/**
 * Async logger with buffered writes
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getWrapperName } from './wrapper-name.mjs';
import { isProcessRunning } from './process-check.mjs';

const MAX_ERROR_ENTRIES = 100;
// Performance: Optimized buffer parameters (reduced from 500ms/1000)
const FLUSH_INTERVAL_MS = parseInt(process.env.CODEAGENT_LOGGER_FLUSH_INTERVAL_MS || '200', 10);
const QUEUE_SIZE = parseInt(process.env.CODEAGENT_LOGGER_QUEUE_SIZE || '100', 10);
const CLOSE_TIMEOUT_MS = parseInt(process.env.CODEAGENT_LOGGER_CLOSE_TIMEOUT_MS || '5000', 10);

// T4.1: Lazy initialization - cache log directory path and initialization promise
let cachedLogDir = null;
let logDirInitPromise = null;

/**
 * Get the log directory path (synchronous, for compatibility)
 * @returns {string}
 */
function getLogDirPath() {
  if (cachedLogDir) return cachedLogDir;
  
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  cachedLogDir = path.join(homeDir, '.codeagent', 'logs');
  return cachedLogDir;
}

/**
 * Ensure log directory exists (async version)
 * T4.1: Uses async fs operations instead of sync
 * @returns {Promise<string>}
 */
async function ensureLogDir() {
  const logDir = getLogDirPath();
  
  if (!logDirInitPromise) {
    logDirInitPromise = fs.promises.mkdir(logDir, { recursive: true })
      .then(() => logDir)
      .catch(() => logDir); // Directory may already exist
  }
  
  return logDirInitPromise;
}

/**
 * Get the log directory path (sync fallback for createLogger compatibility)
 * T4.1: Only creates directory synchronously if async init hasn't completed
 * @returns {string}
 */
function getLogDir() {
  const logDir = getLogDirPath();
  
  // If async init is in progress or completed, just return the path
  // The directory will be created before first write completes
  if (logDirInitPromise) {
    return logDir;
  }
  
  // Fallback: synchronous creation only if async init hasn't started
  // This maintains backward compatibility
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  return logDir;
}

// T4.1: Start async directory initialization at module load
ensureLogDir();

/**
 * Async Logger class
 */
export class Logger {
  #path;
  #stream;
  #queue = [];
  #errorEntries = [];
  #flushTimer = null;
  #closed = false;
  #pendingWrites = 0;
  #drainPending = false;

  /**
   * Create a new Logger
   * @param {string} logPath - Path to log file
   */
  constructor(logPath) {
    this.#path = logPath;
    this.#stream = fs.createWriteStream(logPath, { flags: 'a' });
    this.#stream.on('drain', () => {
      this.#drainPending = false;
      this.#flush();
    });
    this.#startFlushTimer();
  }

  /**
   * Get log file path
   * @returns {string}
   */
  get path() {
    return this.#path;
  }

  /**
   * Start the periodic flush timer
   */
  #startFlushTimer() {
    this.#flushTimer = setInterval(() => {
      this.#flush();
    }, FLUSH_INTERVAL_MS);
    // Don't prevent process exit
    this.#flushTimer.unref();
  }

  /**
   * Format a log entry
   * @param {string} level - Log level
   * @param {string} message - Log message
   * @returns {string}
   */
  #format(level, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  }

  /**
   * Internal log method
   * @param {string} level - Log level
   * @param {string} message - Log message
   */
  #log(level, message) {
    if (this.#closed) return;

    const entry = this.#format(level, message);
    this.#queue.push(entry);

    // Store errors and warnings
    if (level === 'error' || level === 'warn') {
      this.#errorEntries.push(entry);
      // T3.3: Batch cleanup when exceeding 2x limit to reduce array operations
      if (this.#errorEntries.length > MAX_ERROR_ENTRIES * 2) {
        this.#errorEntries = this.#errorEntries.slice(-MAX_ERROR_ENTRIES);
      }
      
      // Performance: Smart flush - write error/warn immediately
      this.#flush();
      return;
    }

    // Flush if queue is full
    if (this.#queue.length >= QUEUE_SIZE) {
      this.#flush();
    }
  }

  /**
   * Flush pending log entries to file
   */
  #flush() {
    if (this.#queue.length === 0 || !this.#stream || this.#drainPending) return;

    const entries = this.#queue.splice(0);
    const text = entries.join('\n') + '\n';
    
    this.#pendingWrites++;
    const canWrite = this.#stream.write(text, () => {
      this.#pendingWrites--;
    });
    if (!canWrite) {
      this.#drainPending = true;
    }
  }

  /**
   * Log an info message
   * @param {string} message - Log message
   */
  info(message) {
    this.#log('info', message);
  }

  /**
   * Log a warning message
   * @param {string} message - Log message
   */
  warn(message) {
    this.#log('warn', message);
  }

  /**
   * Log an error message
   * @param {string} message - Log message
   */
  error(message) {
    this.#log('error', message);
  }

  /**
   * Log a debug message
   * @param {string} message - Log message
   */
  debug(message) {
    if (process.env.DEBUG) {
      this.#log('debug', message);
    }
  }

  /**
   * Get recent error entries
   * @returns {string[]}
   */
  getErrorSummary() {
    return [...this.#errorEntries];
  }

  /**
   * Close the logger
   * @returns {Promise<void>}
   */
  async close() {
    if (this.#closed) return;
    this.#closed = true;

    // Stop flush timer
    if (this.#flushTimer) {
      clearInterval(this.#flushTimer);
      this.#flushTimer = null;
    }

    // Final flush
    this.#drainPending = false;
    this.#flush();

    // Wait for pending writes with timeout
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.#stream?.end();
        resolve();
      }, CLOSE_TIMEOUT_MS);

      const checkPending = () => {
        if (this.#pendingWrites === 0) {
          clearTimeout(timeout);
          this.#stream?.end();
          resolve();
        } else {
          setTimeout(checkPending, 50);
        }
      };
      checkPending();
    });
  }
}

/**
 * Create a new logger instance
 * @param {string} [suffix] - Optional suffix for log file name
 * @returns {Logger}
 */
export function createLogger(suffix = '') {
  const wrapperName = getWrapperName();
  const pid = process.pid;
  const logDir = getLogDir();
  
  const filename = suffix 
    ? `${wrapperName}-${pid}-${suffix}.log`
    : `${wrapperName}-${pid}.log`;
  
  const logPath = path.join(logDir, filename);
  return new Logger(logPath);
}

/**
 * Check if file is a symlink
 * @param {string} filepath - File path
 * @returns {Promise<boolean>}
 */
async function isSymlink(filepath) {
  try {
    const stats = await fs.promises.lstat(filepath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Clean up old log files from dead processes
 * @returns {Promise<number>} Number of files cleaned up
 */
export async function cleanupOldLogs() {
  const wrapperName = getWrapperName();
  const logDir = getLogDir();
  const pattern = new RegExp(`^${wrapperName}-(\\d+)(?:-[^.]+)?\\.log$`);
  
  let cleanedCount = 0;

  try {
    const files = await fs.promises.readdir(logDir);
    
    for (const file of files) {
      const match = file.match(pattern);
      if (!match) continue;

      const pid = parseInt(match[1], 10);
      const filepath = path.join(logDir, file);

      // Security: skip symlinks
      if (await isSymlink(filepath)) {
        continue;
      }

      // Security: ensure file is within logDir
      const realPath = await fs.promises.realpath(filepath).catch(() => null);
      if (!realPath || !realPath.startsWith(logDir)) {
        continue;
      }

      // Check if process is still running
      if (!isProcessRunning(pid)) {
        try {
          await fs.promises.unlink(filepath);
          cleanedCount++;
        } catch {
          // Ignore errors
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return cleanedCount;
}

/**
 * No-op logger for silent mode
 */
export const nullLogger = {
  path: '/dev/null',
  info() {},
  warn() {},
  error() {},
  debug() {},
  getErrorSummary() { return []; },
  async close() {}
};
