/**
 * Backend implementations for different AI CLI tools
 */

/**
 * @typedef {Object} Backend
 * @property {() => string} name - Get backend name
 * @property {() => string} command - Get command name
 * @property {(config: object, targetArg: string) => string[]} buildArgs - Build command arguments
 */

/**
 * Codex backend implementation
 */
class CodexBackend {
  name() {
    return 'codex';
  }

  command() {
    return 'codex';
  }

  buildArgs(config, targetArg) {
    const args = ['e', '-C', config.workDir || process.cwd(), '--json'];

    if (config.sessionId) {
      args.push('-r', config.sessionId);
    }

    if (config.model) {
      args.push('-m', config.model);
    }

    if (config.reasoningEffort) {
      args.push('--reasoning-effort', config.reasoningEffort);
    }

    if (config.skipPermissions) {
      args.push('--full-auto');
    }

    args.push(targetArg);
    return args;
  }
}

/**
 * Claude backend implementation
 */
class ClaudeBackend {
  name() {
    return 'claude';
  }

  command() {
    return 'claude';
  }

  buildArgs(config, targetArg) {
    const args = ['-p', '--output-format', 'stream-json'];

    if (config.skipPermissions) {
      args.push('--dangerously-skip-permissions');
    }

    if (config.model) {
      args.push('--model', config.model);
    }

    if (config.sessionId) {
      args.push('-r', config.sessionId);
    }

    // Disable settings source to prevent infinite recursion
    args.push('--disable-settings-source');

    args.push(targetArg);
    return args;
  }
}

/**
 * Gemini backend implementation
 */
class GeminiBackend {
  name() {
    return 'gemini';
  }

  command() {
    return 'gemini';
  }

  buildArgs(config, targetArg) {
    const args = ['-o', 'stream-json', '-y'];

    if (config.model) {
      args.push('-m', config.model);
    }

    if (config.sessionId) {
      args.push('-r', config.sessionId);
    }

    args.push(targetArg);
    return args;
  }
}

/**
 * Opencode backend implementation
 */
class OpencodeBackend {
  name() {
    return 'opencode';
  }

  command() {
    return 'opencode';
  }

  buildArgs(config, targetArg) {
    const args = ['run', '--format', 'json'];

    if (config.model) {
      args.push('-m', config.model);
    }

    if (config.sessionId) {
      args.push('-s', config.sessionId);
    }

    args.push(targetArg);
    return args;
  }
}

/**
 * Backend registry
 */
export const backends = {
  codex: new CodexBackend(),
  claude: new ClaudeBackend(),
  gemini: new GeminiBackend(),
  opencode: new OpencodeBackend()
};

/**
 * Select a backend by name
 * @param {string} name - Backend name
 * @returns {Backend}
 * @throws {Error} If backend not found
 */
export function selectBackend(name) {
  const backend = backends[name?.toLowerCase()];
  if (!backend) {
    const available = Object.keys(backends).join(', ');
    const error = new Error(`Unknown backend: ${name}. Available: ${available}`);
    error.exitCode = 2;
    throw error;
  }
  return backend;
}

/**
 * Get list of available backend names
 * @returns {string[]}
 */
export function getAvailableBackends() {
  return Object.keys(backends);
}
