/**
 * Tests for signal handling utilities
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { setupSignalHandlers } from '../src/signal.mjs';

describe('setupSignalHandlers', () => {
  it('should clean up signal listeners', () => {
    const before = process.listenerCount('SIGINT');
    const handler = setupSignalHandlers(() => {});
    const mid = process.listenerCount('SIGINT');
    handler.cleanup();
    const after = process.listenerCount('SIGINT');

    assert.strictEqual(mid, before + 1);
    assert.strictEqual(after, before);
  });
});
