#!/usr/bin/env -S bun
/**
 * CLI entry point for codeagent-wrapper
 * Unified wrapper for AI CLI backends (Codex, Claude, Gemini, Opencode)
 */

import { main } from '../src/main.mjs';
import { BaseError, formatError } from '../src/errors.mjs';

main(process.argv.slice(2)).catch((error) => {
  // Use formatError for BaseError instances
  if (error instanceof BaseError) {
    const formattedMessage = formatError(error);
    console.error(formattedMessage);
    process.exitCode = error.exitCode || 1;
  } else if (error.exitCode !== undefined) {
    console.error(error.message || 'Task failed');
    process.exitCode = error.exitCode;
  } else {
    console.error('Unexpected error:', error.message || error);
    process.exitCode = 1;
  }
});
