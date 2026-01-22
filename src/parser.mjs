/**
 * JSON stream parser for multiple backend formats
 */

import * as readline from 'readline';

// T2.2: Maximum message size to prevent memory exhaustion (10MB)
const MAX_MESSAGE_SIZE = 10 * 1024 * 1024;

// Performance: Pre-check set for fast JSON detection
const JSON_FIRST_CHARS = new Set(['{', '[']);

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
        // Text message
        if (event.item.content) {
          return event.item.content;
        }
        if (event.item.text) {
          return event.item.text;
        }
        // Command execution result
        if (event.item.type === 'command_execution' && event.item.aggregated_output) {
          return event.item.aggregated_output;
        }
      }
      return '';

    case 'claude':
      // Final result
      if (event.result) {
        return event.result;
      }
      // Text content
      if (event.content) {
        return event.content;
      }
      // Tool call result
      if (event.tool_use_result && event.tool_use_result.stdout) {
        return event.tool_use_result.stdout;
      }
      return '';

    case 'gemini':
      // Text content
      if (event.content) {
        return event.content;
      }
      // Tool call result
      if (event.type === 'tool_result' && event.output) {
        return event.output;
      }
      return '';

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
        // Text message
        if (event.part.text) {
          return event.part.text;
        }
        if (event.part.content) {
          return event.part.content;
        }
        // Tool call result - extract from part.state.output
        if (event.part.type === 'tool' && event.part.state && event.part.state.output) {
          return event.part.state.output;
        }
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
  let messagesSize = 0; // T2.2: Track total message size
  let sessionId = '';
  let detectedBackend = 'unknown';
  let cachedBackend = null; // Performance: Cache backend type after first detection

  for await (const line of rl) {
    const trimmed = line.trim();
    
    // Performance: Fast empty line skip
    if (!trimmed) continue;

    // Performance: Pre-check first character before attempting JSON.parse
    const firstChar = trimmed[0];
    if (!JSON_FIRST_CHARS.has(firstChar)) {
      continue; // Skip non-JSON lines quickly
    }

    try {
      const event = JSON.parse(trimmed);

      // Performance: Use cached backend type if available
      if (cachedBackend) {
        detectedBackend = cachedBackend;
      } else if (detectedBackend === 'unknown') {
        detectedBackend = detectBackend(event);
        cachedBackend = detectedBackend; // Cache for subsequent events
      }

      // Notify event callback
      if (onEvent) {
        onEvent(event, detectedBackend);
      }

      // Extract message
      const message = extractMessage(event, detectedBackend);
      if (message) {
        // T2.2: Only add message if within size limit
        if (messagesSize + message.length <= MAX_MESSAGE_SIZE) {
          messages.push(message);
          messagesSize += message.length;
        }
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
