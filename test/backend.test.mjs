/**
 * Tests for backend module
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { backends, selectBackend, getAvailableBackends } from '../src/backend.mjs';

describe('backends', () => {
  it('should have all expected backends', () => {
    const available = getAvailableBackends();
    assert.ok(available.includes('codex'));
    assert.ok(available.includes('claude'));
    assert.ok(available.includes('gemini'));
    assert.ok(available.includes('opencode'));
  });
});

describe('selectBackend', () => {
  it('should select codex backend', () => {
    const backend = selectBackend('codex');
    assert.strictEqual(backend.name(), 'codex');
    assert.strictEqual(backend.command(), 'codex');
  });

  it('should select claude backend', () => {
    const backend = selectBackend('claude');
    assert.strictEqual(backend.name(), 'claude');
  });

  it('should throw for unknown backend', () => {
    assert.throws(() => {
      selectBackend('unknown');
    }, /Unknown backend/);
  });

  it('should be case insensitive', () => {
    const backend = selectBackend('CODEX');
    assert.strictEqual(backend.name(), 'codex');
  });
});

describe('CodexBackend.buildArgs', () => {
  it('should build basic args', () => {
    const backend = selectBackend('codex');
    const args = backend.buildArgs({ workDir: '/app' }, 'my task');
    assert.ok(args.includes('e'));
    assert.ok(args.includes('-C'));
    assert.ok(args.includes('/app'));
    assert.ok(args.includes('--json'));
    assert.ok(args.includes('my task'));
  });

  it('should include session ID for resume', () => {
    const backend = selectBackend('codex');
    const args = backend.buildArgs({ workDir: '/app', sessionId: 'abc123' }, 'task');
    assert.ok(args.includes('-r'));
    assert.ok(args.includes('abc123'));
  });

  it('should include --full-auto for skip permissions', () => {
    const backend = selectBackend('codex');
    const args = backend.buildArgs({ workDir: '/app', skipPermissions: true }, 'task');
    assert.ok(args.includes('--full-auto'));
  });
});

describe('ClaudeBackend.buildArgs', () => {
  it('should build basic args', () => {
    const backend = selectBackend('claude');
    const args = backend.buildArgs({}, 'my task');
    assert.ok(args.includes('-p'));
    assert.ok(args.includes('--output-format'));
    assert.ok(args.includes('stream-json'));
    assert.ok(args.includes('my task'));
  });

  it('should include --dangerously-skip-permissions', () => {
    const backend = selectBackend('claude');
    const args = backend.buildArgs({ skipPermissions: true }, 'task');
    assert.ok(args.includes('--dangerously-skip-permissions'));
  });

  it('should include model', () => {
    const backend = selectBackend('claude');
    const args = backend.buildArgs({ model: 'claude-3' }, 'task');
    assert.ok(args.includes('--model'));
    assert.ok(args.includes('claude-3'));
  });
});

describe('GeminiBackend.buildArgs', () => {
  it('should build basic args', () => {
    const backend = selectBackend('gemini');
    const args = backend.buildArgs({}, 'my task');
    assert.ok(args.includes('-o'));
    assert.ok(args.includes('stream-json'));
    assert.ok(args.includes('-y'));
  });
});

describe('OpencodeBackend.buildArgs', () => {
  it('should build basic args', () => {
    const backend = selectBackend('opencode');
    const args = backend.buildArgs({}, 'my task');
    assert.ok(args.includes('run'));
    assert.ok(args.includes('--format'));
    assert.ok(args.includes('json'));
  });

  it('should use -s for session ID', () => {
    const backend = selectBackend('opencode');
    const args = backend.buildArgs({ sessionId: 'sess123' }, 'task');
    assert.ok(args.includes('-s'));
    assert.ok(args.includes('sess123'));
  });
});
