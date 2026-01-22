/**
 * Tests for configuration validation
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { validateConfig, validateConfigSync, validateParallelConfig } from '../src/config.mjs';
import {
  InvalidParameterError,
  MissingParameterError,
  SessionValidationError,
  TaskValidationError,
  FileNotFoundError
} from '../src/errors.mjs';

describe('Configuration Validation', () => {
  describe('Parameter Range Validation', () => {
    it('should reject timeout <= 0', async () => {
      const config = { timeout: -1, maxParallelWorkers: 10, mode: 'new', task: 'test' };
      await assert.rejects(
        () => validateConfig(config),
        (err) => {
          assert.ok(err instanceof InvalidParameterError);
          assert.ok(err.message.includes('timeout'));
          assert.strictEqual(err.context.value, -1);
          return true;
        }
      );
    });

    it('should reject timeout > 86400', async () => {
      const config = { timeout: 100000, maxParallelWorkers: 10, mode: 'new', task: 'test' };
      await assert.rejects(
        () => validateConfig(config),
        (err) => {
          assert.ok(err instanceof InvalidParameterError);
          assert.ok(err.message.includes('timeout'));
          return true;
        }
      );
    });

    it('should accept valid timeout', async () => {
      const config = { timeout: 3600, maxParallelWorkers: 10, mode: 'new', task: 'test' };
      await assert.doesNotReject(() => validateConfig(config));
    });

    it('should reject maxParallelWorkers < 0', async () => {
      const config = { timeout: 3600, maxParallelWorkers: -5, mode: 'new', task: 'test' };
      await assert.rejects(
        () => validateConfig(config),
        (err) => {
          assert.ok(err instanceof InvalidParameterError);
          assert.ok(err.message.includes('maxParallelWorkers'));
          return true;
        }
      );
    });

    it('should reject maxParallelWorkers > 1000', async () => {
      const config = { timeout: 3600, maxParallelWorkers: 5000, mode: 'new', task: 'test' };
      await assert.rejects(
        () => validateConfig(config),
        (err) => {
          assert.ok(err instanceof InvalidParameterError);
          assert.ok(err.message.includes('maxParallelWorkers'));
          return true;
        }
      );
    });
  });

  describe('Required Parameters', () => {
    it('should reject empty task in new mode', async () => {
      const config = { timeout: 3600, maxParallelWorkers: 10, mode: 'new', task: '' };
      await assert.rejects(
        () => validateConfig(config),
        (err) => {
          assert.ok(err instanceof MissingParameterError);
          assert.ok(err.message.includes('task'));
          return true;
        }
      );
    });

    it('should accept explicit stdin mode without task', async () => {
      const config = { timeout: 3600, maxParallelWorkers: 10, mode: 'new', task: '', explicitStdin: true };
      await assert.doesNotReject(() => validateConfig(config));
    });

    it('should reject resume mode without session ID', async () => {
      const config = { timeout: 3600, maxParallelWorkers: 10, mode: 'resume', task: 'test', sessionId: '' };
      await assert.rejects(
        () => validateConfig(config),
        (err) => {
          assert.ok(err instanceof MissingParameterError);
          assert.ok(err.message.includes('sessionId'));
          return true;
        }
      );
    });

    it('should reject invalid session ID format', async () => {
      const config = { timeout: 3600, maxParallelWorkers: 10, mode: 'resume', task: 'test', sessionId: 'invalid id!' };
      await assert.rejects(
        () => validateConfig(config),
        (err) => {
          assert.ok(err instanceof SessionValidationError);
          return true;
        }
      );
    });
  });

  describe('Agent Name Validation', () => {
    it('should reject agent name with special characters', async () => {
      const config = { timeout: 3600, maxParallelWorkers: 10, mode: 'new', task: 'test', agent: 'invalid@agent' };
      await assert.rejects(
        () => validateConfig(config),
        (err) => {
          assert.ok(err instanceof InvalidParameterError);
          assert.ok(err.message.includes('agent'));
          return true;
        }
      );
    });

    it('should accept valid agent name', async () => {
      const config = { timeout: 3600, maxParallelWorkers: 10, mode: 'new', task: 'test', agent: 'oracle-dev_2' };
      await assert.doesNotReject(() => validateConfig(config));
    });
  });

  describe('File Path Validation', () => {
    it('should reject non-existent promptFile', async () => {
      const config = {
        timeout: 3600,
        maxParallelWorkers: 10,
        mode: 'new',
        task: 'test',
        promptFile: '/nonexistent/file.txt'
      };
      await assert.rejects(
        () => validateConfig(config),
        (err) => {
          assert.ok(err instanceof FileNotFoundError);
          assert.ok(err.message.includes('/nonexistent/file.txt'));
          return true;
        }
      );
    });

    it('should accept missing promptFile when not provided', async () => {
      const config = { timeout: 3600, maxParallelWorkers: 10, mode: 'new', task: 'test' };
      await assert.doesNotReject(() => validateConfig(config));
    });
  });

  describe('Parallel Config Validation', () => {
    it('should reject empty task list', () => {
      assert.throws(
        () => validateParallelConfig([]),
        (err) => {
          assert.ok(err instanceof TaskValidationError);
          assert.ok(err.message.includes('No tasks'));
          return true;
        }
      );
    });

    it('should reject duplicate task IDs', () => {
      const tasks = [
        { id: 'task-1', task: 'Task 1', workDir: '', dependencies: [], sessionId: '', backend: '', model: '', agent: '', promptFile: '', skipPermissions: false },
        { id: 'task-1', task: 'Task 2', workDir: '', dependencies: [], sessionId: '', backend: '', model: '', agent: '', promptFile: '', skipPermissions: false }
      ];
      assert.throws(
        () => validateParallelConfig(tasks),
        (err) => {
          assert.ok(err instanceof TaskValidationError);
          assert.ok(err.message.includes('Duplicate'));
          assert.strictEqual(err.context.duplicateId, 'task-1');
          return true;
        }
      );
    });

    it('should reject non-existent dependency', () => {
      const tasks = [
        { id: 'task-1', task: 'Task 1', workDir: '', dependencies: ['task-missing'], sessionId: '', backend: '', model: '', agent: '', promptFile: '', skipPermissions: false }
      ];
      assert.throws(
        () => validateParallelConfig(tasks),
        (err) => {
          assert.ok(err instanceof TaskValidationError);
          assert.ok(err.message.includes('Dependency not found'));
          assert.ok(err.message.includes('task-missing'));
          return true;
        }
      );
    });

    it('should detect circular dependencies', () => {
      const tasks = [
        { id: 'task-a', task: 'Task A', workDir: '', dependencies: ['task-b'], sessionId: '', backend: '', model: '', agent: '', promptFile: '', skipPermissions: false },
        { id: 'task-b', task: 'Task B', workDir: '', dependencies: ['task-a'], sessionId: '', backend: '', model: '', agent: '', promptFile: '', skipPermissions: false }
      ];
      assert.throws(
        () => validateParallelConfig(tasks),
        (err) => {
          assert.ok(err instanceof TaskValidationError);
          assert.ok(err.message.includes('Circular dependency'));
          return true;
        }
      );
    });

    it('should accept valid parallel config', () => {
      const tasks = [
        { id: 'task-1', task: 'Task 1', workDir: '', dependencies: [], sessionId: '', backend: '', model: '', agent: '', promptFile: '', skipPermissions: false },
        { id: 'task-2', task: 'Task 2', workDir: '', dependencies: ['task-1'], sessionId: '', backend: '', model: '', agent: '', promptFile: '', skipPermissions: false }
      ];
      assert.doesNotThrow(() => validateParallelConfig(tasks));
    });
  });

  describe('Synchronous Validation (Legacy)', () => {
    it('should validate basic config synchronously', () => {
      const config = { timeout: 3600, mode: 'new', task: 'test', agent: '', workDir: '', sessionId: '' };
      assert.doesNotThrow(() => validateConfigSync(config));
    });

    it('should throw for invalid timeout', () => {
      const config = { timeout: -1, mode: 'new', task: 'test', agent: '', workDir: '', sessionId: '' };
      assert.throws(
        () => validateConfigSync(config),
        (err) => {
          assert.ok(err instanceof InvalidParameterError);
          return true;
        }
      );
    });
  });
});
