/**
 * Output noise filtering
 */

// T3.4: Cache filter functions by backend type to avoid repeated creation
const filterCache = new Map();

/**
 * Gemini noise patterns to filter
 */
const GEMINI_NOISE_PATTERNS = [
  /^\[STARTUP\]/,
  /Session cleanup disabled/,
  /^Warning:/,
  /^\(node:/,
  /Loaded cached credentials/,
  /Loading extension:/
];

/**
 * Codex noise patterns to filter
 */
const CODEX_NOISE_PATTERNS = [
  /ERROR codex_core::codex: needs_follow_up:/,
  /ERROR codex_core::skills::loader:/
];

/**
 * All noise patterns combined
 */
const ALL_NOISE_PATTERNS = [
  ...GEMINI_NOISE_PATTERNS,
  ...CODEX_NOISE_PATTERNS
];

/**
 * Check if a line matches any noise pattern
 * @param {string} line - Line to check
 * @param {RegExp[]} patterns - Patterns to match against
 * @returns {boolean} True if line is noise
 */
function matchesAny(line, patterns) {
  return patterns.some(pattern => pattern.test(line));
}

/**
 * Create a noise filter function
 * T3.4: Uses cache to avoid recreating filter functions for same backend
 * @param {string} [backend] - Backend name for backend-specific filtering
 * @returns {function(string): boolean} Filter function that returns true if line should be kept
 */
export function createNoiseFilter(backend = '') {
  // T3.4: Return cached filter if available
  if (filterCache.has(backend)) {
    return filterCache.get(backend);
  }

  let patterns = ALL_NOISE_PATTERNS;

  // Use backend-specific patterns if specified
  if (backend === 'gemini') {
    patterns = GEMINI_NOISE_PATTERNS;
  } else if (backend === 'codex') {
    patterns = CODEX_NOISE_PATTERNS;
  }

  const filter = (line) => !matchesAny(line, patterns);
  
  // T3.4: Cache the filter function
  filterCache.set(backend, filter);
  
  return filter;
}

/**
 * Filter a single line
 * @param {string} line - Line to filter
 * @param {string} [backend] - Backend name
 * @returns {boolean} True if line should be kept
 */
export function filterLine(line, backend = '') {
  const filter = createNoiseFilter(backend);
  return filter(line);
}

/**
 * Filter multiple lines
 * @param {string[]} lines - Lines to filter
 * @param {string} [backend] - Backend name
 * @returns {string[]} Filtered lines
 */
export function filterLines(lines, backend = '') {
  const filter = createNoiseFilter(backend);
  return lines.filter(filter);
}

/**
 * Filter a text block (handles both string and array)
 * @param {string|string[]} input - Input to filter
 * @param {string} [backend] - Backend name
 * @returns {string} Filtered text
 */
export function filterOutput(input, backend = '') {
  const lines = Array.isArray(input) ? input : input.split('\n');
  return filterLines(lines, backend).join('\n');
}
