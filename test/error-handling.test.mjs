/**
 * Error handling tests
 */

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import {
  formatError,
  createError,
  createBackendNotFoundError,
  createTimeoutError,
  safeFormatError,
  getErrorCategory,
  getErrorSuggestions,
  ErrorCategory,
  ErrorCode
} from '../src/errors.mjs';

describe('errors.mjs', () => {
  describe('ErrorCategory', () => {
    test('should export error categories', () => {
      assert.ok(ErrorCategory.CONFIGURATION);
      assert.ok(ErrorCategory.BACKEND);
      assert.ok(ErrorCategory.PERMISSION);
      assert.ok(ErrorCategory.FILE_SYSTEM);
      assert.ok(ErrorCategory.TIMEOUT);
      assert.ok(ErrorCategory.NETWORK);
      assert.ok(ErrorCategory.UNKNOWN);
    });
  });

  describe('ErrorCode', () => {
    test('should export error codes', () => {
      assert.ok(ErrorCode.CONFIG_MISSING_TASK);
      assert.ok(ErrorCode.BACKEND_NOT_FOUND);
      assert.ok(ErrorCode.TASK_TIMEOUT);
    });
  });

  describe('formatError', () => {
    test('should format error message', () => {
      const error = new Error('Test error message');
      const formatted = formatError(error, { colorize: false });
      assert.ok(formatted.includes('Test error message'));
    });

    test('should show exit code if available', () => {
      const error = new Error('Test error');
      error.exitCode = 127;
      const formatted = formatError(error, { colorize: false });
      assert.ok(formatted.includes('Exit code: 127'));
    });

    test('should show category', () => {
      const error = new Error('Test error');
      error.category = ErrorCategory.BACKEND;
      const formatted = formatError(error, { colorize: false });
      assert.ok(formatted.includes('Category: backend'));
    });

    test('should show suggestions by default', () => {
      const error = new Error('Command not found');
      const formatted = formatError(error, { colorize: false });
      assert.ok(formatted.includes('Suggestions:'));
    });

    test('should hide stack trace by default', () => {
      const error = new Error('Test error');
      error.stack = 'Stack trace here';
      const formatted = formatError(error, { colorize: false });
      assert.ok(!formatted.includes('Stack trace'));
    });

    test('should show stack trace when enabled', () => {
      const error = new Error('Test error');
      error.stack = 'Stack trace here';
      const formatted = formatError(error, { colorize: false, showStack: true });
      assert.ok(formatted.includes('Stack trace'));
    });

    test('should handle string error', () => {
      const formatted = formatError('String error message', { colorize: false });
      assert.ok(formatted.includes('String error message'));
    });
  });

  describe('createError', () => {
    test('should create error with exit code and category', () => {
      const error = createError('Test error', 1, ErrorCategory.BACKEND);
      assert.strictEqual(error.message, 'Test error');
      assert.strictEqual(error.exitCode, 1);
      assert.strictEqual(error.category, ErrorCategory.BACKEND);
    });
  });

  describe('createBackendNotFoundError', () => {
    test('should create backend not found error', () => {
      const error = createBackendNotFoundError('claude');
      assert.ok(error.message.includes('claude'));
      assert.strictEqual(error.exitCode, 127);
      assert.strictEqual(error.category, ErrorCategory.BACKEND);
      assert.ok(error.suggestions);
    });
  });

  describe('createTimeoutError', () => {
    test('should create timeout error', () => {
      const error = createTimeoutError(60);
      assert.ok(error.message.includes('60'));
      assert.strictEqual(error.exitCode, 124);
      assert.strictEqual(error.category, ErrorCategory.TIMEOUT);
      assert.ok(error.suggestions);
    });
  });

  describe('safeFormatError', () => {
    test('should handle errors without throwing', () => {
      const result = safeFormatError('Simple error');
      assert.ok(result.includes('Simple error'));
    });

    test('should handle invalid error objects', () => {
      const result = safeFormatError(null);
      assert.ok(result.includes('Error'));
    });
  });

  describe('getErrorCategory', () => {
    test('should detect permission errors', () => {
      const category = getErrorCategory('Permission denied');
      assert.strictEqual(category, ErrorCategory.PERMISSION);
    });

    test('should detect file system errors', () => {
      const category = getErrorCategory('ENOENT: no such file');
      assert.strictEqual(category, ErrorCategory.FILE_SYSTEM);
    });

    test('should detect timeout errors', () => {
      const category = getErrorCategory('ETIMEDOUT: connection timed out');
      assert.strictEqual(category, ErrorCategory.TIMEOUT);
    });

    test('should detect backend errors', () => {
      const category = getErrorCategory('Command not found');
      assert.strictEqual(category, ErrorCategory.BACKEND);
    });

    test('should return UNKNOWN for unrecognized errors', () => {
      const category = getErrorCategory('Some random error');
      assert.strictEqual(category, ErrorCategory.UNKNOWN);
    });
  });

  describe('getErrorSuggestions', () => {
    test('should return suggestions for file not found', () => {
      const suggestions = getErrorSuggestions('ENOENT: no such file');
      assert.ok(suggestions.suggestions.length > 0);
      assert.ok(suggestions.message);
    });

    test('should return suggestions for permission denied', () => {
      const suggestions = getErrorSuggestions('EACCES: permission denied');
      assert.ok(suggestions.suggestions.length > 0);
    });

    test('should return suggestions for command not found (code 127)', () => {
      const suggestions = getErrorSuggestions('127');
      assert.ok(suggestions.suggestions.some(s => s.toLowerCase().includes('backend')));
    });

    test('should return default suggestions for unknown errors', () => {
      const suggestions = getErrorSuggestions('Unknown error xyz');
      assert.ok(suggestions.suggestions.length > 0);
    });
  });
});

describe('Error edge cases', () => {
  test('should handle empty error message', () => {
    const error = new Error('');
    const formatted = formatError(error, { colorize: false });
    assert.ok(formatted.includes('Error'));
  });

  test('should handle error with complex exit code', () => {
    const error = new Error('Complex error');
    error.exitCode = 2;
    error.category = ErrorCategory.CONFIGURATION;
    const formatted = formatError(error, { colorize: false });
    assert.ok(formatted.includes('Exit code: 2'));
    assert.ok(formatted.includes('configuration'));
  });
});
