/**
 * Async logger with buffered writes
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getWrapperName } from './wrapper-name.mjs';

const MAX_ERROR_ENTRIES = 100;
const FLUSH_INTERVAL_MS = 500;
const QUEUE_SIZE = 1000;
const CLOSE_TIMEOUT_MS = parseInt(process.env.CODEAGENT_LOGGER_CLOSE_TIMEOUT_MS || '5000', 10);

/**
 * Get the log directory path
 * Creates ~/.codeagent/logs if it doesn't exist
 * @returns {string}
 */
function getLogDir() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const logDir = path.join(homeDir, '.codeagent', 'logs');
  
  // Ensure directory exists (sync for simplicity at startup)
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  return logDir;
}

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

  /**
   * Create a new Logger
   * @param {string} logPath - Path to log file
   */
  constructor(logPath) {
    this.#path = logPath;
    this.#stream = fs.createWriteStream(logPath, { flags: 'a' });
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
      if (this.#errorEntries.length > MAX_ERROR_ENTRIES) {
        this.#errorEntries.shift();
      }
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
    if (this.#queue.length === 0 || !this.#stream) return;

    const entries = this.#queue.splice(0);
    const text = entries.join('\n') + '\n';
    
    this.#pendingWrites++;
    this.#stream.write(text, () => {
      this.#pendingWrites--;
    });
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
 * Check if a process is running
 * @param {number} pid - Process ID
 * @returns {boolean}
 */
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
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
