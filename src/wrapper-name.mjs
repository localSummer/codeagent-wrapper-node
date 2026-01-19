/**
 * Wrapper name utility
 */

import * as path from 'path';

/**
 * Get the wrapper name from the executable path
 * @returns {string}
 */
export function getWrapperName() {
  // Try to get from process.argv[1]
  const execPath = process.argv[1];
  if (execPath) {
    const basename = path.basename(execPath, path.extname(execPath));
    if (basename && basename !== 'node') {
      return basename.replace(/\.mjs$/, '');
    }
  }
  
  // Default name
  return 'codeagent-wrapper';
}
