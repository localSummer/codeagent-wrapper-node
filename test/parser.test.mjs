/**
 * Tests for parser module
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Readable } from 'stream';
import { detectBackend, extractMessage, extractSessionId, parseJSONStream } from '../src/parser.mjs';

describe('detectBackend', () => {
  it('should detect codex backend', () => {
    assert.strictEqual(detectBackend({ thread_id: 'abc' }), 'codex');
    assert.strictEqual(detectBackend({ item: { type: 'message' } }), 'codex');
  });

  it('should detect claude backend', () => {
    assert.strictEqual(detectBackend({ subtype: 'text' }), 'claude');
    assert.strictEqual(detectBackend({ type: 'result', session_id: 'abc' }), 'claude');
  });

  it('should detect gemini backend', () => {
    assert.strictEqual(detectBackend({ role: 'model' }), 'gemini');
    assert.strictEqual(detectBackend({ delta: true }), 'gemini');
  });

  it('should detect opencode backend', () => {
    assert.strictEqual(detectBackend({ sessionID: 'abc', part: {} }), 'opencode');
  });

  it('should return unknown for unrecognized format', () => {
    assert.strictEqual(detectBackend({ foo: 'bar' }), 'unknown');
  });
});

describe('extractMessage', () => {
  it('should extract message from codex event', () => {
    const event = { item: { content: 'Hello' } };
    assert.strictEqual(extractMessage(event, 'codex'), 'Hello');
  });

  it('should extract message from claude event', () => {
    const event = { result: 'Hello Claude' };
    assert.strictEqual(extractMessage(event, 'claude'), 'Hello Claude');
  });

  it('should extract message from gemini event', () => {
    const event = { content: 'Hello Gemini' };
    assert.strictEqual(extractMessage(event, 'gemini'), 'Hello Gemini');
  });

  it('should extract message from opencode event', () => {
    const event = { part: { text: 'Hello Opencode' } };
    assert.strictEqual(extractMessage(event, 'opencode'), 'Hello Opencode');
  });

  it('should extract tool call output from opencode event', () => {
    const event = {
      type: 'tool_use',
      part: {
        type: 'tool',
        callID: 'call_123',
        tool: 'bash',
        state: {
          status: 'completed',
          input: { command: 'ls', description: 'List files' },
          output: 'file1.txt\nfile2.txt'
        }
      }
    };
    assert.strictEqual(extractMessage(event, 'opencode'), 'file1.txt\nfile2.txt');
  });

  it('should return empty string for opencode tool event without output', () => {
    const event = {
      type: 'tool_use',
      part: {
        type: 'tool',
        callID: 'call_123',
        state: { status: 'pending' }
      }
    };
    assert.strictEqual(extractMessage(event, 'opencode'), '');
  });

  it('should prefer text over tool output for opencode event', () => {
    const event = {
      part: {
        text: 'Text message',
        type: 'tool',
        state: { output: 'Tool output' }
      }
    };
    assert.strictEqual(extractMessage(event, 'opencode'), 'Text message');
  });
});

describe('extractSessionId', () => {
  it('should extract session ID from codex', () => {
    assert.strictEqual(extractSessionId({ thread_id: 'thread123' }, 'codex'), 'thread123');
  });

  it('should extract session ID from claude', () => {
    assert.strictEqual(extractSessionId({ session_id: 'sess123' }, 'claude'), 'sess123');
  });

  it('should extract session ID from opencode (camelCase)', () => {
    assert.strictEqual(extractSessionId({ sessionID: 'sess123' }, 'opencode'), 'sess123');
  });
});

describe('parseJSONStream', () => {
  it('should parse JSON lines from stream', async () => {
    const lines = [
      JSON.stringify({ type: 'message', content: 'Hello' }),
      JSON.stringify({ type: 'message', content: ' World' }),
      JSON.stringify({ type: 'result', session_id: 'sess123' })
    ];
    
    const stream = Readable.from(lines.join('\n'));
    const result = await parseJSONStream(stream);
    
    assert.ok(result.message.includes('Hello'));
    assert.ok(result.message.includes('World'));
  });

  it('should skip non-JSON lines', async () => {
    const lines = [
      'not json',
      JSON.stringify({ content: 'valid' }),
      'also not json'
    ];
    
    const stream = Readable.from(lines.join('\n'));
    const result = await parseJSONStream(stream);
    
    assert.ok(result.message.includes('valid'));
  });
});
