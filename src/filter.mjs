/**
 * Output noise filtering
 */

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
 * @param {string} [backend] - Backend name for backend-specific filtering
 * @returns {function(string): boolean} Filter function that returns true if line should be kept
 */
export function createNoiseFilter(backend = '') {
  let patterns = ALL_NOISE_PATTERNS;

  // Use backend-specific patterns if specified
  if (backend === 'gemini') {
    patterns = GEMINI_NOISE_PATTERNS;
  } else if (backend === 'codex') {
    patterns = CODEX_NOISE_PATTERNS;
  }

  return (line) => !matchesAny(line, patterns);
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
