// lib/templates.js - Template handling for the CMS with global variables

const path = require('path');
const log = require('./logger');
const fs = require('fs');
const ejs = require('ejs');

// Import site configuration
const siteConfig = require('./site-config');
const { hasCategory } = require('./helpers');

// Define template directory
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const PARTIALS_DIR = path.join(TEMPLATES_DIR, 'partials');

// Verify templates directory exists
if (!fs.existsSync(TEMPLATES_DIR)) {
  console.error(`ERROR: Templates directory not found at: ${TEMPLATES_DIR}`);
  console.error('Please create the templates directory and add your EJS template files.');
}

// Create partials directory if it doesn't exist
if (!fs.existsSync(PARTIALS_DIR)) {
  log.log(`Creating partials directory at: ${PARTIALS_DIR}`);
  fs.mkdirSync(PARTIALS_DIR, { recursive: true });
}

// Check for basic templates
const requiredTemplates = ['base.ejs', 'article.ejs', 'list.ejs', 'static.ejs', 'homepage.ejs'];
const missingTemplates = [];

requiredTemplates.forEach(file => {
  const filePath = path.join(TEMPLATES_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`WARNING: Template file ${file} not found at: ${filePath}`);
    missingTemplates.push(file);
  }
});

if (missingTemplates.length > 0) {
  console.warn(`Missing templates: ${missingTemplates.join(', ')}`);
}

// Check for partials
const requiredPartials = ['helpers.ejs', 'metadata.ejs', 'tags.ejs', 'article-header.ejs'];
const missingPartials = [];

requiredPartials.forEach(file => {
  const filePath = path.join(PARTIALS_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`WARNING: Partial template file ${file} not found at: ${filePath}`);
    missingPartials.push(file);
  }
});

if (missingPartials.length > 0) {
  console.warn(`Missing partials: ${missingPartials.join(', ')}`);
}

// Simplified helpers if main helpers module is unavailable
let helpers;
try {
  helpers = require('./helpers');
} catch (error) {
  console.warn('Helper module not found, using simplified helpers');
  helpers = {
    findBacklinks: () => [],
    findRelatedArticles: () => [],
    formatDate: (date) => date ? new Date(date).toLocaleDateString() : '',
  };
}

/**
 * Get posts for "On This Day" feature
 * @param {Array} pages All pages
 * @returns {Array} Posts from this day in previous years
 */
function getOnThisDayPosts(pages) {
  if (!pages || !Array.isArray(pages)) return [];
  
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  
  return pages
    .filter(page => {
      if (!page.meta.saved_date) return false;
      
      const postDate = new Date(page.meta.saved_date);
      return postDate.getMonth() + 1 === month && 
             postDate.getDate() === day && 
             postDate.getFullYear() < today.getFullYear();
    })
    .sort((a, b) => new Date(b.meta.saved_date) - new Date(a.meta.saved_date));
}

/**
 * Render a page with the appropriate template - implementing two-step rendering for inheritance
 */
function renderPage(page, allPages, allTags, postsByDate) {
  try {
    // Step 1: Determine which template to use based on page metadata
    const templateName = getTemplateForPage(page);
    
    // Step 2: Prepare template data - including global site configuration
    const templateData = {
      // Page-specific data
      page: page || {},
      allPages: allPages || [],
      allTags: allTags || {},
      postsByDate: postsByDate || {},
      backlinks: helpers.findBacklinks ? helpers.findBacklinks(page, allPages) : [],
      relatedArticles: helpers.findRelatedArticles ? helpers.findRelatedArticles(page, allPages) : [],
      helpers,
      config: getTemplateConfig(templateName),
      
      // Add global site configuration - makes it available in all templates
      site: siteConfig,
      
      // Add environment information
      env: {
        isDevelopment: process.env.NODE_ENV !== 'production',
        isProduction: process.env.NODE_ENV === 'production',
        buildTime: new Date()
      },
      
      // For "On This Day" posts if enabled
      onThisDayPosts: getOnThisDayPosts(allPages)
    };
    
    // Step 3: Get paths to the specific template and base template
    const specificTemplatePath = path.join(TEMPLATES_DIR, `${templateName}.ejs`);
    const baseTemplatePath = path.join(TEMPLATES_DIR, 'base.ejs');
    
    // Step 4: Check if specific template exists
    if (!fs.existsSync(specificTemplatePath)) {
      console.error(`Template not found: ${specificTemplatePath}`);
      
      // Try to use base template directly
      if (!fs.existsSync(baseTemplatePath)) {
        console.error('Base template also not found. Generating minimal HTML.');
        return generateMinimalHtml(page);
      }
      
      // Render with base template only
      console.warn(`Falling back to base template for ${page.path || 'unknown page'}.`);
      templateData.content = page.content || '';
      return renderTemplate(baseTemplatePath, templateData);
    }
    
    // Step 5: First render the specific template to get content
    const specificContent = renderTemplate(specificTemplatePath, templateData);
    
    // Check if the template is complete (has doctype/html/body) or needs to be wrapped in base
    const trimmed = specificContent.trim().toLowerCase();
    if (trimmed.startsWith('<!doctype') || 
        trimmed.startsWith('<html') ||
        trimmed.startsWith('<!--') && trimmed.includes('</html>')) {
      // The specific template is a complete HTML document, return it as is
      return specificContent;
    }
    
    // Step 6: Render with base template if needed
    if (fs.existsSync(baseTemplatePath)) {
      templateData.content = specificContent;
      return renderTemplate(baseTemplatePath, templateData);
    } else {
      // No base template, return specific content directly
      return specificContent;
    }
  } catch (error) {
    console.error('Error in renderPage:', error);
    return generateMinimalHtml(page);
  }
}

/**
 * Render a template file with data
 * @param {string} templatePath Path to template file
 * @param {Object} data Data to pass to template
 * @returns {string} Rendered HTML
 */
function renderTemplate(templatePath, data) {
  try {
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    return ejs.render(templateContent, data, {
      filename: templatePath,
      views: [TEMPLATES_DIR],
      rmWhitespace: false // Set to true to remove whitespace
    });
  } catch (error) {
    console.error(`Error rendering template ${templatePath}:`, error);
    throw error;
  }
}

/**
 * Generate minimal HTML when all templates fail
 * @param {Object} page Page object
 * @returns {string} Minimal HTML
 */
function generateMinimalHtml(page) {
  const title = page && page.meta && page.meta.title ? page.meta.title : 'Page';
  const content = page && page.content ? page.content : 'No content available';
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; padding: 1rem; max-width: 800px; margin: 0 auto; }
    h1 { border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
    pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="content">
    ${content}
  </div>
  <footer>
    <p><small>Generated with fallback template due to template error</small></p>
  </footer>
</body>
</html>`;
}

/**
 * Determine which template to use for a page
 * @param {Object} page Page object
 * @returns {string} Template name
 */
function getTemplateForPage(page) {
  if (!page) return 'base';
  
  // First check for explicit template in front matter
  if (page.meta && page.meta.template) {
    return page.meta.template;
  }
  
  // Use template based on path or category
  if (page.path === '/index' || page.path === '/') {
    return 'homepage';
  } else if (page.meta && hasCategory(page.meta.category, 'article')) {
    return 'article';
  } else if (page.meta && hasCategory(page.meta.category, 'list')) {
    return 'list';
  } else if (page.meta && hasCategory(page.meta.category, 'static')) {
    return 'static';
  }
  
  // Default template if nothing else matches
  return 'base';
}

/**
 * Get template configuration
 * @param {string} templateName Template name
 * @returns {Object} Template configuration
 */
function getTemplateConfig(templateName) {
  // Default configuration
  const defaultConfig = {
    showDate: true,
    showTags: true,
    showBacklinks: true,
    showRelated: true,
    showToc: false,
    showOnThisDay: false
  };
  
  // Template-specific configurations
  const templateConfigs = {
    article: {
      showDate: true,
      showTags: true,
      showBacklinks: true,
      showRelated: true,
      showToc: false
    },
    static: {
      showDate: false,
      showTags: true,
      showBacklinks: true,
      showRelated: false,
      showToc: true
    },
    list: {
      showDate: true,
      showTags: true,
      showBacklinks: false,
      showRelated: false,
      showToc: false
    },
    homepage: {
      showDate: true,
      showTags: true,
      showBacklinks: false,
      showRelated: false,
      showToc: false,
      showOnThisDay: true
    }
  };
  
  return templateConfigs[templateName] || defaultConfig;
}

/**
 * Generate HTML for a page
 */
function generatePageHtml(page, allPages, allTags, postsByDate) {
  try {
    const templateName = getTemplateForPage(page);
    log.log(`For page ${page.path || 'unknown'}, using template: ${templateName}`);
    
    return renderPage(page, allPages, allTags, postsByDate);
  } catch (error) {
    console.error('Error in generatePageHtml:', error);
    return generateMinimalHtml(page);
  }
}

module.exports = {
  generatePageHtml,
  renderPage,
  getTemplateForPage,
  getTemplateConfig,
  getOnThisDayPosts,
  TEMPLATES_DIR
};