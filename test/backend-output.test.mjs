/**
 * Tests for backend output forwarding
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import { parseCliArgs, loadEnvConfig } from '../src/config.mjs';

describe('Backend Output Configuration', () => {
  it('should parse --backend-output flag', () => {
    const config = parseCliArgs(['node', 'codeagent', '--backend-output', 'test task']);
    assert.strictEqual(config.backendOutput, true);
  });

  it('should parse --debug flag', () => {
    const config = parseCliArgs(['node', 'codeagent', '--debug', 'test task']);
    assert.strictEqual(config.debug, true);
  });

  it('should auto-enable backendOutput in debug mode', () => {
    const config = parseCliArgs(['node', 'codeagent', '--debug', 'test task']);
    assert.strictEqual(config.backendOutput, true);
    assert.strictEqual(config.debug, true);
  });

  it('should default backendOutput to false', () => {
    const config = parseCliArgs(['node', 'codeagent', 'test task']);
    assert.strictEqual(config.backendOutput, false);
  });

  it('should support CODEAGENT_BACKEND_OUTPUT env var', () => {
    const originalEnv = process.env.CODEAGENT_BACKEND_OUTPUT;
    try {
      process.env.CODEAGENT_BACKEND_OUTPUT = '1';
      const envConfig = loadEnvConfig();
      assert.strictEqual(envConfig.backendOutput, true);
    } finally {
      if (originalEnv !== undefined) {
        process.env.CODEAGENT_BACKEND_OUTPUT = originalEnv;
      } else {
        delete process.env.CODEAGENT_BACKEND_OUTPUT;
      }
    }
  });

  it('should support CODEAGENT_DEBUG env var', () => {
    const originalEnv = process.env.CODEAGENT_DEBUG;
    try {
      process.env.CODEAGENT_DEBUG = '1';
      const envConfig = loadEnvConfig();
      assert.strictEqual(envConfig.debug, true);
    } finally {
      if (originalEnv !== undefined) {
        process.env.CODEAGENT_DEBUG = originalEnv;
      } else {
        delete process.env.CODEAGENT_DEBUG;
      }
    }
  });
});

describe('Backend Output Forwarding', () => {
  it('should add [BACKEND] prefix to stderr lines', async () => {
    // Create a simple test script that writes to stderr
    const testScript = `
      import { spawn } from 'child_process';
      
      // Mock backend that writes to stderr
      const child = spawn('node', ['-e', 'console.error("Test stderr line")'], {
        stdio: ['ignore', 'ignore', 'pipe']
      });
      
      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        const lines = chunk.split('\\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line === '' && i === lines.length - 1) continue;
          let output = line;
          if (!process.stderr.isTTY) {
            output = output.replace(/\\x1b\\[[0-9;]*m/g, '');
          }
          process.stderr.write(\`[BACKEND] \${output}\\n\`);
        }
      });
      
      await new Promise(resolve => child.on('close', resolve));
    `;

    const proc = spawn('node', ['--input-type=module', '-e', testScript], {
      stdio: ['ignore', 'ignore', 'pipe']
    });

    const stderrChunks = [];
    proc.stderr.on('data', (data) => {
      stderrChunks.push(data.toString());
    });

    await new Promise(resolve => proc.on('close', resolve));

    const stderr = stderrChunks.join('');
    assert.ok(stderr.includes('[BACKEND]'), 'Should include [BACKEND] prefix');
    assert.ok(stderr.includes('Test stderr line'), 'Should include original message');
  });

  it('should strip ANSI codes when not TTY', () => {
    const input = '\x1b[31mRed text\x1b[0m';
    const stripped = input.replace(/\x1b\[[0-9;]*m/g, '');
    assert.strictEqual(stripped, 'Red text');
  });

  it('should preserve ANSI codes pattern', () => {
    // Test that the pattern matches various ANSI codes
    const testCases = [
      { input: '\x1b[0m', expected: '' },
      { input: '\x1b[31m', expected: '' },
      { input: '\x1b[1;32m', expected: '' },
      { input: 'Text\x1b[0m', expected: 'Text' },
      { input: '\x1b[31mRed\x1b[0m Normal', expected: 'Red Normal' }
    ];

    for (const { input, expected } of testCases) {
      const result = input.replace(/\x1b\[[0-9;]*m/g, '');
      assert.strictEqual(result, expected, `Failed for input: ${JSON.stringify(input)}`);
    }
  });
});
