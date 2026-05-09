// lib/utils.js - Utility functions (updated)

const fs = require('fs');
const log = require('./logger');
const path = require('path');

// Paths to exclude from processing
const defaultExcludedPaths = [
  'node_modules',
  '.git',
  '.env',
  '.DS_Store',
  'package.json',
  'package-lock.json'
];

/**
 * Get all markdown files in a directory (recursively)
 * @param {string} dir Directory to search
 * @param {Array<string>} excludedPaths Paths to exclude
 * @returns {Array<string>} Array of file paths
 */
function getAllMarkdownFiles(dir, excludedPaths = defaultExcludedPaths) {
  let results = [];
  
  try {
    const list = fs.readdirSync(dir);
    
    list.forEach(file => {
      // Skip excluded files and directories
      if (excludedPaths.some(excluded => file.includes(excluded))) {
        return;
      }
      
      const filePath = path.join(dir, file);
      let stat;
      try { stat = fs.statSync(filePath); } catch (e) { return; }

      if (stat && stat.isDirectory()) {
        // Recursively search directories
        results = results.concat(getAllMarkdownFiles(filePath, excludedPaths));
      } else if (path.extname(file) === '.md') {
        results.push(filePath);
      }
    });
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
  }
  
  return results;
}

/**
 * Get all files with a specific extension in a directory (recursively)
 * @param {string} dir Directory to search
 * @param {string} extension File extension (including the dot, e.g. '.html')
 * @param {Array<string>} excludedPaths Paths to exclude
 * @returns {Array<string>} Array of file paths
 */
function getAllFilesWithExtension(dir, extension, excludedPaths = defaultExcludedPaths) {
  let results = [];
  
  try {
    if (!fs.existsSync(dir)) {
      return results;
    }
    
    const list = fs.readdirSync(dir);
    
    list.forEach(file => {
      // Skip excluded files and directories
      if (excludedPaths.some(excluded => file.includes(excluded))) {
        return;
      }
      
      const filePath = path.join(dir, file);
      let stat;
      try { stat = fs.statSync(filePath); } catch (e) { return; }

      if (stat && stat.isDirectory()) {
        // Recursively search directories
        results = results.concat(getAllFilesWithExtension(filePath, extension, excludedPaths));
      } else if (path.extname(file) === extension) {
        results.push(filePath);
      }
    });
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
  }
  
  return results;
}

/**
 * Format a date to a string
 * @param {Date} date Date to format
 * @param {string} format Format string (simple)
 * @returns {string} Formatted date
 */
function formatDate(date, format = 'YYYY-MM-DD') {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day);
}

/**
 * Create directory recursively if it doesn't exist
 * @param {string} dirPath Directory path
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Check if a path should be excluded
 * @param {string} filePath Path to check
 * @param {Array<string>} excludedPaths Paths to exclude
 * @returns {boolean} True if the path should be excluded
 */
function shouldExcludePath(filePath, excludedPaths = defaultExcludedPaths) {
  return excludedPaths.some(excluded => filePath.includes(excluded));
}

/**
 * Clean a directory by removing any excluded files/folders
 * @param {string} dir Directory to clean
 * @param {Array<string>} excludedPaths Paths to exclude
 */
function cleanDirectory(dir, excludedPaths = defaultExcludedPaths) {
  try {
    if (!fs.existsSync(dir)) {
      return;
    }
    
    const items = fs.readdirSync(dir);
    
    items.forEach(item => {
      const itemPath = path.join(dir, item);
      
      if (shouldExcludePath(itemPath, excludedPaths)) {
        log.log(`Removing excluded item: ${itemPath}`);
        
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          fs.rmdirSync(itemPath, { recursive: true });
        } else {
          fs.unlinkSync(itemPath);
        }
      }
    });
    
    log.log(`Directory cleaned: ${dir}`);
  } catch (err) {
    console.error(`Error cleaning directory ${dir}:`, err);
  }
}

/**
 * Get file modification time as a timestamp
 * @param {string} filePath Path to the file
 * @returns {number} Modification time in milliseconds
 */
function getFileModTime(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.mtimeMs;
  } catch (err) {
    console.error(`Error getting file modification time for ${filePath}:`, err);
    return Date.now(); // Return current time as fallback
  }
}

/**
 * Get all non-markdown static files in a directory (recursively)
 * Skips .md files (handled by the Markdown pipeline) and excluded paths
 * @param {string} dir Directory to search
 * @param {Array<string>} excludedPaths Paths to exclude
 * @returns {Array<string>} Array of file paths
 */
function getAllStaticFiles(dir, excludedPaths = defaultExcludedPaths) {
  let results = [];

  try {
    const list = fs.readdirSync(dir);

    list.forEach(file => {
      if (excludedPaths.some(excluded => file.includes(excluded))) {
        return;
      }

      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat && stat.isDirectory()) {
        results = results.concat(getAllStaticFiles(filePath, excludedPaths));
      } else if (path.extname(file) !== '.md') {
        results.push(filePath);
      }
    });
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
  }

  return results;
}

module.exports = {
  getAllMarkdownFiles,
  getAllStaticFiles,
  getAllFilesWithExtension,
  formatDate,
  ensureDirectoryExists,
  shouldExcludePath,
  cleanDirectory,
  getFileModTime
};
