/**
 * Agent configuration management
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { expandHome } from './utils.mjs';

/**
 * @typedef {Object} AgentModelConfig
 * @property {string} backend - Backend name
 * @property {string} model - Model name
 * @property {string} promptFile - Prompt file path
 * @property {string} reasoningEffort - Reasoning effort level
 */

/**
 * @typedef {Object} ModelsConfig
 * @property {string} defaultBackend - Default backend
 * @property {string} defaultModel - Default model
 * @property {Object.<string, AgentModelConfig>} agents - Agent configurations
 */

/**
 * Default agent configurations
 */
export const DEFAULT_MODELS_CONFIG = {
  defaultBackend: 'opencode',
  defaultModel: 'opencode/grok-code',
  agents: {
    oracle: {
      backend: 'claude',
      model: 'claude-opus-4-5-20251101',
      promptFile: '',
      reasoningEffort: ''
    },
    librarian: {
      backend: 'claude',
      model: 'claude-sonnet-4-5-20250929',
      promptFile: '',
      reasoningEffort: ''
    },
    explore: {
      backend: 'opencode',
      model: 'opencode/grok-code',
      promptFile: '',
      reasoningEffort: ''
    },
    develop: {
      backend: 'codex',
      model: '',
      promptFile: '',
      reasoningEffort: ''
    },
    'frontend-ui-ux-engineer': {
      backend: 'gemini',
      model: '',
      promptFile: '',
      reasoningEffort: ''
    },
    'document-writer': {
      backend: 'gemini',
      model: '',
      promptFile: '',
      reasoningEffort: ''
    }
  }
};

/**
 * Cached models configuration
 * @type {ModelsConfig|null}
 */
let cachedConfig = null;

/**
 * Load models configuration from file
 * @returns {Promise<ModelsConfig>}
 */
export async function loadModelsConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = expandHome('~/.codeagent/models.json');

  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const userConfig = JSON.parse(content);

    // Merge with defaults
    cachedConfig = {
      defaultBackend: userConfig.defaultBackend || DEFAULT_MODELS_CONFIG.defaultBackend,
      defaultModel: userConfig.defaultModel || DEFAULT_MODELS_CONFIG.defaultModel,
      agents: {
        ...DEFAULT_MODELS_CONFIG.agents,
        ...userConfig.agents
      }
    };
  } catch (error) {
    // Use defaults if file doesn't exist or is invalid
    cachedConfig = { ...DEFAULT_MODELS_CONFIG };
  }

  return cachedConfig;
}

/**
 * Load models configuration synchronously (uses cached or defaults)
 * @returns {ModelsConfig}
 */
export function loadModelsConfigSync() {
  if (cachedConfig) {
    return cachedConfig;
  }
  return { ...DEFAULT_MODELS_CONFIG };
}

/**
 * Get agent configuration by name
 * @param {string} name - Agent name
 * @returns {AgentModelConfig}
 * @throws {Error} If agent not found
 */
export function getAgentConfig(name) {
  const config = loadModelsConfigSync();
  const agent = config.agents[name];

  if (!agent) {
    const available = Object.keys(config.agents).join(', ');
    const error = new Error(`Unknown agent: ${name}. Available: ${available}`);
    error.exitCode = 2;
    throw error;
  }

  return agent;
}

/**
 * Validate agent name format
 * @param {string} name - Agent name to validate
 * @returns {boolean}
 */
export function validateAgentName(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }
  // Agent names: alphanumeric, hyphens, underscores
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

/**
 * Get list of available agent names
 * @returns {string[]}
 */
export function getAvailableAgents() {
  const config = loadModelsConfigSync();
  return Object.keys(config.agents);
}

/**
 * Get default backend and model
 * @returns {{backend: string, model: string}}
 */
export function getDefaults() {
  const config = loadModelsConfigSync();
  return {
    backend: config.defaultBackend,
    model: config.defaultModel
  };
}

/**
 * Clear cached configuration (for testing)
 */
export function clearCache() {
  cachedConfig = null;
}
