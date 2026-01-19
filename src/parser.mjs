/**
 * JSON stream parser for multiple backend formats
 */

import * as readline from 'readline';

/**
 * @typedef {Object} UnifiedEvent
 * @property {string} type - Event type
 * @property {string} threadId - Thread ID (Codex)
 * @property {string} sessionId - Session ID
 * @property {string} subtype - Event subtype (Claude)
 * @property {string} result - Result content
 * @property {string} role - Message role (Gemini)
 * @property {string} content - Message content
 * @property {boolean} delta - Is delta update
 * @property {string} status - Status
 * @property {object} item - Raw item data
 * @property {object} part - Part data (Opencode)
 */

/**
 * @typedef {Object} ParsedResult
 * @property {string} message - Extracted message
 * @property {string} sessionId - Session ID
 * @property {string} backendType - Detected backend type
 */

/**
 * Detect backend type from event structure
 * @param {object} event - Parsed JSON event
 * @returns {string} Backend type: 'codex', 'claude', 'gemini', 'opencode', or 'unknown'
 */
export function detectBackend(event) {
  // Codex: has thread_id or item.type
  if (event.thread_id || (event.item && event.item.type)) {
    return 'codex';
  }

  // Claude: has subtype or result or (type=result && session_id)
  if (event.subtype || event.result || (event.type === 'result' && event.session_id)) {
    return 'claude';
  }

  // Gemini: has role or delta or (type=init && session_id)
  if (event.role || event.delta !== undefined || (event.type === 'init' && event.session_id)) {
    return 'gemini';
  }

  // Opencode: has sessionID (camelCase) and part
  if (event.sessionID && event.part) {
    return 'opencode';
  }

  return 'unknown';
}

/**
 * Extract message from event based on backend type
 * @param {object} event - Parsed JSON event
 * @param {string} backendType - Backend type
 * @returns {string} Extracted message or empty string
 */
export function extractMessage(event, backendType) {
  switch (backendType) {
    case 'codex':
      if (event.item) {
        if (typeof event.item === 'string') {
          try {
            const item = JSON.parse(event.item);
            return item.content || item.text || '';
          } catch {
            return '';
          }
        }
        return event.item.content || event.item.text || '';
      }
      return '';

    case 'claude':
      return event.result || event.content || '';

    case 'gemini':
      return event.content || '';

    case 'opencode':
      if (event.part) {
        if (typeof event.part === 'string') {
          try {
            const part = JSON.parse(event.part);
            return part.text || part.content || '';
          } catch {
            return '';
          }
        }
        return event.part.text || event.part.content || '';
      }
      return '';

    default:
      return event.content || event.text || event.message || '';
  }
}

/**
 * Extract session ID from event based on backend type
 * @param {object} event - Parsed JSON event
 * @param {string} backendType - Backend type
 * @returns {string} Session ID or empty string
 */
export function extractSessionId(event, backendType) {
  switch (backendType) {
    case 'codex':
      return event.thread_id || '';

    case 'claude':
      return event.session_id || '';

    case 'gemini':
      return event.session_id || '';

    case 'opencode':
      return event.sessionID || '';  // camelCase

    default:
      return event.session_id || event.sessionId || event.thread_id || '';
  }
}

/**
 * Check if event signals completion
 * @param {object} event - Parsed JSON event
 * @param {string} backendType - Backend type
 * @returns {boolean}
 */
export function isCompletionEvent(event, backendType) {
  switch (backendType) {
    case 'codex':
      return event.type === 'completed' || event.type === 'done';

    case 'claude':
      return event.type === 'result' || event.subtype === 'success';

    case 'gemini':
      return event.status === 'completed' || event.type === 'done';

    case 'opencode':
      return event.type === 'done' || event.type === 'completed';

    default:
      return event.type === 'done' || event.type === 'completed' || event.type === 'result';
  }
}

/**
 * Parse JSON stream from readable stream
 * @param {import('stream').Readable} stream - Input stream
 * @param {object} [options] - Options
 * @param {function(object, string): void} [options.onEvent] - Event callback
 * @param {function(string): void} [options.onMessage] - Message callback
 * @returns {Promise<ParsedResult>}
 */
export async function parseJSONStream(stream, options = {}) {
  const { onEvent, onMessage } = options;

  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  const messages = [];
  let sessionId = '';
  let detectedBackend = 'unknown';

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const event = JSON.parse(trimmed);

      // Detect backend on first valid event
      if (detectedBackend === 'unknown') {
        detectedBackend = detectBackend(event);
      }

      // Notify event callback
      if (onEvent) {
        onEvent(event, detectedBackend);
      }

      // Extract message
      const message = extractMessage(event, detectedBackend);
      if (message) {
        messages.push(message);
        if (onMessage) {
          onMessage(message);
        }
      }

      // Extract session ID
      const eventSessionId = extractSessionId(event, detectedBackend);
      if (eventSessionId && !sessionId) {
        sessionId = eventSessionId;
      }

    } catch {
      // Skip non-JSON lines
    }
  }

  return {
    message: messages.join(''),
    sessionId,
    backendType: detectedBackend
  };
}

/**
 * Async generator for parsing JSON stream
 * @param {import('stream').Readable} stream - Input stream
 * @yields {object} Parsed events
 */
export async function* parseJSONStreamGenerator(stream) {
  const rl = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const event = JSON.parse(trimmed);
      const backendType = detectBackend(event);
      yield { event, backendType };
    } catch {
      // Skip non-JSON lines
    }
  }
}
