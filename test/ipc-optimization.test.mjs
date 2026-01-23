/**
 * Tests for IPC optimization
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseCliArgs } from '../src/config.mjs';
import { Readable, Transform } from 'stream';
import { parseJSONStream } from '../src/parser.mjs';

describe('IPC Optimization - Minimal Environment', () => {
  it('should parse --minimal-env flag', () => {
    const config = parseCliArgs(['--minimal-env', 'test task']);
    assert.strictEqual(config.minimalEnv, true);
  });

  it('should default minimalEnv to false', () => {
    const config = parseCliArgs(['test task']);
    assert.strictEqual(config.minimalEnv, false);
  });

  it('should handle --minimal-env with other flags', () => {
    const config = parseCliArgs(['--backend', 'claude', '--minimal-env', 'test task']);
    assert.strictEqual(config.minimalEnv, true);
    assert.strictEqual(config.backend, 'claude');
  });
});

describe('IPC Optimization - Transform Stream Parser', () => {
  it('should parse JSON lines efficiently using Transform stream', async () => {
    const jsonLines = [
      '{"type": "result", "session_id": "test123"}',
      '{"subtype": "text", "content": "Hello"}',
      '{"result": "Done"}'
    ];

    const stream = Readable.from(jsonLines.join('\n'));
    const result = await parseJSONStream(stream);

    assert.strictEqual(result.sessionId, 'test123');
    assert.strictEqual(result.backendType, 'claude');
    assert.ok(result.message.includes('Hello') || result.message.includes('Done'));
  });

  it('should skip empty lines efficiently', async () => {
    const jsonLines = [
      '',
      '{"type": "init", "session_id": "test456"}',
      '',
      '{"type": "message", "content": "Test"}',
      ''
    ];

    const stream = Readable.from(jsonLines.join('\n'));
    const result = await parseJSONStream(stream);

    assert.strictEqual(result.sessionId, 'test456');
    assert.ok(result.message.includes('Test'));
  });

  it('should skip non-JSON lines efficiently', async () => {
    const lines = [
      'Plain text line',
      '{"type": "init", "session_id": "test789"}',
      'Another non-JSON line',
      '{"type": "message", "content": "Valid"}',
      'debug: some debug output'
    ];

    const stream = Readable.from(lines.join('\n'));
    const result = await parseJSONStream(stream);

    assert.strictEqual(result.sessionId, 'test789');
    assert.ok(result.message.includes('Valid'));
  });

  it('should handle large JSON streams without memory issues', async () => {
    const largeLines = [];
    for (let i = 0; i < 1000; i++) {
      largeLines.push(`{"type": "message", "content": "Line ${i}"}`);
    }
    largeLines.unshift('{"type": "init", "session_id": "large_test"}');

    const stream = Readable.from(largeLines.join('\n'));
    const result = await parseJSONStream(stream);

    assert.strictEqual(result.sessionId, 'large_test');
    assert.ok(result.message.length > 0);
  });

  it('should detect backend type from first event', async () => {
    const claudeStream = Readable.from([
      '{"subtype": "text", "content": "Test"}',
      '{"type": "result", "session_id": "claude123"}'
    ].join('\n'));

    const result = await parseJSONStream(claudeStream);
    assert.strictEqual(result.backendType, 'claude');
    assert.strictEqual(result.sessionId, 'claude123');
  });

  it('should handle incomplete JSON at end of stream', async () => {
    const lines = [
      '{"type": "init", "session_id": "test"}',
      '{"type": "message", "content": "Valid"}',
      '{"type": "incomplete'  // Incomplete JSON
    ];

    const stream = Readable.from(lines.join('\n'));
    const result = await parseJSONStream(stream);

    // Should parse valid lines and skip incomplete
    assert.strictEqual(result.sessionId, 'test');
    assert.ok(result.message.includes('Valid'));
  });

  it('should handle Buffer chunks efficiently', async () => {
    // Simulate real streaming with Buffer chunks
    const chunks = [
      Buffer.from('{"type": "init", "session_id": "buf'),
      Buffer.from('fer_test"}\n{"type": "message", '),
      Buffer.from('"content": "Streaming"}\n')
    ];

    const stream = new Readable({
      read() {
        if (chunks.length > 0) {
          this.push(chunks.shift());
        } else {
          this.push(null);
        }
      }
    });

    const result = await parseJSONStream(stream);
    assert.strictEqual(result.sessionId, 'buffer_test');
    assert.ok(result.message.includes('Streaming'));
  });

  it('should call onEvent callback for each parsed event', async () => {
    const events = [];
    const jsonLines = [
      '{"type": "init", "session_id": "callback_test"}',
      '{"type": "message", "content": "Event1"}',
      '{"type": "message", "content": "Event2"}'
    ];

    const stream = Readable.from(jsonLines.join('\n'));
    await parseJSONStream(stream, {
      onEvent: (event, backendType) => {
        events.push({ event, backendType });
      }
    });

    assert.strictEqual(events.length, 3);
    assert.strictEqual(events[0].event.type, 'init');
  });

  it('should call onMessage callback for each message', async () => {
    const messages = [];
    const jsonLines = [
      '{"type": "message", "content": "Msg1"}',
      '{"type": "message", "content": "Msg2"}'
    ];

    const stream = Readable.from(jsonLines.join('\n'));
    await parseJSONStream(stream, {
      onMessage: (msg) => {
        messages.push(msg);
      }
    });

    assert.strictEqual(messages.length, 2);
    assert.ok(messages[0].includes('Msg1'));
    assert.ok(messages[1].includes('Msg2'));
  });
});

describe('IPC Optimization - Performance Characteristics', () => {
  it('should process streams with minimal string conversions', async () => {
    // Test that we handle Buffers efficiently
    const largeContent = 'x'.repeat(10000);
    const jsonLines = [
      `{"type": "message", "content": "${largeContent}"}`,
      `{"type": "message", "content": "${largeContent}"}`
    ];

    const stream = Readable.from(jsonLines.join('\n'));
    const startTime = Date.now();
    const result = await parseJSONStream(stream);
    const duration = Date.now() - startTime;

    // Should process quickly (less than 100ms for this size)
    assert.ok(duration < 100, `Processing took ${duration}ms`);
    assert.ok(result.message.length > 0);
  });

  it('should handle mixed whitespace efficiently', async () => {
    const lines = [
      '  \t  {"type": "init", "session_id": "ws_test"}  ',
      '\n\n',
      '    {"type": "message", "content": "Test"}    \t',
      ''
    ];

    const stream = Readable.from(lines.join('\n'));
    const result = await parseJSONStream(stream);

    assert.strictEqual(result.sessionId, 'ws_test');
    assert.ok(result.message.includes('Test'));
  });
});