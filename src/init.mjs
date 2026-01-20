/**
 * Init module - Initialize codeagent skill in ~/.claude/skills/
 * T4.2: All file operations converted to async
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import { DEFAULT_MODELS_CONFIG } from './agent-config.mjs';
import { expandHome } from './utils.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get the source template directory path
 * @returns {string}
 */
function getTemplateDir() {
  return path.resolve(__dirname, '../templates/skills/codeagent');
}

/**
 * Get the target directory path
 * @returns {string}
 */
function getTargetDir() {
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  return path.join(homeDir, '.claude', 'skills', 'codeagent');
}

/**
 * Get the models config file path
 * @returns {string}
 */
function getModelsConfigPath() {
  return expandHome('~/.codeagent/models.json');
}

/**
 * Prompt user for confirmation
 * @param {string} question - The question to ask
 * @returns {Promise<boolean>}
 */
async function confirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Copy directory recursively (async version)
 * T4.2: Converted from sync to async
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 */
async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  // Process entries concurrently for better performance
  await Promise.all(entries.map(async (entry) => {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }));
}

/**
 * List files in directory recursively (async version)
 * T4.2: Converted from sync to async
 * @param {string} dir - Directory path
 * @param {string} [prefix=''] - Path prefix for display
 * @returns {Promise<string[]>}
 */
async function listFiles(dir, prefix = '') {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const displayPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    
    if (entry.isDirectory()) {
      const subFiles = await listFiles(fullPath, displayPath);
      files.push(...subFiles);
    } else {
      files.push(displayPath);
    }
  }
  
  return files;
}

/**
 * Check if path exists (async wrapper)
 * T4.2: Async existence check
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>}
 */
async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write default models config to ~/.codeagent/models.json
 * @param {Object} options - Write options
 * @param {boolean} [options.force=false] - Force overwrite if file exists
 * @returns {Promise<{path: string, skipped: boolean}>}
 */
async function writeDefaultModelsConfig(options = {}) {
  const configPath = getModelsConfigPath();
  const configDir = path.dirname(configPath);
  const exists = await pathExists(configPath);

  if (exists && !options.force) {
    console.log(`\nWarning: Models config already exists: ${configPath}`);
    const shouldOverwrite = await confirm('Do you want to overwrite?');
    if (!shouldOverwrite) {
      console.log('Models config skipped.');
      return { path: configPath, skipped: true };
    }
  }

  await fs.mkdir(configDir, { recursive: true });
  const content = JSON.stringify(DEFAULT_MODELS_CONFIG, null, 2);
  await fs.writeFile(configPath, `${content}\n`, 'utf-8');
  return { path: configPath, skipped: false };
}

/**
 * Run init command
 * T4.2: All file operations converted to async
 * @param {Object} options - Init options
 * @param {boolean} [options.force=false] - Force overwrite without confirmation
 * @returns {Promise<void>}
 */
export async function runInit(options = {}) {
  const templateDir = getTemplateDir();
  const targetDir = getTargetDir();
  
  // Check if template directory exists
  if (!await pathExists(templateDir)) {
    console.error(`Error: Template directory not found: ${templateDir}`);
    process.exit(1);
  }
  
  // List files to be installed
  const files = await listFiles(templateDir);
  console.log('Files to install:');
  for (const file of files) {
    console.log(`  - ${file}`);
  }
  console.log(`\nTarget directory: ${targetDir}`);
  
  // Check if target exists
  const targetExists = await pathExists(targetDir);
  
  if (targetExists && !options.force) {
    console.log('\nWarning: Target directory already exists.');
    const shouldOverwrite = await confirm('Do you want to overwrite?');
    
    if (!shouldOverwrite) {
      console.log('Aborted.');
      return;
    }
    
    // Remove existing directory
    await fs.rm(targetDir, { recursive: true, force: true });
  }
  
  // Ensure parent directory exists
  const parentDir = path.dirname(targetDir);
  await fs.mkdir(parentDir, { recursive: true });
  
  // Copy files
  await copyDir(templateDir, targetDir);
  
  console.log('\nSuccessfully installed codeagent skill to:');
  console.log(`  ${targetDir}`);

  const modelsResult = await writeDefaultModelsConfig({ force: options.force });
  if (!modelsResult.skipped) {
    console.log('\nDefault models config written to:');
    console.log(`  ${modelsResult.path}`);
  }
}
