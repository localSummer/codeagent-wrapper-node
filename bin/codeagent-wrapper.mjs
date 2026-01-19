#!/usr/bin/env node
/**
 * CLI entry point for codeagent-wrapper
 * Unified wrapper for AI CLI backends (Codex, Claude, Gemini, Opencode)
 */

import { main } from '../src/main.mjs';

main(process.argv.slice(2)).catch((error) => {
  if (error.exitCode !== undefined) {
    process.exitCode = error.exitCode;
  } else {
    console.error('Unexpected error:', error.message);
    process.exitCode = 1;
  }
});
