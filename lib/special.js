// lib/special.js - Special page generation functions

const fs = require('fs');
const log = require('./logger');
const path = require('path');
const templates = require('./templates');
const archives = require('./archives');
const tags = require('./tags');
const { hasCategory } = require('./helpers');

/**
 * Generate the homepage
 * @param {Array} pages All pages
 * @param {Array} allTags All tags
 * @param {Object} postsByDate Posts organized by date
 * @returns {string} HTML for homepage
 */
function generateHomepage(pages, allTags, postsByDate, buildDir) {
  log.log('Generating homepage…');
  
  // Get "On This Day" posts
  const onThisDayPosts = templates.getOnThisDayPosts(pages);
  
  // Get recent articles
  const recentArticles = getRecentArticles(pages, 5);
  
  // Get popular tags from recent articles
  const popularTags = getPopularTags(pages, 12, 30);
  
  // Create a page object for the homepage
  const homePage = {
    path: '/index',
    meta: {
      title: 'Home',
      description: 'Welcome to my website',
      template: 'homepage',
      welcomeTitle: 'Welcome',
      welcomeText: 'This is my personal website and blog.',
      limit: 5,
      showArchiveLink: true,
      archiveUrl: '/archives/'
    },
    content: '<p>This is the homepage content.</p>',
    isDraft: false,
    isPublished: true,
    generated: true
  };
  
  // Add custom data for the template
  const templateData = {
    page: homePage,
    allPages: pages,
    allTags: allTags,
    postsByDate: postsByDate,
    onThisDayPosts: onThisDayPosts,
    recentArticles: recentArticles,
    popularTags: popularTags,
    config: {
      showOnThisDay: true
    }
  };
  
  // Render the homepage with the template system
  const html = templates.renderPage(homePage, pages, allTags, postsByDate);
  fs.writeFileSync(path.join(buildDir, 'index.html'), html);
  
  log.log('Homepage generated successfully');
}

/**
 * Generate the content index page
 * @param {Array} pages All pages
 * @param {Object} customization Optional customization page
 * @param {string} buildDir Output directory
 */
function generateContentIndexPage(pages, customization, buildDir) {
  log.log('Generating content index page…');
  
  // Create content directory if it doesn't exist
  const contentDir = path.join(buildDir, 'content');
  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir, { recursive: true });
  }
  
  // Sort pages by date (newest first) then by title
  const sortedPages = [...pages]
    .sort((a, b) => {
      if (a.meta.saved_date && b.meta.saved_date) {
        return new Date(b.meta.saved_date) - new Date(a.meta.saved_date);
      } else if (a.meta.saved_date) {
        return -1;
      } else if (b.meta.saved_date) {
        return 1;
      } else {
        return (a.meta.title || '').localeCompare(b.meta.title || '');
      }
    });
  
  // Get custom title and content if available
  const title = customization ? (customization.meta.title || 'All Content') : 'All Content';
  const description = customization ? (customization.meta.description || '') : '';
  const content = customization ? customization.content : '';
  
  // Create a page object for the content index
  const contentIndexPage = {
    path: '/content',
    meta: {
      title: title,
      description: description,
      template: 'content-index',
      contentItems: sortedPages
    },
    content: content,
    isDraft: false,
    isPublished: true
  };
  
  // Render the page with the template system
  const html = templates.generatePageHtml(contentIndexPage, pages, null, null);
  fs.writeFileSync(path.join(contentDir, 'index.html'), html);
  
  log.log('Content index page generated successfully');
}

/**
 * Generate sorted archive pages
 * @param {Array} pages All pages
 * @param {Object} postsByDate Posts organized by date
 * @param {string} buildDir Output directory
 */
function generateSortedArchivePages(pages, postsByDate, buildDir) {
  // This is now handled by the archives.generateDateArchives function
  // which creates the sorted versions directly
  log.log('Sorted archive pages are now generated in archives.js');
}

/**
 * Generate sorted tag pages
 * @param {Array} allTags All tags
 * @param {string} buildDir Output directory
 */
function generateSortedTagPages(allTags, buildDir, pages) {
  // This is now handled by the tags.generateTagPages function
  // which creates the sorted tag index pages directly
  log.log('Sorted tag pages are now generated in tags.js');
}

/**
 * Get recent articles for homepage
 * @param {Array} pages All pages
 * @param {number} count Maximum number of articles to return
 * @returns {Array} Recent articles
 */
function getRecentArticles(pages, count = 5) {
  return pages
    .filter(page => 
      page.isPublished && 
      !page.isDraft && 
      hasCategory(page.meta.category, 'article')
    )
    .sort((a, b) => {
      const dateA = a.meta.saved_date ? new Date(a.meta.saved_date) : a.lastModified;
      const dateB = b.meta.saved_date ? new Date(b.meta.saved_date) : b.lastModified;
      const diff = dateB - dateA;
      if (diff !== 0) return diff;
      // Same saved_date — use file creation time as tiebreaker (newest first)
      if (a.createdAt && b.createdAt) return b.createdAt - a.createdAt;
      return 0;
    })
    .slice(0, count);
}

/**
 * Get most common tags from recent articles
 * @param {Array} pages All pages
 * @param {number} maxTags Maximum number of tags to return
 * @param {number} maxDays Maximum age of posts to consider
 * @returns {Array} Popular tags with counts
 */
function getPopularTags(pages, maxTags = 12, maxDays = 30) {
  // Calculate date threshold (past month)
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - maxDays);
  
  // Get recent articles with the category 'article'
  const recentArticles = pages.filter(page => {
    // Must be an article
    if (!hasCategory(page.meta.category, 'article') || !page.isPublished || page.isDraft) {
      return false;
    }
    
    // Must be recent
    const pageDate = page.meta.saved_date ? new Date(page.meta.saved_date) : page.lastModified;
    return pageDate >= threshold;
  });
  
  // Count tag occurrences
  const tagCounts = {};
  recentArticles.forEach(article => {
    if (article.tags && article.tags.length) {
      article.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });
  
  // Convert to array and sort by count
  const popularTags = Object.keys(tagCounts)
    .map(tag => ({ tag, count: tagCounts[tag] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxTags);
  
  return popularTags;
}

/**
 * Generate status labels for navigation items
 * @param {Object} page Page object
 * @returns {string} HTML status label
 */
function generateStatusLabel(page) {
  if (!page.isPublished) {
    return '<span class="nav-unpublished-label" aria-label="Unpublished content">(Unpublished)</span>';
  } else if (page.isDraft) {
    return '<span class="nav-draft-label" aria-label="Draft content">(Draft)</span>';
  }
  return '';
}

module.exports = {
  generateHomepage,
  generateContentIndexPage,
  generateSortedArchivePages,
  generateSortedTagPages,
  getRecentArticles,
  getPopularTags,
  generateStatusLabel
};