/**
 * Init module - Initialize codeagent skill in ~/.claude/skills/
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { fileURLToPath } from 'url';

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
 * Copy directory recursively
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 */
function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * List files in directory recursively
 * @param {string} dir - Directory path
 * @param {string} [prefix=''] - Path prefix for display
 * @returns {string[]}
 */
function listFiles(dir, prefix = '') {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const displayPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, displayPath));
    } else {
      files.push(displayPath);
    }
  }
  
  return files;
}

/**
 * Run init command
 * @param {Object} options - Init options
 * @param {boolean} [options.force=false] - Force overwrite without confirmation
 * @returns {Promise<void>}
 */
export async function runInit(options = {}) {
  const templateDir = getTemplateDir();
  const targetDir = getTargetDir();
  
  // Check if template directory exists
  if (!fs.existsSync(templateDir)) {
    console.error(`Error: Template directory not found: ${templateDir}`);
    process.exit(1);
  }
  
  // List files to be installed
  const files = listFiles(templateDir);
  console.log('Files to install:');
  for (const file of files) {
    console.log(`  - ${file}`);
  }
  console.log(`\nTarget directory: ${targetDir}`);
  
  // Check if target exists
  const targetExists = fs.existsSync(targetDir);
  
  if (targetExists && !options.force) {
    console.log('\nWarning: Target directory already exists.');
    const shouldOverwrite = await confirm('Do you want to overwrite?');
    
    if (!shouldOverwrite) {
      console.log('Aborted.');
      return;
    }
    
    // Remove existing directory
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  
  // Ensure parent directory exists
  const parentDir = path.dirname(targetDir);
  fs.mkdirSync(parentDir, { recursive: true });
  
  // Copy files
  copyDirSync(templateDir, targetDir);
  
  console.log('\nSuccessfully installed codeagent skill to:');
  console.log(`  ${targetDir}`);
}
