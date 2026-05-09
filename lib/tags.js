// lib/tags.js - Tag-related functions

const fs = require('fs');
const log = require('./logger');
const path = require('path');
const templates = require('./templates');
const siteConfig = require('./site-config');

/**
 * Collect all tags from pages
 * @param {Array} pages All pages
 * @returns {Array} Unique sorted tags
 */
function collectAllTags(pages) {
  const tagSet = new Set();
  
  pages.forEach(page => {
    if (page.tags && page.tags.length) {
      page.tags.forEach(tag => tagSet.add(tag));
    }
  });
  
  return Array.from(tagSet).sort();
}

/**
 * Scan the html5/topics directory to get all legacy topic slugs
 * @param {string} buildDir Output directory
 * @returns {Array} Array of legacy topic slugs
 */
function getLegacyTopics(buildDir) {
  const legacyTopicsDir = path.join(buildDir, 'html5', 'topics');
  
  if (!fs.existsSync(legacyTopicsDir)) {
    return [];
  }
  
  return fs.readdirSync(legacyTopicsDir)
    .filter(entry => {
      const entryPath = path.join(legacyTopicsDir, entry);
      return fs.statSync(entryPath).isDirectory();
    })
    .sort();
}

/**
 * Generate all tag pages
 * @param {Array} pages All pages
 * @param {Array} allTags All unique tags
 * @param {string} buildDir Output directory
 */
function generateTagPages(pages, allTags, buildDir) {
  log.log('Generating tag pages…');
  
  // Create topics directory
  const tagsDir = path.join(buildDir, 'topics');
  if (!fs.existsSync(tagsDir)) {
    fs.mkdirSync(tagsDir, { recursive: true });
  }
  
  // Get legacy topics from html5/topics/
  const legacyTopics = getLegacyTopics(buildDir);
  log.log(`Found ${legacyTopics.length} legacy topics in html5/topics/`);

  const archiveCounts = getArchiveTopicCounts(buildDir, legacyTopics);

  // Generate a page for each CMS tag
  allTags.forEach(tag => {
    const tagSlug = slugify(tag);
    const taggedPages = pages
      .filter(page => page.tags && page.tags.includes(tag))
      .sort((a, b) => new Date(b.meta.saved_date) - new Date(a.meta.saved_date));

    // Check if a matching legacy topic exists
    const hasLegacyTopic = legacyTopics.includes(tagSlug);
    const legacyTopicUrl = hasLegacyTopic ? `${siteConfig.archiveUrl}/topics/${tagSlug}/` : null;
    const legacyTopicCount = hasLegacyTopic ? (archiveCounts[tagSlug] || 0) : 0;

    log.log(`Tag '${tag}' has ${taggedPages.length} pages${hasLegacyTopic ? ' + legacy archive' : ''}`);

    // Create a page object for the template system
    const tagPage = {
      path: `/topics/${tagSlug}`,
      meta: {
        title: tag,
        description: `Content tagged with ${tag}`,
        template: 'topics',
        currentTag: tag,
        allTags: allTags,
        taggedPosts: taggedPages,
        legacyTopicUrl: legacyTopicUrl,
        hasLegacyTopic: hasLegacyTopic,
        legacyTopicCount: legacyTopicCount,
        relatedTags: getRelatedTags(tag, pages)
      },
      content: '',
      isDraft: false,
      isPublished: true,
      generated: true
    };

    // Render the page with the template system
    const html = templates.generatePageHtml(tagPage, pages, allTags, null);
    fs.writeFileSync(path.join(tagsDir, `${tagSlug}.html`), html);
  });
  
  // Generate tag index pages with different sort orders
  generateTagIndexPages(allTags, pages, tagsDir, legacyTopics, buildDir);
}

/**
 * Generate tag index pages with different sort orders
 * @param {Array} allTags All unique tags
 * @param {Array} pages All pages
 * @param {string} tagsDir Tags directory
 * @param {Array} legacyTopics Legacy topic slugs
 * @param {string} buildDir Build directory
 */
function generateTagIndexPages(allTags, pages, tagsDir, legacyTopics, buildDir) {
  const sortOptions = ['alpha', 'alpha-desc', 'count-desc', 'count-asc', 'newest', 'oldest'];
  const tagCounts = getTagCounts(pages, allTags);
  const archiveTopicCounts = getArchiveTopicCounts(buildDir, legacyTopics);
  const archiveTopicLastDates = getArchiveTopicLastDates(buildDir, legacyTopics);
  const tagLastDates = getTagLastDates(pages, allTags);

  // Build the CMS tag slugs set for easy lookup
  const cmsTagSlugs = new Set(allTags.map(tag => slugify(tag)));

  // Find archive-only topics (in html5 but not in CMS tags)
  const archiveOnlyTopics = legacyTopics.filter(slug => !cmsTagSlugs.has(slug));

  // Apply topic aliases: merge counts and dates from alias into canonical, then suppress alias
  const topicAliases = siteConfig.topicAliases || {};
  Object.entries(topicAliases).forEach(([alias, canonical]) => {
    if (archiveTopicCounts[alias]) {
      archiveTopicCounts[canonical] = (archiveTopicCounts[canonical] || 0) + archiveTopicCounts[alias];
    }
    const aliasDate = archiveTopicLastDates[alias];
    const canonDate = archiveTopicLastDates[canonical];
    if (aliasDate && (!canonDate || aliasDate > canonDate)) {
      archiveTopicLastDates[canonical] = aliasDate;
    }
  });
  const aliasedSlugs = new Set(Object.keys(topicAliases));
  const filteredArchiveOnlyTopics = archiveOnlyTopics.filter(slug => !aliasedSlugs.has(slug));

  // Combined counts: CMS count + archive count (for tags that exist in both)
  const combinedTagCounts = {};
  allTags.forEach(tag => {
    const slug = slugify(tag);
    combinedTagCounts[tag] = (tagCounts[tag] || 0) + (archiveTopicCounts[slug] || 0);
  });

  log.log(`Found ${archiveOnlyTopics.length} archive-only topics`);

  sortOptions.forEach(sortOrder => {
    const indexPage = {
      path: `/topics/index-${sortOrder}`,
      meta: {
        title: 'Topics',
        description: 'Browse all content by topic',
        template: 'topics-index',
        sortOrder: sortOrder,
        allTags: allTags,
        tagCounts: combinedTagCounts,
        archiveTopicCounts: archiveTopicCounts,
        archiveTopicLastDates: archiveTopicLastDates,
        tagLastDates: tagLastDates,
        archiveOnlyTopics: filteredArchiveOnlyTopics,  // Topics only in html5 (aliases excluded)
        legacyTopics: legacyTopics                    // All legacy topics (for merge detection)
      },
      content: '',
      isDraft: false,
      isPublished: true,
      generated: true
    };

    const html = templates.generatePageHtml(indexPage, pages, allTags, null);
    fs.writeFileSync(path.join(tagsDir, `index-${sortOrder}.html`), html);
    
    if (sortOrder === 'newest') {
      fs.writeFileSync(path.join(tagsDir, 'index.html'), html);
    }
  });
}

/**
 * Find tags that co-occur most frequently with a given tag
 * @param {string} tag The current tag
 * @param {Array} pages All pages
 * @param {number} limit Max tags to return
 * @returns {Array} Related tag names sorted by co-occurrence
 */
function getRelatedTags(tag, pages, limit = 8) {
  const taggedPages = pages.filter(p => p.tags && p.tags.includes(tag));
  const counts = {};
  taggedPages.forEach(p => {
    (p.tags || []).forEach(t => {
      if (t !== tag) counts[t] = (counts[t] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => t);
}

/**
 * Find the most recent post date for each tag
 * @param {Array} pages All pages
 * @param {Array} allTags All tags
 * @returns {Object} Map of tag → most recent Date
 */
function getTagLastDates(pages, allTags) {
  const dates = {};
  allTags.forEach(tag => {
    const tagged = pages.filter(p => p.tags && p.tags.includes(tag));
    const latest = tagged.reduce((best, p) => {
      const d = p.meta.saved_date ? new Date(p.meta.saved_date) : p.lastModified;
      return d && (!best || d > best) ? d : best;
    }, null);
    dates[tag] = latest;
  });
  return dates;
}

/**
 * Count tag occurrences in pages
 * @param {Array} pages All pages
 * @param {Array} allTags All tags
 * @returns {Object} Tag counts
 */
function getTagCounts(pages, allTags) {
  const tagCounts = {};

  allTags.forEach(tag => {
    tagCounts[tag] = pages.filter(page => page.tags && page.tags.includes(tag)).length;
  });

  return tagCounts;
}

/**
 * Count items in each archive topic's all.html by counting <li id=" occurrences
 * @param {string} buildDir Output directory
 * @param {Array} legacyTopics Array of legacy topic slugs
 * @returns {Object} Map of slug → count
 */
function getArchiveTopicCounts(buildDir, legacyTopics) {
  const counts = {};
  const topicsDir = path.join(buildDir, 'html5', 'topics');
  const itemRe = /<li id="(?!nav-)/g;

  legacyTopics.forEach(slug => {
    const src = _archiveTopicFile(topicsDir, slug);
    if (!src) { counts[slug] = 0; return; }
    const html = fs.readFileSync(src, 'utf8');
    counts[slug] = (html.match(itemRe) || []).length;
  });

  return counts;
}

/**
 * Find the most recent post date for each archive topic by scanning datetime attributes
 * @param {string} buildDir Output directory
 * @param {Array} legacyTopics Array of legacy topic slugs
 * @returns {Object} Map of slug → Date (or null)
 */
function getArchiveTopicLastDates(buildDir, legacyTopics) {
  const dates = {};
  const topicsDir = path.join(buildDir, 'html5', 'topics');
  const dateRe = /datetime="(\d{4}-\d{2}-\d{2})/g;

  legacyTopics.forEach(slug => {
    const src = _archiveTopicFile(topicsDir, slug);
    if (!src) { dates[slug] = null; return; }
    const html = fs.readFileSync(src, 'utf8');
    let latest = null;
    let m;
    while ((m = dateRe.exec(html)) !== null) {
      const d = new Date(m[1]);
      if (!latest || d > latest) latest = d;
    }
    dates[slug] = latest;
  });

  return dates;
}

/**
 * Resolve the best HTML source file for an archive topic
 */
function _archiveTopicFile(topicsDir, slug) {
  const dir = path.join(topicsDir, slug);
  const candidates = [
    path.join(dir, 'all.html'),
    path.join(dir, 'all'),
    path.join(dir, 'index.html')
  ];
  return candidates.find(f => fs.existsSync(f) && fs.statSync(f).isFile()) || null;
}

/**
 * Slugify a tag for URLs
 * @param {string} tag Tag to slugify
 * @returns {string} Slugified tag
 */
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

module.exports = {
  collectAllTags,
  generateTagPages,
  getLegacyTopics,
  getTagCounts,
  getArchiveTopicCounts,
  getArchiveTopicLastDates,
  getTagLastDates,
  slugify
};
