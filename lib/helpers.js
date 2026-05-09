// lib/helpers.js - Helper functions for templates

/**
 * Format a date string
 * @param {string|Date} date Date to format
 * @param {string} format Format string (not used, always returns locale string)
 * @returns {string} Formatted date
 */
function formatDate(date, format) {
  if (!date) return '';
  try {
    return new Date(date).toLocaleDateString();
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
}

/**
 * Check whether a page's category field contains a given value.
 * Handles both array format (category:\n  - article) and
 * string format (category: article) from YAML frontmatter.
 * @param {string|Array|undefined} category The category field value
 * @param {string} value The category to check for
 * @returns {boolean}
 */
function hasCategory(category, value) {
  if (!category) return false;
  return Array.isArray(category) ? category.includes(value) : category === value;
}

/**
 * Find all pages that link to the current page
 * @param {Object} page Current page
 * @param {Array} allPages All pages
 * @returns {Array} Pages that link to the current page
 */
function findBacklinks(page, allPages) {
  if (!page || !page.path || !allPages || !Array.isArray(allPages)) {
    return [];
  }

  return allPages.filter(otherPage => {
    return otherPage.links && 
           Array.isArray(otherPage.links) && 
           otherPage.links.includes(page.path);
  }).map(linkingPage => ({
    path: linkingPage.path,
    title: linkingPage.meta && linkingPage.meta.title ? 
           linkingPage.meta.title : linkingPage.path
  }));
}

/**
 * Find related articles based on tags
 * @param {Object} page Current page
 * @param {Array} allPages All pages
 * @returns {Array} Related pages
 */
function findRelatedArticles(page, allPages) {
  if (!page || !page.meta || !page.meta.tags || !allPages || !Array.isArray(allPages)) {
    return [];
  }

  // Skip if page has no tags
  if (!Array.isArray(page.meta.tags) || page.meta.tags.length === 0) {
    return [];
  }

  // Find pages that share tags with the current page
  return allPages
    .filter(otherPage => {
      // Skip the current page
      if (otherPage.path === page.path) return false;
      
      // Skip pages without tags
      if (!otherPage.meta || !otherPage.meta.tags || !Array.isArray(otherPage.meta.tags)) {
        return false;
      }
      
      // Check if there's any tag overlap
      return otherPage.meta.tags.some(tag => page.meta.tags.includes(tag));
    })
    .map(relatedPage => ({
      path: relatedPage.path,
      title: relatedPage.meta && relatedPage.meta.title ? 
             relatedPage.meta.title : relatedPage.path,
      // Count how many tags match for sorting by relevance
      relevance: relatedPage.meta.tags.filter(tag => 
                 page.meta.tags.includes(tag)).length
    }))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5); // Limit to top 5 related articles
}

/**
 * Clean and normalize a tag
 * @param {string} tag Tag to clean
 * @returns {string} Cleaned tag
 */
function cleanTag(tag) {
  if (!tag || typeof tag !== 'string') return '';
  
  return tag
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Get excerpt from content
 * @param {string} content Content
 * @param {number} length Max length
 * @returns {string} Excerpt
 */
function getExcerpt(content, length = 150) {
  if (!content || typeof content !== 'string') return '';
  
  // Remove HTML tags
  const text = content.replace(/<[^>]*>/g, '');
  
  // Truncate to length
  if (text.length <= length) return text;
  
  // Find last space before max length
  const lastSpace = text.lastIndexOf(' ', length);
  return text.substring(0, lastSpace) + '…';
}

module.exports = {
  formatDate,
  hasCategory,
  findBacklinks,
  findRelatedArticles,
  cleanTag,
  getExcerpt
};