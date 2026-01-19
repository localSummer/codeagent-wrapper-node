/**
 * Process checking utilities
 */

import * as fs from 'fs/promises';
import { execSync } from 'child_process';

/**
 * Check if a process is running
 * @param {number} pid - Process ID
 * @returns {boolean}
 */
export function isProcessRunning(pid) {
  if (!pid || pid <= 0) {
    return false;
  }

  try {
    // Sending signal 0 tests if process exists without actually sending a signal
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means process exists but we don't have permission
    return error.code === 'EPERM';
  }
}

/**
 * Get process start time (Unix only)
 * @param {number} pid - Process ID
 * @returns {Promise<number|null>} Start time in milliseconds, or null if unavailable
 */
export async function getProcessStartTime(pid) {
  if (process.platform === 'win32') {
    return getProcessStartTimeWindows(pid);
  }
  return getProcessStartTimeUnix(pid);
}

/**
 * Get process start time on Unix systems
 * @param {number} pid - Process ID
 * @returns {Promise<number|null>}
 */
async function getProcessStartTimeUnix(pid) {
  try {
    // Try /proc filesystem (Linux)
    const statPath = `/proc/${pid}/stat`;
    const content = await fs.readFile(statPath, 'utf-8');
    const parts = content.split(' ');
    
    // Field 22 (0-indexed: 21) is starttime in clock ticks
    if (parts.length > 21) {
      const startTicks = parseInt(parts[21], 10);
      
      // Get boot time
      const uptimeContent = await fs.readFile('/proc/uptime', 'utf-8');
      const uptimeSeconds = parseFloat(uptimeContent.split(' ')[0]);
      
      // Get clock ticks per second (usually 100)
      const clockTicks = 100; // sysconf(_SC_CLK_TCK)
      
      const processStartSeconds = startTicks / clockTicks;
      const bootTimeMs = Date.now() - (uptimeSeconds * 1000);
      
      return bootTimeMs + (processStartSeconds * 1000);
    }
  } catch {
    // /proc not available (macOS, BSD)
  }

  // Fallback for macOS: use ps command
  try {
    const output = execSync(`ps -p ${pid} -o lstart=`, { encoding: 'utf-8' });
    const date = new Date(output.trim());
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
  } catch {
    // Process may not exist
  }

  return null;
}

/**
 * Get process start time on Windows
 * @param {number} pid - Process ID
 * @returns {Promise<number|null>}
 */
async function getProcessStartTimeWindows(pid) {
  try {
    const output = execSync(
      `wmic process where ProcessId=${pid} get CreationDate /format:list`,
      { encoding: 'utf-8' }
    );

    const match = output.match(/CreationDate=(\d{14})/);
    if (match) {
      // Format: YYYYMMDDHHmmss
      const dateStr = match[1];
      const year = parseInt(dateStr.slice(0, 4), 10);
      const month = parseInt(dateStr.slice(4, 6), 10) - 1;
      const day = parseInt(dateStr.slice(6, 8), 10);
      const hour = parseInt(dateStr.slice(8, 10), 10);
      const min = parseInt(dateStr.slice(10, 12), 10);
      const sec = parseInt(dateStr.slice(12, 14), 10);

      return new Date(year, month, day, hour, min, sec).getTime();
    }
  } catch {
    // WMIC may fail or process may not exist
  }

  return null;
}

/**
 * Check if PID has been reused
 * @param {number} pid - Process ID
 * @param {number} fileModTime - File modification time in milliseconds
 * @returns {Promise<boolean>} True if PID appears to be reused
 */
export async function isPIDReused(pid, fileModTime) {
  const processStartTime = await getProcessStartTime(pid);

  if (processStartTime === null) {
    // Can't determine, assume not reused if process is running
    return !isProcessRunning(pid);
  }

  // Allow 1 second buffer for clock skew
  const buffer = 1000;

  // If process started after file was modified, PID was reused
  return processStartTime > (fileModTime + buffer);
}

/**
 * Get file modification time
 * @param {string} filepath - File path
 * @returns {Promise<number|null>} Modification time in milliseconds
 */
export async function getFileModTime(filepath) {
  try {
    const stats = await fs.stat(filepath);
    return stats.mtimeMs;
  } catch {
    return null;
  }
}
