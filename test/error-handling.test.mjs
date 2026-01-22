/**
 * Tests for error handling module
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  BaseError,
  ConfigurationError,
  InvalidParameterError,
  MissingParameterError,
  InvalidFilePathError,
  BackendError,
  BackendNotFoundError,
  BackendExecutionError,
  BackendTimeoutError,
  ValidationError,
  SessionValidationError,
  TaskValidationError,
  FileSystemError,
  FileNotFoundError,
  PermissionDeniedError,
  TimeoutError,
  formatError
} from '../src/errors.mjs';

describe('Error Handling', () => {
  describe('BaseError', () => {
    it('should create error with all properties', () => {
      const error = new BaseError(
        'Test message',
        'ERR_TEST',
        'test',
        'Test suggestion',
        { key: 'value' }
      );
      
      assert.strictEqual(error.message, 'Test message');
      assert.strictEqual(error.code, 'ERR_TEST');
      assert.strictEqual(error.category, 'test');
      assert.strictEqual(error.suggestion, 'Test suggestion');
      assert.deepStrictEqual(error.context, { key: 'value' });
      assert.ok(error instanceof Error);
    });
  });

  describe('Configuration Errors', () => {
    it('InvalidParameterError should have correct properties', () => {
      const error = new InvalidParameterError('timeout', -100, 'must be positive');
      
      assert.ok(error.message.includes('timeout'));
      assert.ok(error.message.includes('must be positive'));
      assert.strictEqual(error.code, 'ERR_CONFIG_INVALID_PARAMETER');
      assert.strictEqual(error.category, 'configuration');
      assert.strictEqual(error.context.parameter, 'timeout');
      assert.strictEqual(error.context.value, -100);
      assert.ok(error instanceof ConfigurationError);
    });

    it('MissingParameterError should have correct properties', () => {
      const error = new MissingParameterError('task', 'cannot be empty');
      
      assert.ok(error.message.includes('task'));
      assert.strictEqual(error.code, 'ERR_CONFIG_MISSING_PARAMETER');
      assert.strictEqual(error.category, 'configuration');
      assert.strictEqual(error.context.parameter, 'task');
    });

    it('InvalidFilePathError should have correct properties', () => {
      const error = new InvalidFilePathError('/path/to/file', 'directory', 'file');
      
      assert.ok(error.message.includes('/path/to/file'));
      assert.strictEqual(error.code, 'ERR_CONFIG_INVALID_PATH');
      assert.strictEqual(error.context.expectedType, 'directory');
      assert.strictEqual(error.context.actualType, 'file');
    });
  });

  describe('Backend Errors', () => {
    it('BackendNotFoundError should suggest installation', () => {
      const error = new BackendNotFoundError('claude');
      
      assert.ok(error.message.includes('claude'));
      assert.strictEqual(error.code, 'ERR_BACKEND_NOT_FOUND');
      assert.strictEqual(error.category, 'backend');
      assert.ok(error.suggestion.includes('npm install'));
      assert.ok(error.suggestion.includes('@anthropic-ai/claude-code'));
      assert.strictEqual(error.context.backend, 'claude');
    });

    it('BackendExecutionError should include exit code', () => {
      const error = new BackendExecutionError('codex', 2, 'stderr output');
      
      assert.ok(error.message.includes('codex'));
      assert.ok(error.message.includes('2'));
      assert.strictEqual(error.code, 'ERR_BACKEND_EXECUTION');
      assert.strictEqual(error.context.exitCode, 2);
      assert.strictEqual(error.context.stderr, 'stderr output');
    });

    it('BackendTimeoutError should suggest increasing timeout', () => {
      const error = new BackendTimeoutError('gemini', 3600);
      
      assert.ok(error.message.includes('gemini'));
      assert.ok(error.message.includes('3600'));
      assert.strictEqual(error.code, 'ERR_BACKEND_TIMEOUT');
      assert.ok(error.suggestion.includes('timeout'));
    });
  });

  describe('Validation Errors', () => {
    it('SessionValidationError should suggest session management', () => {
      const error = new SessionValidationError('abc123', 'not found');
      
      assert.ok(error.message.includes('abc123'));
      assert.ok(error.message.includes('not found'));
      assert.strictEqual(error.code, 'ERR_VALIDATION_SESSION_INVALID');
      assert.ok(error.suggestion.includes('sessions'));
    });

    it('TaskValidationError should include reason', () => {
      const error = new TaskValidationError('circular dependency', { taskId: 'task-1' });
      
      assert.ok(error.message.includes('circular dependency'));
      assert.strictEqual(error.code, 'ERR_VALIDATION_TASK_INVALID');
      assert.strictEqual(error.context.taskId, 'task-1');
    });
  });

  describe('Filesystem Errors', () => {
    it('FileNotFoundError should include path', () => {
      const error = new FileNotFoundError('/path/to/missing.txt');
      
      assert.ok(error.message.includes('/path/to/missing.txt'));
      assert.strictEqual(error.code, 'ERR_FS_FILE_NOT_FOUND');
      assert.strictEqual(error.category, 'filesystem');
      assert.strictEqual(error.context.path, '/path/to/missing.txt');
    });

    it('PermissionDeniedError should include operation', () => {
      const error = new PermissionDeniedError('/etc/secrets', 'read');
      
      assert.ok(error.message.includes('/etc/secrets'));
      assert.ok(error.message.includes('read'));
      assert.strictEqual(error.code, 'ERR_FS_PERMISSION_DENIED');
      assert.strictEqual(error.context.operation, 'read');
    });
  });

  describe('TimeoutError', () => {
    it('should have correct properties', () => {
      const error = new TimeoutError(7200);
      
      assert.ok(error.message.includes('7200'));
      assert.strictEqual(error.code, 'ERR_EXECUTION_TIMEOUT');
      assert.strictEqual(error.context.timeout, 7200);
      assert.ok(error.suggestion.includes('--timeout'));
    });
  });

  describe('Error Codes Uniqueness', () => {
    it('should have unique error codes', () => {
      const errors = [
        new InvalidParameterError('test', 1, 'test'),
        new MissingParameterError('test'),
        new InvalidFilePathError('test', 'dir', 'file'),
        new BackendNotFoundError('test'),
        new BackendExecutionError('test', 1),
        new BackendTimeoutError('test', 100),
        new SessionValidationError('test', 'reason'),
        new TaskValidationError('reason'),
        new FileNotFoundError('test'),
        new PermissionDeniedError('test'),
        new TimeoutError(100)
      ];

      const codes = errors.map(e => e.code);
      const uniqueCodes = new Set(codes);
      
      assert.strictEqual(codes.length, uniqueCodes.size, 'All error codes should be unique');
    });
  });

  describe('formatError', () => {
    it('should format BaseError with Unicode symbols', () => {
      const error = new BackendNotFoundError('claude');
      const formatted = formatError(error);
      
      assert.ok(formatted.includes('Error:'));
      assert.ok(formatted.includes('claude'));
      assert.ok(formatted.includes('ERR_BACKEND_NOT_FOUND'));
      assert.ok(formatted.includes('Suggestion:'));
      assert.ok(formatted.includes('npm install'));
    });

    it('should format BaseError with ASCII symbols when CODEAGENT_ASCII_MODE=1', () => {
      process.env.CODEAGENT_ASCII_MODE = '1';
      const error = new InvalidParameterError('timeout', -1, 'must be positive');
      const formatted = formatError(error);
      
      assert.ok(formatted.includes('[ERROR]'));
      assert.ok(formatted.includes('[INFO]'));
      assert.ok(formatted.includes('[SUGGESTION]'));
      assert.ok(!formatted.includes('❌'));
      
      delete process.env.CODEAGENT_ASCII_MODE;
    });

    it('should handle regular Error objects', () => {
      const error = new Error('Regular error');
      const formatted = formatError(error);
      
      assert.ok(formatted.includes('Regular error'));
    });

    it('should handle formatting errors gracefully', () => {
      const error = {
        message: 'Invalid error object'
      };
      const formatted = formatError(error);
      
      // Should at least contain the error message
      assert.ok(formatted.includes('Invalid error object'));
    });
  });
});
