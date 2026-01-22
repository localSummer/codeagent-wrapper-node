/**
 * Configuration validation tests
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { parseCliArgs, validateConfig, loadEnvConfig, parseParallelConfig } from '../src/config.mjs';

describe('config.mjs', () => {
  describe('parseCliArgs', () => {
    test('should parse basic task', () => {
      const config = parseCliArgs(['Fix the bug']);
      assert.strictEqual(config.task, 'Fix the bug');
      assert.strictEqual(config.mode, 'new');
    });

    test('should parse task with workdir', () => {
      const config = parseCliArgs(['Fix the bug', '/tmp']);
      assert.strictEqual(config.task, 'Fix the bug');
      assert.strictEqual(config.workDir, '/tmp');
    });

    test('should parse backend option', () => {
      const config = parseCliArgs(['--backend', 'claude', 'Fix the bug']);
      assert.strictEqual(config.backend, 'claude');
    });

    test('should parse model option', () => {
      const config = parseCliArgs(['--model', 'sonnet', 'Fix the bug']);
      assert.strictEqual(config.model, 'sonnet');
    });

    test('should parse agent option', () => {
      const config = parseCliArgs(['--agent', 'oracle', 'Fix the bug']);
      assert.strictEqual(config.agent, 'oracle');
    });

    test('should parse timeout option', () => {
      const config = parseCliArgs(['--timeout', '300', 'Fix the bug']);
      assert.strictEqual(config.timeout, 300);
    });

    test('should parse skip-permissions flag', () => {
      const config = parseCliArgs(['--skip-permissions', 'Fix the bug']);
      assert.strictEqual(config.skipPermissions, true);
    });

    test('should parse yolo flag as skip-permissions', () => {
      const config = parseCliArgs(['--yolo', 'Fix the bug']);
      assert.strictEqual(config.skipPermissions, true);
      assert.strictEqual(config.yolo, true);
    });

    test('should parse quiet flag', () => {
      const config = parseCliArgs(['--quiet', 'Fix the bug']);
      assert.strictEqual(config.quiet, true);
    });

    test('should parse -q flag', () => {
      const config = parseCliArgs(['-q', 'Fix the bug']);
      assert.strictEqual(config.quiet, true);
    });

    test('should parse backend-output flag', () => {
      const config = parseCliArgs(['--backend-output', 'Fix the bug']);
      assert.strictEqual(config.backendOutput, true);
    });

    test('should parse parallel flag', () => {
      const config = parseCliArgs(['--parallel']);
      assert.strictEqual(config.parallel, true);
    });

    test('should parse full-output flag', () => {
      const config = parseCliArgs(['--full-output']);
      assert.strictEqual(config.fullOutput, true);
    });

    test('should parse resume mode', () => {
      const config = parseCliArgs(['resume', 'abc123', 'Continue task']);
      assert.strictEqual(config.mode, 'resume');
      assert.strictEqual(config.sessionId, 'abc123');
      assert.strictEqual(config.task, 'Continue task');
    });

    test('should parse prompt-file option', () => {
      const config = parseCliArgs(['--prompt-file', 'prompt.txt', 'Fix the bug']);
      assert.strictEqual(config.promptFile, 'prompt.txt');
    });

    test('should handle unknown options gracefully', () => {
      // Unknown options followed by a value are treated as flag+arg, remaining arg is task
      const config = parseCliArgs(['--unknown', 'Fix the bug']);
      // --unknown is treated as a flag, "Fix the bug" is the task
      assert.strictEqual(config.task, 'Fix the bug');
    });
  });

  describe('validateConfig', () => {
    test('should accept valid new mode config', async () => {
      const config = parseCliArgs(['Fix the bug']);
      assert.strictEqual(config.task, 'Fix the bug');
      config.workDir = process.cwd(); // Set workDir to avoid validation error
      await validateConfig(config); // Should not throw
    });

    test('should accept valid resume mode config', async () => {
      const config = parseCliArgs(['resume', 'abc123', 'Continue task']);
      assert.strictEqual(config.mode, 'resume');
      config.workDir = process.cwd(); // Set workDir to avoid validation error
      await validateConfig(config); // Should not throw
    });

    test('should reject new mode without task', async () => {
      const config = parseCliArgs([]);
      config.workDir = process.cwd();
      assert.strictEqual(config.task, '');
      await assert.rejects(async () => {
        await validateConfig(config);
      }, /No task provided/);
    });

    test('should reject resume without session ID', async () => {
      const config = parseCliArgs(['resume', '', 'Continue task']);
      config.workDir = process.cwd();
      await assert.rejects(async () => {
        await validateConfig(config);
      }, /Resume mode requires a session ID/);
    });

    test('should reject invalid session ID format', async () => {
      const config = parseCliArgs(['resume', 'invalid!@#', 'Continue task']);
      config.workDir = process.cwd();
      await assert.rejects(async () => {
        await validateConfig(config);
      }, /Invalid session ID format/);
    });

    test('should reject workdir equal to "-"', async () => {
      const config = parseCliArgs(['Fix the bug']);
      config.workDir = '-';
      await assert.rejects(async () => {
        await validateConfig(config);
      }, /Working directory cannot be/);
    });

    test('should reject invalid agent name', async () => {
      const config = parseCliArgs(['--agent', 'invalid agent!', 'Fix the bug']);
      config.workDir = process.cwd();
      await assert.rejects(async () => {
        await validateConfig(config);
      }, /Invalid agent name format/);
    });

    test('should reject negative timeout', async () => {
      const config = parseCliArgs(['--timeout', '-10', 'Fix the bug']);
      config.workDir = process.cwd();
      await assert.rejects(async () => {
        await validateConfig(config);
      }, /Timeout must be positive/);
    });

    test('should reject zero timeout', async () => {
      const config = parseCliArgs(['--timeout', '0', 'Fix the bug']);
      config.workDir = process.cwd();
      await assert.rejects(async () => {
        await validateConfig(config);
      }, /Timeout must be positive/);
    });

    test('should accept excessive timeout', async () => {
      const config = parseCliArgs(['--timeout', '100000', 'Fix the bug']);
      config.workDir = process.cwd();
      // Should not throw (only warns)
      await validateConfig(config);
    });

    test('should reject invalid backend', async () => {
      const config = parseCliArgs(['--backend', 'invalid', 'Fix the bug']);
      config.workDir = process.cwd();
      await assert.rejects(async () => {
        await validateConfig(config);
      }, /Invalid backend/);
    });

    test('should accept valid backends', async () => {
      const backends = ['codex', 'claude', 'gemini', 'opencode', ''];
      for (const backend of backends) {
        const config = backend
          ? parseCliArgs(['--backend', backend, 'Fix the bug'])
          : parseCliArgs(['Fix the bug']);
        config.workDir = process.cwd();
        await validateConfig(config); // Should not throw
      }
    });

    test('should reject negative maxParallelWorkers', async () => {
      const config = parseCliArgs(['Fix the bug']);
      config.workDir = process.cwd();
      config.maxParallelWorkers = -1;
      await assert.rejects(async () => {
        await validateConfig(config);
      }, /maxParallelWorkers cannot be negative/);
    });
  });

  describe('loadEnvConfig', () => {
    test('should load timeout from environment', () => {
      process.env.CODEX_TIMEOUT = '300';
      const config = loadEnvConfig();
      assert.strictEqual(config.timeout, 300);
      delete process.env.CODEX_TIMEOUT;
    });

    test('should convert milliseconds to seconds', () => {
      process.env.CODEX_TIMEOUT = '300000';
      const config = loadEnvConfig();
      assert.strictEqual(config.timeout, 300);
      delete process.env.CODEX_TIMEOUT;
    });

    test('should load skip-permissions from environment', () => {
      process.env.CODEAGENT_SKIP_PERMISSIONS = 'true';
      const config = loadEnvConfig();
      assert.strictEqual(config.skipPermissions, true);
      delete process.env.CODEAGENT_SKIP_PERMISSIONS;
    });

    test('should load max-parallel-workers from environment', () => {
      process.env.CODEAGENT_MAX_PARALLEL_WORKERS = '10';
      const config = loadEnvConfig();
      assert.strictEqual(config.maxParallelWorkers, 10);
      delete process.env.CODEAGENT_MAX_PARALLEL_WORKERS;
    });

    test('should load quiet from environment', () => {
      process.env.CODEAGENT_QUIET = 'true';
      const config = loadEnvConfig();
      assert.strictEqual(config.quiet, true);
      delete process.env.CODEAGENT_QUIET;
    });
  });

  describe('parseParallelConfig', () => {
    test('should parse parallel config format', () => {
      const input = `---TASK---
id: task1
workdir: /tmp
---CONTENT---
Task 1 content
---TASK---
id: task2
---CONTENT---
Task 2 content`;

      const config = parseParallelConfig(input);
      assert.strictEqual(config.tasks.length, 2);
      assert.strictEqual(config.tasks[0].id, 'task1');
      assert.strictEqual(config.tasks[1].id, 'task2');
    });

    test('should handle empty input', () => {
      const config = parseParallelConfig('');
      assert.strictEqual(config.tasks.length, 0);
    });

    test('should handle malformed input gracefully', () => {
      const config = parseParallelConfig('---TASK---');
      assert.strictEqual(config.tasks.length, 0);
    });
  });
});

describe('Config edge cases', () => {
  test('should handle explicit stdin flag', () => {
    const config = parseCliArgs(['-']);
    assert.strictEqual(config.explicitStdin, true);
  });

  test('should handle task equal to "-"', () => {
    // '-' is explicitly handled as stdin flag, not as task
    const config = parseCliArgs(['-']);
    assert.strictEqual(config.explicitStdin, true);
  });

  test('should preserve original defaults', () => {
    const config = parseCliArgs([]);
    assert.strictEqual(config.timeout, 7200);
    assert.strictEqual(config.quiet, false);
    assert.strictEqual(config.backendOutput, false);
  });
});
