// lib/build.js - Core build system for the CMS (modified to use templates)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const contentProcessor = require('./content');
const templates = require('./templates');
const archives = require('./archives');
const tags = require('./tags');
const rss = require('./rss');
const special = require('./special');
const utils = require('./utils');
const log = require('./logger');

const SOCIAL_LOG = path.join(__dirname, '..', 'published-social.json');

function computeSocialStats(entry) {
  if (!entry?.networks) return null;
  const nets = Object.entries(entry.networks)
    .filter(([, d]) => d.postUrl)
    .map(([name, d]) => ({ name, url: d.postUrl, stats: d.stats }));
  if (!nets.length) return null;

  let replies = 0, likes = 0, boosts = 0;
  nets.forEach(({ stats }) => {
    if (!stats) return;
    replies += stats.replies || 0;
    likes += (stats.favourites || 0) + (stats.likes || 0);
    boosts += (stats.boosts || 0) + (stats.reposts || 0);
  });

  if (!replies && !likes && !boosts) return null;
  return { replies, likes, boosts, networks: nets };
}

// Paths to exclude from the build process
const excludedPaths = [
  'node_modules',
  '.git',
  '.env',
  '.DS_Store',
  'package.json',
  'package-lock.json'
];

// Track dependencies between pages
const pageDependencies = new Map();
// Track content hashes to detect changes
const contentHashes = new Map();

/**
 * Main build function that generates the entire site
 * @param {Object} config Configuration object
 * @param {boolean} fullRebuild Force full rebuild
 * @param {string} changedFile Path to the file that changed (if any)
 */
function buildSite(config, fullRebuild = false, changedFile = null) {
  const startTime = Date.now();
  const buildLabel = changedFile ? ` (${path.basename(changedFile)})` : fullRebuild ? ' (full rebuild)' : '';
  log.info(`Building${buildLabel}…`);
  
  const { CONTENT_DIR, BUILD_DIR, BUILD_MODE = 'production' } = config;
  
  // Create build directory if it doesn't exist
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, { recursive: true });
    fullRebuild = true; // Force full rebuild if build dir doesn't exist
  }

  // Clean CMS-generated directories before rebuild to remove stale files
  // (e.g. posts that moved date due to timezone fix, or renamed slugs)
  const cleanDirs = ['columns', 'topics'];
  cleanDirs.forEach(dir => {
    const dirPath = path.join(BUILD_DIR, dir);
    if (fs.existsSync(dirPath)) {
      log.log(`Cleaning ${dir}/…`);
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  });
  
  // Copy static source files (tracked in git under static/) to build directory
  const STATIC_SOURCE_DIR = path.resolve(path.join(__dirname, '..', 'static'));
  if (fs.existsSync(STATIC_SOURCE_DIR)) {
    const staticSourceFiles = utils.getAllStaticFiles(STATIC_SOURCE_DIR);
    staticSourceFiles.forEach(file => {
      const relPath = path.relative(STATIC_SOURCE_DIR, file);
      const outputPath = path.join(BUILD_DIR, relPath);
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.copyFileSync(file, outputPath);
    });
    log.log(`Copied ${staticSourceFiles.length} files from static/`);
  }
  
  // Find all markdown files (excluding unwanted paths)
  const files = utils.getAllMarkdownFiles(CONTENT_DIR)
    .filter(file => !excludedPaths.some(excluded => file.includes(excluded)));
  
  // Always do a full parse of all files for reliability
  log.log(`Processing ${files.length} markdown files…`);
  
  // Parse all files
  const allParsedPages = files.map(file => {
    // Always parse the file fresh
    const page = contentProcessor.parseMarkdownFile(file, CONTENT_DIR);
    
    // Calculate and store file hash to detect future changes
    const fileContent = fs.readFileSync(file, 'utf8');
    const fileHash = calculateHash(fileContent);
    contentHashes.set(file, fileHash);
    
    return page;
  });
  
  // Build dependency graph
  buildDependencyGraph(allParsedPages);
  
  // Apply filters based on environment
  let pages = allParsedPages;
  
  if (BUILD_MODE === 'production') {
    const now = new Date();
    pages = pages.filter(page =>
      page.meta.published === true &&
      !page.isDraft &&
      !(page.meta.saved_date && new Date(page.meta.saved_date) > now)
    );
  } else if (BUILD_MODE === 'preview') {
    pages = pages.filter(page => !page.isDraft);
  }
  // dev: no filtering — show everything
  
  // Attach social stats to pages that have been posted
  if (fs.existsSync(SOCIAL_LOG)) {
    const socialLog = JSON.parse(fs.readFileSync(SOCIAL_LOG, 'utf8'));
    const socialMap = new Map(socialLog.map(e => [e.path, e]));
    pages.forEach(page => {
      const entry = socialMap.get(page.path);
      if (entry) page.socialStats = computeSocialStats(entry);
    });
  }

  // Resolve wiki link placeholders now that all pages have their final paths
  log.log('Resolving wiki links…');
  contentProcessor.resolveWikiLinks(pages);

  // Collect all tags
  const allTags = tags.collectAllTags(pages);
  
  // Organize posts by date
  const postsByDate = archives.getPostsByDate(pages);
  
  // Track what files were generated
  const generatedFiles = new Set();
  
  // Generate individual content pages
  const buildStart = Date.now();
  let updatedPages = 0;
  
  log.log('Generating content pages…');

  pages.forEach(page => {
    const outputPath = path.join(BUILD_DIR, `${page.path}.html`);
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    log.log(`  ${page.path}`);
    
    // Render page with template using the templates module
    const html = templates.generatePageHtml(page, pages, allTags, postsByDate);
    fs.writeFileSync(outputPath, html);
    generatedFiles.add(outputPath);
    updatedPages++;
  });
  
  // Generate homepage if not already created as a content page
  const indexPath = path.join(BUILD_DIR, 'index.html');
  if (!pages.find(page => page.path === '/index')) {
    log.log('  /index');
    special.generateHomepage(pages, allTags, postsByDate, BUILD_DIR);
    generatedFiles.add(indexPath);
  }
  
  log.log('Generating tag pages…');
  tags.generateTagPages(pages, allTags, BUILD_DIR);

  log.log('Generating date archives…');
  archives.generateDateArchives(pages, postsByDate, BUILD_DIR);

  log.log('Generating RSS feed…');
  rss.generateRssFeed(pages, BUILD_DIR, config);

  log.log('Copying static files…');
  const staticFiles = utils.getAllStaticFiles(CONTENT_DIR)
    .filter(file => !excludedPaths.some(excluded => file.includes(excluded)));

  let copiedFiles = 0;
  staticFiles.forEach(file => {
    const relPath = path.relative(CONTENT_DIR, file);
    const outputPath = path.join(BUILD_DIR, relPath);
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.copyFileSync(file, outputPath);
    generatedFiles.add(outputPath);
    copiedFiles++;
    log.log(`  ${relPath}`);
  });
  
  log.log('Updating file timestamps…');
  const now = new Date();
  const allHtmlFiles = utils.getAllFilesWithExtension(BUILD_DIR, '.html');
  allHtmlFiles.forEach(file => {
    try {
      fs.utimesSync(file, now, now);
    } catch (err) {
      log.error(`Error updating timestamp for ${file}: ${err.message}`);
    }
  });

  const elapsed = Date.now() - startTime;
  const totalFiles = allParsedPages.length;
  const publishedCount = allParsedPages.filter(page => page.isPublished).length;
  const draftCount = allParsedPages.filter(page => page.isDraft).length;
  const unpublishedCount = allParsedPages.filter(page => !page.isPublished).length;
  const includedCount = pages.length;

  log.info(`Done in ${elapsed}ms · ${updatedPages} pages · ${copiedFiles} static files  [${BUILD_MODE}]`);
  log.info(`  ${publishedCount} published · ${draftCount} drafts · ${unpublishedCount} unpublished · ${includedCount} included`);
}

/**
 * Build the dependency graph between pages
 * @param {Array} pages All pages
 */
function buildDependencyGraph(pages) {
  // Reset the dependency map
  pageDependencies.clear();
  
  // Iterate through pages and build the dependency graph
  pages.forEach(page => {
    // For each link in the page, add the current page as a dependent
    if (page.links && page.links.length) {
      page.links.forEach(link => {
        if (!pageDependencies.has(link)) {
          pageDependencies.set(link, new Set());
        }
        pageDependencies.get(link).add(page.path);
      });
    }
  });
}

/**
 * Calculate a hash of the file content to detect changes
 * @param {string} content File content
 * @returns {string} Content hash
 */
function calculateHash(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

module.exports = {
  buildSite
};