/**
 * Tests for utils module
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  sanitizeOutput,
  extractCoverageFromLines,
  extractFilesChangedFromLines,
  extractTestResultsFromLines,
  shouldUseStdin,
  expandHome
} from '../src/utils.mjs';

describe('sanitizeOutput', () => {
  it('should remove ANSI escape sequences', () => {
    const input = '\x1b[31mred\x1b[0m text';
    const result = sanitizeOutput(input);
    assert.strictEqual(result, 'red text');
  });

  it('should handle empty input', () => {
    assert.strictEqual(sanitizeOutput(''), '');
    assert.strictEqual(sanitizeOutput(null), '');
    assert.strictEqual(sanitizeOutput(undefined), '');
  });
});

describe('extractCoverageFromLines', () => {
  it('should extract coverage percentage', () => {
    const lines = ['Some output', 'Coverage: 85%', 'More output'];
    const result = extractCoverageFromLines(lines);
    assert.strictEqual(result.coverage, '85%');
    assert.strictEqual(result.coverageNum, 85);
  });

  it('should handle decimal coverage', () => {
    const lines = ['coverage: 92.5%'];
    const result = extractCoverageFromLines(lines);
    assert.strictEqual(result.coverageNum, 92.5);
  });

  it('should return empty for no coverage', () => {
    const lines = ['No coverage info here'];
    const result = extractCoverageFromLines(lines);
    assert.strictEqual(result.coverage, '');
    assert.strictEqual(result.coverageNum, 0);
  });
});

describe('extractFilesChangedFromLines', () => {
  it('should extract modified files', () => {
    const lines = ['Modified: src/main.js', 'Created: test/app.test.js'];
    const result = extractFilesChangedFromLines(lines);
    assert.ok(result.includes('src/main.js'));
    assert.ok(result.includes('test/app.test.js'));
  });

  it('should limit to 10 files', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `Modified: file${i}.js`);
    const result = extractFilesChangedFromLines(lines);
    assert.ok(result.length <= 10);
  });
});

describe('extractTestResultsFromLines', () => {
  it('should extract test results', () => {
    const lines = ['Tests: 10 passed, 2 failed'];
    const result = extractTestResultsFromLines(lines);
    assert.strictEqual(result.passed, 10);
    assert.strictEqual(result.failed, 2);
  });
});

describe('shouldUseStdin', () => {
  it('should return true for explicit stdin', () => {
    assert.strictEqual(shouldUseStdin('task', false, true), true);
  });

  it('should return true for long tasks', () => {
    const longTask = 'a'.repeat(900);
    assert.strictEqual(shouldUseStdin(longTask), true);
  });

  it('should return true for tasks with special characters', () => {
    assert.strictEqual(shouldUseStdin('task with\nnewline'), true);
    assert.strictEqual(shouldUseStdin('task with "quotes"'), true);
  });

  it('should return false for simple tasks', () => {
    assert.strictEqual(shouldUseStdin('simple task'), false);
  });
});

describe('expandHome', () => {
  it('should expand ~ to home directory', () => {
    const result = expandHome('~/test');
    assert.ok(!result.startsWith('~'));
    assert.ok(result.endsWith('/test'));
  });

  it('should not modify absolute paths', () => {
    const result = expandHome('/absolute/path');
    assert.strictEqual(result, '/absolute/path');
  });
});
