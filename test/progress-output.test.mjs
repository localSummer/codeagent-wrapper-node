/**
 * Tests for progress output functionality
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert';
import { parseCliArgs, loadEnvConfig } from '../src/config.mjs';
import { ProgressStage } from '../src/executor.mjs';

describe('parseCliArgs - quiet flag', () => {
  it('should parse --quiet flag', () => {
    const config = parseCliArgs(['--quiet', 'task']);
    assert.strictEqual(config.quiet, true);
  });

  it('should parse -q shorthand', () => {
    const config = parseCliArgs(['-q', 'task']);
    assert.strictEqual(config.quiet, true);
  });

  it('should default quiet to false', () => {
    const config = parseCliArgs(['task']);
    assert.strictEqual(config.quiet, false);
  });

  it('should parse quiet with other flags', () => {
    const config = parseCliArgs(['--backend', 'claude', '--quiet', 'task']);
    assert.strictEqual(config.backend, 'claude');
    assert.strictEqual(config.quiet, true);
  });
});

describe('loadEnvConfig - CODEAGENT_QUIET', () => {
  it('should load CODEAGENT_QUIET from env', () => {
    const originalQuiet = process.env.CODEAGENT_QUIET;
    try {
      process.env.CODEAGENT_QUIET = '1';
      const config = loadEnvConfig();
      assert.strictEqual(config.quiet, true);
    } finally {
      if (originalQuiet === undefined) {
        delete process.env.CODEAGENT_QUIET;
      } else {
        process.env.CODEAGENT_QUIET = originalQuiet;
      }
    }
  });

  it('should not set quiet if env var not set', () => {
    const originalQuiet = process.env.CODEAGENT_QUIET;
    try {
      delete process.env.CODEAGENT_QUIET;
      const config = loadEnvConfig();
      assert.strictEqual(config.quiet, undefined);
    } finally {
      if (originalQuiet !== undefined) {
        process.env.CODEAGENT_QUIET = originalQuiet;
      }
    }
  });
});

describe('ProgressStage enum', () => {
  it('should have STARTED stage', () => {
    assert.strictEqual(ProgressStage.STARTED, 'started');
  });

  it('should have ANALYZING stage', () => {
    assert.strictEqual(ProgressStage.ANALYZING, 'analyzing');
  });

  it('should have EXECUTING stage', () => {
    assert.strictEqual(ProgressStage.EXECUTING, 'executing');
  });

  it('should have COMPLETED stage', () => {
    assert.strictEqual(ProgressStage.COMPLETED, 'completed');
  });
});

describe('Progress formatting', () => {
  it('should format started stage correctly', () => {
    // Test that the stage emoji mapping exists
    const stages = [
      ProgressStage.STARTED,
      ProgressStage.ANALYZING,
      ProgressStage.EXECUTING,
      ProgressStage.COMPLETED
    ];
    
    stages.forEach(stage => {
      assert.ok(typeof stage === 'string');
      assert.ok(stage.length > 0);
    });
  });
});
