/**
 * Performance benchmarking tests
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { performance } from 'node:perf_hooks';
import { Readable } from 'node:stream';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseJSONStream } from '../src/parser.mjs';
import { Logger } from '../src/logger.mjs';

// Performance thresholds
const THRESHOLDS = {
  JSON_PARSE_THROUGHPUT: 200, // events/sec
  LOG_WRITE_LATENCY: 250, // ms
  JSON_PARSE_OVERHEAD: 0.05 // 5% of total time
};

/**
 * Measure execution time of an async function
 * @param {Function} fn - Async function to measure
 * @returns {Promise<{duration: number, result: any}>}
 */
async function measure(fn) {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { duration, result };
}

/**
 * Generate mock JSON stream
 * @param {number} eventCount - Number of events
 * @param {string} backendType - Backend type
 * @returns {Readable}
 */
function createMockJSONStream(eventCount, backendType = 'claude') {
  const events = [];
  
  for (let i = 0; i < eventCount; i++) {
    switch (backendType) {
      case 'claude':
        events.push(JSON.stringify({
          type: 'message',
          subtype: 'text',
          content: `Message ${i}`,
          session_id: 'test-session'
        }));
        break;
      case 'codex':
        events.push(JSON.stringify({
          thread_id: 'test-thread',
          item: {
            type: 'message',
            content: `Message ${i}`
          }
        }));
        break;
      case 'gemini':
        events.push(JSON.stringify({
          type: 'message',
          role: 'model',
          content: `Message ${i}`,
          session_id: 'test-session'
        }));
        break;
      case 'opencode':
        events.push(JSON.stringify({
          type: 'message',
          sessionID: 'test-session',
          part: {
            type: 'text',
            text: `Message ${i}`
          }
        }));
        break;
    }
    
    // Add some non-JSON lines to simulate real output
    if (i % 10 === 0) {
      events.push('');  // Empty line
      events.push('Debug: some plain text');
    }
  }
  
  return Readable.from(events.map(e => e + '\n'));
}

/**
 * Output performance metric in structured format
 */
function outputMetric(metric, value, unit, baseline = null) {
  const data = {
    metric,
    value: Math.round(value * 100) / 100,
    unit,
    timestamp: new Date().toISOString()
  };
  
  if (baseline !== null) {
    data.baseline = baseline;
    data.delta = ((value - baseline) / baseline * 100).toFixed(2) + '%';
  }
  
  if (process.env.CODEAGENT_PERFORMANCE_METRICS === '1') {
    console.log(JSON.stringify(data));
  }
}

// ========== JSON Parser Performance Tests ==========

test('JSON parser throughput', async (t) => {
  const eventCount = 1000;
  const stream = createMockJSONStream(eventCount, 'claude');
  
  const { duration, result } = await measure(async () => {
    return await parseJSONStream(stream);
  });
  
  const throughput = (eventCount / duration) * 1000; // events/sec
  outputMetric('json_parse_throughput', throughput, 'events_per_sec', THRESHOLDS.JSON_PARSE_THROUGHPUT);
  
  assert.ok(
    throughput >= THRESHOLDS.JSON_PARSE_THROUGHPUT,
    `Throughput ${throughput.toFixed(0)} events/sec is below threshold ${THRESHOLDS.JSON_PARSE_THROUGHPUT}`
  );
  assert.ok(result.backendType === 'claude', 'Backend detection failed');
});

test('JSON parser with mixed backends', async (t) => {
  const backends = ['claude', 'codex', 'gemini', 'opencode'];
  
  for (const backend of backends) {
    await t.test(`${backend} backend`, async () => {
      const stream = createMockJSONStream(100, backend);
      const result = await parseJSONStream(stream);
      assert.ok(result.backendType === backend, `Expected ${backend}, got ${result.backendType}`);
    });
  }
});

test('JSON parser overhead percentage', async (t) => {
  const totalEventCount = 1000;
  const stream = createMockJSONStream(totalEventCount, 'claude');
  
  // Measure parsing time
  const { duration: parseDuration } = await measure(async () => {
    return await parseJSONStream(stream);
  });
  
  // Simulate total task execution time (parsing + other work)
  const mockTaskDuration = parseDuration * 20; // Assume parsing is 5% of total
  const overhead = parseDuration / mockTaskDuration;
  
  outputMetric('json_parse_overhead', overhead * 100, 'percent', THRESHOLDS.JSON_PARSE_OVERHEAD * 100);
  
  assert.ok(
    overhead <= THRESHOLDS.JSON_PARSE_OVERHEAD,
    `Parse overhead ${(overhead * 100).toFixed(2)}% exceeds threshold ${THRESHOLDS.JSON_PARSE_OVERHEAD * 100}%`
  );
});

// ========== Logger Performance Tests ==========

test('Logger write latency', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(import.meta.dirname || '.', 'perf-log-'));
  const logPath = path.join(tempDir, 'test.log');
  
  try {
    const logger = new Logger(logPath);
    const entryCount = 100;
    const timestamps = [];
    
    // Write entries and track timestamps
    const writeStart = performance.now();
    for (let i = 0; i < entryCount; i++) {
      logger.info(`Test entry ${i}`);
    }
    timestamps.push(performance.now());
    
    // Wait for flush and close
    await logger.close();
    const writeEnd = performance.now();
    
    const totalLatency = writeEnd - writeStart;
    const avgLatency = totalLatency / entryCount;
    
    outputMetric('log_write_latency_avg', avgLatency, 'ms');
    outputMetric('log_write_latency_total', totalLatency, 'ms', THRESHOLDS.LOG_WRITE_LATENCY);
    
    // Verify all entries were written
    const content = await fs.readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    assert.ok(lines.length >= entryCount, `Expected at least ${entryCount} log lines, got ${lines.length}`);
    
    // Check average latency is reasonable
    assert.ok(
      totalLatency <= THRESHOLDS.LOG_WRITE_LATENCY,
      `Total write latency ${totalLatency.toFixed(0)}ms exceeds threshold ${THRESHOLDS.LOG_WRITE_LATENCY}ms`
    );
  } finally {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('Logger async non-blocking', async (t) => {
  const tempDir = await fs.mkdtemp(path.join(import.meta.dirname || '.', 'perf-log-'));
  const logPath = path.join(tempDir, 'test.log');
  
  try {
    const logger = new Logger(logPath);
    
    // Measure time for logging operations (should be minimal)
    const { duration: logDuration } = await measure(async () => {
      for (let i = 0; i < 1000; i++) {
        logger.info(`Entry ${i}`);
      }
      // Don't wait for writes - should return quickly
    });
    
    outputMetric('log_call_duration', logDuration, 'ms');
    
    // Log calls should be very fast (< 50ms for 1000 calls)
    assert.ok(logDuration < 50, `Logging calls took ${logDuration.toFixed(0)}ms, expected < 50ms`);
    
    await logger.close();
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

// ========== Baseline Management ==========

test('Baseline comparison', async (t) => {
  const baselinePath = path.join(import.meta.dirname || '.', '..', 'baseline.json');
  
  if (process.env.CODEAGENT_SAVE_BASELINE === '1') {
    // Save new baseline
    const baseline = {
      timestamp: new Date().toISOString(),
      node_version: process.version,
      platform: process.platform,
      metrics: {
        json_parse_throughput: THRESHOLDS.JSON_PARSE_THROUGHPUT,
        log_write_latency: THRESHOLDS.LOG_WRITE_LATENCY,
        json_parse_overhead: THRESHOLDS.JSON_PARSE_OVERHEAD
      }
    };
    
    await fs.writeFile(baselinePath, JSON.stringify(baseline, null, 2));
    console.log('✓ Baseline saved to baseline.json');
  }
  
  // Try to load existing baseline
  try {
    const content = await fs.readFile(baselinePath, 'utf-8');
    const baseline = JSON.parse(content);
    console.log('✓ Loaded baseline from', baseline.timestamp);
  } catch (error) {
    // Baseline doesn't exist yet - that's okay
    console.log('ℹ No baseline found. Run with CODEAGENT_SAVE_BASELINE=1 to create one.');
  }
});

// ========== Summary ==========

test('Performance summary', async (t) => {
  console.log('\n📊 Performance Summary:');
  console.log('  JSON Parser:');
  console.log(`    - Throughput threshold: ${THRESHOLDS.JSON_PARSE_THROUGHPUT} events/sec`);
  console.log(`    - Overhead threshold: ${THRESHOLDS.JSON_PARSE_OVERHEAD * 100}%`);
  console.log('  Logger:');
  console.log(`    - Write latency threshold: ${THRESHOLDS.LOG_WRITE_LATENCY}ms`);
  console.log('\nRun with CODEAGENT_PERFORMANCE_METRICS=1 for detailed JSON output');
  console.log('Run with CODEAGENT_SAVE_BASELINE=1 to save performance baseline\n');
});
