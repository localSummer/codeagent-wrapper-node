/**
 * Signal handling utilities
 */

/**
 * @typedef {Object} SignalHandler
 * @property {function(): void} cleanup - Cleanup function
 */

/**
 * Set up signal handlers
 * @param {function(string): void} onSignal - Signal callback
 * @returns {SignalHandler}
 */
export function setupSignalHandlers(onSignal) {
  const handler = (signal) => {
    onSignal(signal);
  };

  // Set up handlers for common signals
  // Note: Windows has limited signal support
  const signals = ['SIGINT', 'SIGTERM'];
  
  if (process.platform !== 'win32') {
    signals.push('SIGHUP');
  }

  for (const signal of signals) {
    try {
      process.on(signal, () => handler(signal));
    } catch {
      // Ignore if signal not supported
    }
  }

  return {
    cleanup: () => {
      for (const signal of signals) {
        try {
          process.removeListener(signal, handler);
        } catch {
          // Ignore
        }
      }
    }
  };
}

/**
 * Forward signal to child process
 * @param {import('child_process').ChildProcess} child - Child process
 * @param {string} signal - Signal name
 */
export function forwardSignal(child, signal) {
  if (!child || child.killed || !child.pid) {
    return;
  }

  try {
    // On Windows, SIGTERM and SIGINT may not work as expected
    if (process.platform === 'win32') {
      // Use taskkill for Windows
      child.kill();
    } else {
      child.kill(signal);
    }
  } catch {
    // Process may already be dead
  }
}

/**
 * Get signal exit code
 * @param {string} signal - Signal name
 * @returns {number}
 */
export function getSignalExitCode(signal) {
  // Standard Unix convention: 128 + signal number
  const signalNumbers = {
    SIGHUP: 1,
    SIGINT: 2,
    SIGQUIT: 3,
    SIGTERM: 15
  };

  const num = signalNumbers[signal];
  if (num) {
    return 128 + num;
  }

  // Default for interrupt
  return 130;
}
