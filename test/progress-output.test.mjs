/**
 * Tests for progress output formatting
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { formatProgressMessage } from '../src/utils.mjs';

describe('formatProgressMessage', () => {
  it('should format started stage', () => {
    const event = {
      stage: 'started',
      message: 'Task started',
      backend: 'claude'
    };
    const result = formatProgressMessage(event);
    assert.match(result, /Task started/);
    assert.ok(result.includes('⏳') || result.includes('[START]'));
  });

  it('should format analyzing stage', () => {
    const event = {
      stage: 'analyzing',
      message: 'Analyzing code',
      backend: 'claude'
    };
    const result = formatProgressMessage(event);
    assert.match(result, /Analyzing code/);
    assert.ok(result.includes('🔍') || result.includes('[THINK]'));
  });

  it('should format executing stage', () => {
    const event = {
      stage: 'executing',
      message: 'Executing tool',
      backend: 'claude'
    };
    const result = formatProgressMessage(event);
    assert.match(result, /Executing tool/);
    assert.ok(result.includes('⚡') || result.includes('[EXEC]'));
  });

  it('should format executing stage with tool name', () => {
    const event = {
      stage: 'executing',
      message: 'Executing tool',
      backend: 'claude',
      details: { toolName: 'read_file' }
    };
    const result = formatProgressMessage(event);
    assert.match(result, /read_file/);
    assert.ok(result.includes('⚡') || result.includes('[EXEC]'));
  });

  it('should format completed stage with elapsed time', () => {
    const startTime = Date.now() - 15200; // 15.2 seconds ago
    const event = {
      stage: 'completed',
      message: 'Task completed',
      backend: 'claude'
    };
    const result = formatProgressMessage(event, startTime);
    assert.match(result, /Task completed/);
    assert.match(result, /15\.\d+s/); // Should show seconds
    assert.ok(result.includes('✓') || result.includes('[DONE]'));
  });

  it('should format completed stage without elapsed time when startTime not provided', () => {
    const event = {
      stage: 'completed',
      message: 'Task completed',
      backend: 'claude'
    };
    const result = formatProgressMessage(event);
    assert.match(result, /Task completed/);
    assert.ok(!result.includes('('));
  });

  it('should format time less than one second in milliseconds', () => {
    const startTime = Date.now() - 500; // 500ms ago
    const event = {
      stage: 'completed',
      message: 'Task completed',
      backend: 'claude'
    };
    const result = formatProgressMessage(event, startTime);
    assert.match(result, /\d+ms/); // Should show milliseconds
  });

  it('should use ASCII mode when environment variable is set', () => {
    const originalValue = process.env.CODEAGENT_ASCII_MODE;
    process.env.CODEAGENT_ASCII_MODE = '1';

    const event = {
      stage: 'started',
      message: 'Task started',
      backend: 'claude'
    };
    const result = formatProgressMessage(event);
    assert.match(result, /\[START\]/);
    assert.ok(!result.includes('⏳'));

    // Restore original value
    if (originalValue === undefined) {
      delete process.env.CODEAGENT_ASCII_MODE;
    } else {
      process.env.CODEAGENT_ASCII_MODE = originalValue;
    }
  });

  it('should use emoji mode by default', () => {
    const originalValue = process.env.CODEAGENT_ASCII_MODE;
    delete process.env.CODEAGENT_ASCII_MODE;

    const event = {
      stage: 'started',
      message: 'Task started',
      backend: 'claude'
    };
    const result = formatProgressMessage(event);
    assert.match(result, /⏳/);

    // Restore original value
    if (originalValue !== undefined) {
      process.env.CODEAGENT_ASCII_MODE = originalValue;
    }
  });

  it('should handle null event gracefully', () => {
    const result = formatProgressMessage(null);
    assert.strictEqual(result, '');
  });

  it('should handle event without stage gracefully', () => {
    const event = {
      message: 'Some message'
    };
    const result = formatProgressMessage(event);
    assert.strictEqual(result, '');
  });

  it('should handle event without message', () => {
    const event = {
      stage: 'started',
      backend: 'claude'
    };
    const result = formatProgressMessage(event);
    assert.ok(result.includes('⏳') || result.includes('[START]'));
  });

  it('should handle unknown stage gracefully', () => {
    const event = {
      stage: 'unknown_stage',
      message: 'Test message',
      backend: 'claude'
    };
    const result = formatProgressMessage(event);
    assert.match(result, /Test message/);
    assert.match(result, /•/); // Should use bullet as fallback
  });
});
