/**
 * Tests for config module
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseCliArgs, parseParallelConfig, parseParallelConfigStream, validateConfigSync, loadEnvConfig } from '../src/config.mjs';
import { Readable } from 'node:stream';

describe('parseCliArgs', () => {
  it('should parse basic task', () => {
    const config = parseCliArgs(['my task']);
    assert.strictEqual(config.task, 'my task');
    assert.strictEqual(config.mode, 'new');
  });

  it('should parse task with workdir', () => {
    const config = parseCliArgs(['my task', '/path/to/dir']);
    assert.strictEqual(config.task, 'my task');
    assert.ok(config.workDir.endsWith('path/to/dir'));
  });

  it('should parse resume mode', () => {
    const config = parseCliArgs(['resume', 'session123', 'follow-up task']);
    assert.strictEqual(config.mode, 'resume');
    assert.strictEqual(config.sessionId, 'session123');
    assert.strictEqual(config.task, 'follow-up task');
  });

  it('should parse --backend flag', () => {
    const config = parseCliArgs(['--backend', 'claude', 'task']);
    assert.strictEqual(config.backend, 'claude');
    assert.strictEqual(config.task, 'task');
  });

  it('should parse --model flag', () => {
    const config = parseCliArgs(['--model', 'gpt-4', 'task']);
    assert.strictEqual(config.model, 'gpt-4');
  });

  it('should parse --agent flag', () => {
    const config = parseCliArgs(['--agent', 'oracle', 'task']);
    assert.strictEqual(config.agent, 'oracle');
  });

  it('should parse --skip-permissions flag', () => {
    const config = parseCliArgs(['--skip-permissions', 'task']);
    assert.strictEqual(config.skipPermissions, true);
  });

  it('should parse --parallel flag', () => {
    const config = parseCliArgs(['--parallel']);
    assert.strictEqual(config.parallel, true);
  });

  it('should parse --timeout flag', () => {
    const config = parseCliArgs(['--timeout', '300', 'task']);
    assert.strictEqual(config.timeout, 300);
  });

  it('should parse - for stdin', () => {
    const config = parseCliArgs(['-', '/path']);
    assert.strictEqual(config.explicitStdin, true);
  });
});

describe('parseParallelConfig', () => {
  it('should parse parallel task format', () => {
    const input = `
---TASK---
id: build
workdir: /app
backend: codex
---CONTENT---
Build the project
---TASK---
id: test
dependencies: build
---CONTENT---
Run tests
`;
    const config = parseParallelConfig(input);
    assert.strictEqual(config.tasks.length, 2);
    assert.strictEqual(config.tasks[0].id, 'build');
    assert.strictEqual(config.tasks[0].backend, 'codex');
    assert.strictEqual(config.tasks[1].id, 'test');
    assert.deepStrictEqual(config.tasks[1].dependencies, ['build']);
  });
});

describe('parseParallelConfigStream', () => {
  it('should parse parallel task format from stream', async () => {
    const input = `
---TASK---
id: build
workdir: /app
backend: codex
---CONTENT---
Build the project
---TASK---
id: test
dependencies: build
---CONTENT---
Run tests
`;
    const stream = Readable.from([input]);
    const config = await parseParallelConfigStream(stream);
    assert.strictEqual(config.tasks.length, 2);
    assert.strictEqual(config.tasks[0].id, 'build');
    assert.strictEqual(config.tasks[0].backend, 'codex');
    assert.strictEqual(config.tasks[1].id, 'test');
    assert.deepStrictEqual(config.tasks[1].dependencies, ['build']);
  });
});

describe('validateConfig', () => {
  it('should throw for resume without session ID', () => {
    assert.throws(() => {
      validateConfigSync({ mode: 'resume', sessionId: '', timeout: 3600 });
    }, /sessionId/i);
  });

  it('should throw for invalid agent name', () => {
    assert.throws(() => {
      validateConfigSync({ mode: 'new', task: 'test', agent: 'invalid@name', timeout: 3600 });
    }, /agent/i);
  });

  it('should accept valid config', () => {
    assert.doesNotThrow(() => {
      validateConfigSync({ mode: 'new', task: 'test', timeout: 3600, agent: '', workDir: '', sessionId: '' });
    });
  });
});

describe('parseCliArgs - quiet flag', () => {
  it('should parse --quiet flag', () => {
    const config = parseCliArgs(['--quiet', 'my task']);
    assert.strictEqual(config.quiet, true);
  });

  it('should default quiet to false', () => {
    const config = parseCliArgs(['my task']);
    assert.strictEqual(config.quiet, false);
  });

  it('should handle --quiet with other flags', () => {
    const config = parseCliArgs(['--backend', 'claude', '--quiet', 'my task']);
    assert.strictEqual(config.quiet, true);
    assert.strictEqual(config.backend, 'claude');
  });
});

describe('loadEnvConfig - quiet mode', () => {
  it('should parse CODEAGENT_QUIET=1', () => {
    const originalValue = process.env.CODEAGENT_QUIET;
    process.env.CODEAGENT_QUIET = '1';

    const config = loadEnvConfig();
    assert.strictEqual(config.quiet, true);

    // Restore
    if (originalValue === undefined) {
      delete process.env.CODEAGENT_QUIET;
    } else {
      process.env.CODEAGENT_QUIET = originalValue;
    }
  });

  it('should not set quiet when CODEAGENT_QUIET is not set', () => {
    const originalValue = process.env.CODEAGENT_QUIET;
    delete process.env.CODEAGENT_QUIET;

    const config = loadEnvConfig();
    assert.strictEqual(config.quiet, undefined);

    // Restore
    if (originalValue !== undefined) {
      process.env.CODEAGENT_QUIET = originalValue;
    }
  });

  it('should not set quiet when CODEAGENT_QUIET is not "1"', () => {
    const originalValue = process.env.CODEAGENT_QUIET;
    process.env.CODEAGENT_QUIET = '0';

    const config = loadEnvConfig();
    assert.strictEqual(config.quiet, undefined);

    // Restore
    if (originalValue === undefined) {
      delete process.env.CODEAGENT_QUIET;
    } else {
      process.env.CODEAGENT_QUIET = originalValue;
    }
  });
});
