// lib/content.js - Content processing functions with updated title handling

const fs = require('fs');
const path = require('path');
const marked = require('marked');
const markedFootnote = require('marked-footnote');
const frontMatter = require('front-matter');

marked.use({ html: true });
marked.use(markedFootnote.default ? markedFootnote.default() : markedFootnote());

/**
 * Parse a markdown file with frontmatter and process its content
 * @param {string} filePath Path to the markdown file
 * @param {string} contentDir Root content directory
 * @returns {Object} Processed page object
 */
function normaliseDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    // js-yaml parses bare YYYY-MM-DD as UTC midnight; extract UTC parts so the
    // authored date is preserved as local midnight regardless of server timezone
    return new Date(val.getUTCFullYear(), val.getUTCMonth(), val.getUTCDate());
  }
  const s = String(val).trim();
  // Bare date YYYY-MM-DD → construct as local midnight
  const bareDate = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (bareDate) {
    return new Date(parseInt(bareDate[1]), parseInt(bareDate[2]) - 1, parseInt(bareDate[3]));
  }
  // Datetime without timezone: add :00 (no Z) so JS treats it as local time
  const withSeconds = s.replace(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})$/, '$1:00');
  const d = new Date(withSeconds);
  return isNaN(d.getTime()) ? null : d;
}

function parseMarkdownFile(filePath, contentDir) {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const parsed = frontMatter(fileContent);

  // Extract tags if they exist
  const tags = parsed.attributes.tags || [];

  // Normalise all frontmatter dates into proper Date objects
  parsed.attributes.saved_date    = normaliseDate(parsed.attributes.saved_date || parsed.attributes.date);
  parsed.attributes.updated_date  = normaliseDate(parsed.attributes.updated_date);

  // Handle publication status - default to published unless explicitly set to false
  const isPublished = parsed.attributes.published !== false;

  // Get raw filename without extension for title fallback
  const filename = path.basename(filePath, '.md');

  // Updated title logic:
  // 1. If YAML title exists and is not empty, use it
  // 2. Otherwise use raw Markdown filename without adjustments
  // "none" means "no title" — preserve as null rather than falling back to filename
  // blank title: fields also parse as null in YAML, so only the explicit string "none" is the sentinel
  const rawTitle = parsed.attributes.title;
  const title = rawTitle === 'none' ? null : (rawTitle || filename);

  // Dates already normalised into Date objects above
  const savedDate = parsed.attributes.saved_date || null;
  const updatedDate = parsed.attributes.updated_date || null;
  const fileStat = fs.statSync(filePath);
  const fileModifiedDate = fileStat.mtime;
  const fileCreatedDate = fileStat.birthtime;

  // Get directory of the file relative to content root
  const relativeDir = path.dirname(filePath.replace(contentDir, ''));
  const relativeDir2 = relativeDir === '/' ? '' : relativeDir;

  // Normalize filename by converting to lowercase and replacing spaces with hyphens
  function normalizeFilename(filename) {
    return filename
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, ''); // Remove any non-alphanumeric chars except hyphens
  }

  // Generate path - with new logic for path and file YAML properties
  let relativePath;

  // 1. If path is specified in frontmatter, use that (highest precedence)
  if (parsed.attributes.path) {
    // Ensure it starts with a slash
    let customPath = parsed.attributes.path.startsWith('/') 
      ? parsed.attributes.path 
      : '/' + parsed.attributes.path;
    
    // Normalize the path
    customPath = customPath
      .toLowerCase()
      .replace(/\s+/g, '-');
    
    // Remove .html extension if present in the path
    if (customPath.endsWith('.html')) {
      customPath = customPath.slice(0, -5);
    }
    
    relativePath = customPath;
  }
  // 2. If file is specified but no path, use file property for filename in same directory
  else if (parsed.attributes.file) {
    // Normalize the filename
    const normalizedFile = normalizeFilename(parsed.attributes.file);
    
    // Combine with the directory
    relativePath = path.join(relativeDir2, normalizedFile);
    
    // Ensure it starts with a slash
    if (!relativePath.startsWith('/')) {
      relativePath = '/' + relativePath;
    }
  }
  // 3. Otherwise use the original file path and name
  else {
    // Get original filename without extension
    const origFilename = path.basename(filePath, '.md');
    
    // Normalize the filename
    const normalizedFile = normalizeFilename(origFilename);
    
    // Combine with the directory
    relativePath = path.join(relativeDir2, normalizedFile);
    
    // Ensure it starts with a slash
    if (!relativePath.startsWith('/')) {
      relativePath = '/' + relativePath;
    }
  }

  // Extract internal links (for backlinks feature)
  // 1. Look for markdown links: [text](link.md) or [text](/link) or [text](link)
  // 2. Look for WikiStyle links: [[link]] or [[/link]]
  const mdLinkRegex = /\[.*?\]\((\/[^)]+|[^/)]+?)(\.md)?\)/g;
  const wikiLinkRegex = /\[\[(?!\/)(.*?)(?:\.md)?\]\]|\[\[(\/.*?)(?:\.md)?\]\]/g;
  const wikiLinkAliasRegex = /\[\[([^\]|]+?)\|([^\]]+?)\]\]/g;

  const mdLinkMatches = parsed.body.matchAll(mdLinkRegex);
  const wikiLinkMatches = parsed.body.matchAll(wikiLinkRegex);

  // Extract link targets, normalize paths
  const links = [];

  // Process markdown links
  for (const match of mdLinkMatches) {
    let linkPath = match[1];
    
    // Remove .md extension if present
    if (linkPath.endsWith('.md')) {
      linkPath = linkPath.slice(0, -3);
    }
    
    // Add leading slash if missing
    if (!linkPath.startsWith('/')) {
      // Handle relative links based on current file location
      const currentDir = path.dirname(relativePath);
      if (currentDir === '/') {
        linkPath = '/' + linkPath;
      } else {
        linkPath = path.normalize(`${currentDir}/${linkPath}`);
      }
    }
    
    links.push(linkPath);
  }

  // Process WikiStyle links
  for (const match of wikiLinkMatches) {
    let linkPath = match[1] || match[2]; // match[1] is relative, match[2] is absolute
    
    // Remove .md extension if present
    if (linkPath.endsWith('.md')) {
      linkPath = linkPath.slice(0, -3);
    }
    
    // Add leading slash if missing (for relative links)
    if (!linkPath.startsWith('/')) {
      // Handle relative links based on current file location
      const currentDir = path.dirname(relativePath);
      if (currentDir === '/') {
        linkPath = '/' + linkPath;
      } else {
        linkPath = path.normalize(`${currentDir}/${linkPath}`);
      }
    }
    
    links.push(linkPath);
  }

  // Strip Obsidian %% comments %% (block and inline) before any other processing
  let processedContent = parsed.body
    .replace(/%%[\s\S]*?%%/g, '');

  // Convert intentional section breaks (blank line / spaces-only line / blank line)
  // into a hidden semantic hr
  processedContent = processedContent
    .replace(/\n[ \t]+\n/g, '\n<hr class="section-break">\n\n');

  // Handle Obsidian ![[...]] embeds:
  // - web-friendly images (jpg, jpeg, png, gif, webp, svg) → convert to standard markdown image
  // - everything else (pdf, mp4, etc.) → strip silently
  const webImageExts = /\.(jpe?g|png|gif|webp|svg)$/i;
  processedContent = processedContent.replace(/!\[\[([^\]]+)\]\]/g, (match, filename) => {
    const trimmed = filename.trim();
    if (webImageExts.test(trimmed)) {
      return `![${trimmed}](${trimmed})`;
    }
    return ''; // strip non-web embeds
  });

  // Transform content for WikiStyle links
  // Convert to placeholder markdown links — resolved to real paths after all pages are parsed
  // First handle aliased links: [[target|display text]]
  processedContent = processedContent
    .replace(wikiLinkAliasRegex, (match, target, display) => {
      const encodedTarget = encodeURIComponent(target.trim());
      return `[${display}](__wikilink__${encodedTarget})`;
    });
  // Then handle plain links: [[path]]
  processedContent = processedContent
    .replace(wikiLinkRegex, (match, relativePath, absolutePath) => {
      const linkPath = relativePath || absolutePath;
      const encodedPath = encodeURIComponent(linkPath.trim());
      return `[${linkPath}](__wikilink__${encodedPath})`;
    });

  // Replace horizontal rules for non-homepage files
  if (relativePath !== '/index') {
    // Replace all --- horizontal rules with *** horizontal rules
    processedContent = processedContent.replace(/^---\s*$/gm, '***');
  }

  // Straighten curly quotes only in syntax positions where marked needs ASCII delimiters:
  // markdown link/image (url "title") portions and inline HTML attributes.
  // Prose text keeps its smart quotes.
  const straightenQuotes = s => s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  processedContent = processedContent
    .replace(/(\]\()([^)]+)(\))/g, (_, a, inside, b) => a + straightenQuotes(inside) + b)
    .replace(/<[^>]+>/g, straightenQuotes);

  // Process Obsidian callouts into <aside> blocks
  processedContent = processCallouts(processedContent);

  // Column routing — if the file lives under content/columns/[name]/, 
  // reroute path to columns/[name]/YYYY/MM/DD/ using the post's date
  let columnName = null;
  const columnMatch = relativePath.match(/^\/columns\/([^/]+)\/(.+)$/);
  if (columnMatch && savedDate) {
    columnName = columnMatch[1];
    const dateObj = new Date(savedDate);
    const year = String(dateObj.getFullYear());
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const slug = columnMatch[2].toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    relativePath = `/columns/${columnName}/${year}/${month}/${day}/${slug}`;
  }

  // Split on +++ sidebar separator before parsing
  // Each chunk after the first becomes a sidebar section {heading, content}
  const sidebarSeparatorRegex = /\n[ \t]*\+\+\+[ \t]*\n/;
  const contentChunks = processedContent.split(sidebarSeparatorRegex);
  const mainChunk = contentChunks[0];
  const sidebarChunks = contentChunks.slice(1);

  const sidebarSections = sidebarChunks.map(chunk => {
    const headingMatch = chunk.match(/^##[ \t]+(.+?)[\r\n]/);
    const heading = headingMatch ? headingMatch[1].trim() : '';
    const body = headingMatch ? chunk.slice(headingMatch[0].length).trim() : chunk.trim();
    return { heading, content: typeset(marked.parse(body)) };
  });

  // Add default metadata for templates
  const meta = {
    ...parsed.attributes,
    title: title,
    saved_date: savedDate,
    updated_date: updatedDate,
    // Default site settings if not provided
    siteName: parsed.attributes.siteName || 'site',
    sectionName: parsed.attributes.sectionName || 'Blog',
    sectionUrl: parsed.attributes.sectionUrl || '/',
    sectionTitle: parsed.attributes.sectionTitle || 'Latest entries',
    sectionTagline: parsed.attributes.sectionTagline || '',
    // Author info
    author: parsed.attributes.author || '',
    authorUrl: parsed.attributes.authorUrl || '',
    authorTitle: parsed.attributes.authorTitle || '',
    // Social info
    socialHandle: parsed.attributes.socialHandle || '',
    socialUrl: parsed.attributes.socialUrl || '',
    socialTitle: parsed.attributes.socialTitle || '',
    // Other site info
    domainName: parsed.attributes.domainName || '.com',
    domainUrl: parsed.attributes.domainUrl || '',
    domainTitle: parsed.attributes.domainTitle || '',
    // Copyright info
    copyrightStart: parsed.attributes.copyrightStart || new Date().getFullYear(),
    location: parsed.attributes.location || '',
    locationUrl: parsed.attributes.locationUrl || ''
  };
  
  const renderedContent = typeset(marked.parse(mainChunk));

  if (!meta.description) {
    const firstPara = renderedContent.match(/<p>([\s\S]*?)<\/p>/);
    if (firstPara) {
      const text = firstPara[1].replace(/<[^>]+>/g, '').trim();
      meta.description = text.length > 160 ? text.slice(0, text.lastIndexOf(' ', 160)) + '…' : text;
    }
  }

  return {
    meta: meta,
    content: renderedContent,
    sidebarSections: sidebarSections.length > 0 ? sidebarSections : null,
    rawContent: processedContent,
    filename: filename,
    path: relativePath,
    lastModified: fileModifiedDate,
    createdAt: fileCreatedDate,
    tags: (Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim())),
    isDraft: parsed.attributes.draft === true,
    isPublished: isPublished,
    links: links,
    template: parsed.attributes.template || (parsed.attributes.category ? parsed.attributes.category : 'default')
  };
}

function typeset(html) {
  const straightenQuotes = s => s.replace(/[""]/g, '"').replace(/['']/g, "'");
  return html
    .replace(/ — /g, '&#8201;&#8212;&#8201;')
    .replace(/<[^>]+>/g, straightenQuotes)
    .replace(/<td>(\d{4}-\d{2}-\d{2})<\/td>/g, (_, iso) => {
      const [y, m, d] = iso.split('-').map(Number);
      const short = ['Jan.','Feb.','Mar.','Apr.','May','Jun.','Jul.','Aug.','Sep.','Oct.','Nov.','Dec.'];
      const long  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const label = y === new Date().getFullYear()
        ? `${short[m - 1]} ${d}`
        : `${short[m - 1]} ${d}, ${y}`;
      const title = `${long[m - 1]} ${d}, ${y}`;
      return `<td><time datetime="${iso}" title="${title}">${label}</time></td>`;
    });
}

/**
 * Convert a string to Title Case
 */
function toTitleCase(str) {
  return str.replace(/\S+/g, w => w.charAt(0).toUpperCase() + w.slice(1));
}

/**
 * Process Obsidian-style callouts into <aside> blocks.
 * Handles: > [!type] Title, foldable > [!type]+ (open) and > [!type]- (closed).
 * Must run after wikilink transforms so placeholders are preserved in body HTML.
 */
function processCallouts(text) {
  const lines = text.split('\n');
  const result = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const headerMatch = line.match(/^> \[!([^\]]+)\]([+-]?)\s*(.*)$/);

    if (headerMatch) {
      const type = headerMatch[1].trim().toLowerCase();
      const fold = headerMatch[2]; // '+', '-', or ''
      const titleRaw = headerMatch[3].trim();
      const title = titleRaw || toTitleCase(type);

      // Collect body lines (all subsequent lines starting with >)
      const bodyLines = [];
      i++;
      while (i < lines.length && /^>[ \t]?/.test(lines[i])) {
        bodyLines.push(lines[i].replace(/^>[ \t]?/, ''));
        i++;
      }

      const bodyText = bodyLines.join('\n').trim();
      const bodyHtml = bodyText ? marked.parse(bodyText) : '';

      let html;
      if (fold) {
        const openAttr = fold === '+' ? ' open' : '';
        html = `<aside class="callout callout-${type}"><details${openAttr}><summary><h2>${title}</h2></summary><div class="callout-content">${bodyHtml}</div></details></aside>`;
      } else {
        html = `<aside class="callout callout-${type}"><h2>${title}</h2><div class="callout-content">${bodyHtml}</div></aside>`;
      }

      result.push(html);
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join('\n');
}

/**
 * Helper function to generate a path from a title
 * @param {string} title Title to convert to a path
 * @returns {string} URL-friendly path
 */
function generatePathFromTitle(title) {
  return '/' + title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // Remove punctuation
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .trim();
}

/**
 * Find backlinks to a specific page
 * @param {Object} page Page to find backlinks for
 * @param {Array} allPages All pages to search
 * @returns {Array} Pages that link to the current page
 */
function findBacklinks(page, allPages) {
  return allPages.filter(otherPage => {
    return otherPage.links && otherPage.links.includes(page.path);
  });
}

/**
 * Find related articles based on shared tags
 * @param {Object} page Current page
 * @param {Array} allPages All pages to search
 * @returns {Array} Related pages
 */
function findRelatedArticles(page, allPages) {
  const relatedPages = [];
  
  // Exclude the current page
  const otherPages = allPages.filter(p => p.path !== page.path);
  
  // If the page has tags, find other pages with at least one tag in common
  if (page.tags && page.tags.length) {
    for (const otherPage of otherPages) {
      if (otherPage.tags && otherPage.tags.length) {
        const commonTags = page.tags.filter(tag => otherPage.tags.includes(tag));
        if (commonTags.length > 0) {
          relatedPages.push({
            page: otherPage,
            commonTags: commonTags.length
          });
        }
      }
    }
    
    // Sort by number of common tags (most to least)
    relatedPages.sort((a, b) => b.commonTags - a.commonTags);
    
    // Return just the page objects, limited to top 5
    return relatedPages.slice(0, 5).map(item => item.page);
  }
  
  return [];
}

/**
 * Find the chronological previous and next pages
 * @param {Object} page Current page
 * @param {Array} allPages All pages
 * @returns {Object} Object with prev and next properties
 */
function findPrevNextPages(page, allPages) {
  // Only process pages with dates
  if (!page.meta.saved_date) return null;
  
  const datedPages = allPages
    .filter(p => p.meta.saved_date && p.isPublished)
    .sort((a, b) => new Date(a.meta.saved_date) - new Date(b.meta.saved_date));
  
  const currentIndex = datedPages.findIndex(p => p.path === page.path);
  
  // If current page not found in dated pages, don't provide navigation
  if (currentIndex === -1) return null;
  
  return {
    prev: currentIndex > 0 ? datedPages[currentIndex - 1] : null,
    next: currentIndex < datedPages.length - 1 ? datedPages[currentIndex + 1] : null
  };
}


/**
 * Resolve wiki link placeholders across all pages.
 * Builds a lookup from original filenames (case-insensitive) to final paths,
 * then replaces __wikilink__<encoded-name> hrefs in each page's rendered HTML.
 * Call after all pages have been parsed and their paths finalized.
 * @param {Array} pages All parsed page objects
 */
function resolveWikiLinks(pages) {
  // Build lookup: lowercase title/filename -> final path
  const lookup = {};
  pages.forEach(page => {
    // Key by title (what Obsidian shows / what authors type in [[...]])
    if (page.meta.title) {
      lookup[page.meta.title.toLowerCase()] = page.path;
    }
    // Also key by original filename so [[Filename Without Extension]] resolves
    // even when the title has punctuation differences (e.g. title adds a colon)
    if (page.filename) {
      lookup[page.filename.toLowerCase()] = page.path;
    }
  });

  // Replace placeholders in rendered HTML
  const placeholderRegex = /__wikilink__([^"']+)/g;
  const resolveInHtml = html => html.replace(placeholderRegex, (match, encoded) => {
    const target = decodeURIComponent(encoded).toLowerCase();
    // Try full target first, then fall back to just the last path segment
    // (handles Obsidian full-path links like [[vault/path/to/Page Title|alias]])
    const resolved = lookup[target] || lookup[target.split('/').pop().trim()];
    if (resolved) {
      return resolved + '.html';
    }
    // Unresolved — leave as a root-relative slug so it doesn't 404 silently
    console.warn(`Wiki link unresolved: "${decodeURIComponent(encoded)}"`);
    return '/' + decodeURIComponent(encoded).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-/]/g, '');
  });
  pages.forEach(page => {
    if (page.content.includes('__wikilink__')) {
      page.content = resolveInHtml(page.content);
    }
    if (page.sidebarSections) {
      page.sidebarSections.forEach(section => {
        if (section.content.includes('__wikilink__')) {
          section.content = resolveInHtml(section.content);
        }
      });
    }
  });
}

module.exports = {
  parseMarkdownFile,
  resolveWikiLinks,
  generatePathFromTitle,
  findBacklinks,
  findRelatedArticles,
  findPrevNextPages
};