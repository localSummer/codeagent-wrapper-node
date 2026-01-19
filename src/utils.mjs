/**
 * Utility functions for codeagent-wrapper
 */

/**
 * Remove ANSI escape sequences from text
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
export function sanitizeOutput(text) {
  if (!text) return '';
  // Remove ANSI escape sequences
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
             .replace(/\x1b\][^\x07]*\x07/g, '')  // OSC sequences
             .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');  // Control chars except \t\n\r
}

/**
 * Extract coverage percentage from output lines
 * @param {string[]} lines - Output lines
 * @returns {{coverage: string, coverageNum: number}}
 */
export function extractCoverageFromLines(lines) {
  for (const line of lines) {
    // Match patterns like "Coverage: 92%", "92% coverage", "coverage: 92.5%"
    const match = line.match(/(?:coverage[:\s]*)?(\d+(?:\.\d+)?)\s*%/i);
    if (match) {
      const num = parseFloat(match[1]);
      return { coverage: `${num}%`, coverageNum: num };
    }
  }
  return { coverage: '', coverageNum: 0 };
}

/**
 * Extract changed files from output lines
 * @param {string[]} lines - Output lines
 * @returns {string[]} List of changed files (max 10)
 */
export function extractFilesChangedFromLines(lines) {
  const files = new Set();
  const filePatterns = [
    /(?:Modified|Created|Updated|Changed|Edited|Deleted):\s*(.+)/i,
    /(?:^|\s)([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)(?:\s|$)/
  ];

  for (const line of lines) {
    for (const pattern of filePatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        const file = match[1].trim();
        // Validate it looks like a file path
        if (file.includes('.') && !file.includes(' ') && file.length < 200) {
          files.add(file);
        }
      }
    }
    if (files.size >= 10) break;
  }

  return Array.from(files).slice(0, 10);
}

/**
 * Extract test results from output lines
 * @param {string[]} lines - Output lines
 * @returns {{passed: number, failed: number}}
 */
export function extractTestResultsFromLines(lines) {
  let passed = 0;
  let failed = 0;

  for (const line of lines) {
    // Match patterns like "12 passed, 2 failed", "Tests: 10 passed"
    const passMatch = line.match(/(\d+)\s*(?:tests?\s+)?passed/i);
    const failMatch = line.match(/(\d+)\s*(?:tests?\s+)?failed/i);
    
    if (passMatch) passed = parseInt(passMatch[1], 10);
    if (failMatch) failed = parseInt(failMatch[1], 10);
    
    // Also match "Tests: X" pattern
    const testsMatch = line.match(/tests?:\s*(\d+)/i);
    if (testsMatch && passed === 0) {
      passed = parseInt(testsMatch[1], 10);
    }
  }

  return { passed, failed };
}

/**
 * Extract key output summary from lines
 * @param {string[]} lines - Output lines
 * @returns {string} Key output summary
 */
export function extractKeyOutputFromLines(lines) {
  const summaryPatterns = [
    /^Summary:\s*(.+)/i,
    /^Completed:\s*(.+)/i,
    /^Result:\s*(.+)/i,
    /^Output:\s*(.+)/i
  ];

  for (const line of lines) {
    for (const pattern of summaryPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  }

  // Return first meaningful line if no summary found
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && trimmed.length > 10 && !trimmed.startsWith('#')) {
      return trimmed.slice(0, 200);
    }
  }

  return '';
}

/**
 * Extract coverage gap information
 * @param {string[]} lines - Output lines
 * @returns {string} Coverage gap info
 */
export function extractCoverageGap(lines) {
  const gapPatterns = [
    /(?:uncovered|not covered|missing coverage)[:\s]*(.+)/i,
    /(?:coverage gap)[:\s]*(.+)/i
  ];

  for (const line of lines) {
    for (const pattern of gapPatterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  }

  return '';
}

/**
 * Extract error details from lines
 * @param {string[]} lines - Output lines
 * @returns {string} Error detail
 */
export function extractErrorDetail(lines) {
  const errorPatterns = [
    /(?:error|fail|exception)[:\s]*(.+)/i,
    /(?:stack trace|traceback)[:\s]*/i
  ];

  const errorLines = [];
  let capturing = false;

  for (const line of lines) {
    if (capturing) {
      errorLines.push(line);
      if (errorLines.length >= 10) break;
      continue;
    }

    for (const pattern of errorPatterns) {
      if (pattern.test(line)) {
        errorLines.push(line);
        capturing = true;
        break;
      }
    }
  }

  return errorLines.join('\n').slice(0, 1000);
}

/**
 * Determine if task should use stdin for input
 * @param {string} task - Task content
 * @param {boolean} piped - Whether input is piped
 * @param {boolean} explicit - Whether stdin was explicitly requested
 * @returns {boolean}
 */
export function shouldUseStdin(task, piped = false, explicit = false) {
  if (explicit) return true;
  if (piped) return true;
  if (!task) return false;
  
  // Use stdin for long tasks or tasks with special characters
  if (task.length > 800) return true;
  if (/[\n\\"`'$]/.test(task)) return true;
  
  return false;
}

/**
 * Generate final output from task result
 * @param {object} result - Task result
 * @returns {string} Formatted output
 */
export function generateFinalOutput(result) {
  const lines = [];
  
  if (result.message) {
    lines.push(result.message);
  }
  
  if (result.sessionId) {
    lines.push(`\nSession ID: ${result.sessionId}`);
  }
  
  if (result.coverage) {
    lines.push(`Coverage: ${result.coverage}`);
  }
  
  if (result.filesChanged && result.filesChanged.length > 0) {
    lines.push(`Files changed: ${result.filesChanged.join(', ')}`);
  }
  
  if (result.testsPassed || result.testsFailed) {
    lines.push(`Tests: ${result.testsPassed} passed, ${result.testsFailed} failed`);
  }
  
  if (result.error) {
    lines.push(`\nError: ${result.error}`);
  }
  
  return lines.join('\n');
}

/**
 * Expand home directory in path
 * @param {string} filepath - File path
 * @returns {string} Expanded path
 */
export function expandHome(filepath) {
  if (!filepath) return filepath;
  if (filepath.startsWith('~/') || filepath === '~') {
    return filepath.replace('~', process.env.HOME || '');
  }
  return filepath;
}

/**
 * Check if a string is a valid session ID format
 * @param {string} sessionId - Session ID to validate
 * @returns {boolean}
 */
export function isValidSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return false;
  // Session IDs are typically alphanumeric with some special chars
  return /^[a-zA-Z0-9_\-]+$/.test(sessionId) && sessionId.length > 0;
}
