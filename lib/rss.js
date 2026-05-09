// lib/rss.js - RSS feed generation

const fs = require('fs');
const log = require('./logger');
const path = require('path');
const siteConfig = require('./site-config');

function hasCategory(page, cat) {
  const c = page.meta && page.meta.category;
  if (!c) return false;
  return Array.isArray(c) ? c.includes(cat) : c === cat;
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildFeed({ title, description, siteUrl, feedUrl, pages }) {
  const now = new Date().toUTCString();

  let xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>${escapeXml(title)}</title>
  <link>${siteUrl}</link>
  <description>${escapeXml(description)}</description>
  <language>en-ca</language>
  <lastBuildDate>${now}</lastBuildDate>
  <atom:link href="${feedUrl}" rel="self" type="application/rss+xml" />
`;

  pages.forEach(page => {
    const pageUrl = `${siteUrl}${page.path}.html`;
    const pageTitle = escapeXml(page.meta.title || page.path);
    const pubDate = new Date(page.meta.saved_date).toUTCString();
    const fullContent = page.content || '';

    xml += `
  <item>
    <title>${pageTitle}</title>
    <link>${pageUrl}</link>
    <pubDate>${pubDate}</pubDate>
    <guid isPermaLink="true">${pageUrl}</guid>
    <content:encoded><![CDATA[${fullContent}]]></content:encoded>
  </item>`;
  });

  xml += `\n</channel>\n</rss>`;
  return xml;
}

function generateRssFeed(pages, buildDir, config) {
  log.log('Generating RSS feeds…');

  const siteUrl = siteConfig.siteUrl.replace(/\/$/, '');
  const siteTitle = siteConfig.siteName;
  const siteDescription = siteConfig.siteDescription;

  const isArticle = p =>
    hasCategory(p, 'article') &&
    p.isPublished &&
    p.meta.saved_date;

  // ── Per-column feeds ──
  const columnMap = {};
  pages.filter(isArticle).forEach(page => {
    const m = page.path.match(/^\/columns\/([^/]+)\//);
    if (m) {
      const col = m[1];
      if (!columnMap[col]) columnMap[col] = [];
      columnMap[col].push(page);
    }
  });

  Object.entries(columnMap).forEach(([col, colPages]) => {
    const sorted = colPages
      .sort((a, b) => new Date(b.meta.saved_date) - new Date(a.meta.saved_date))
      .slice(0, 20);

    const colDir = path.join(buildDir, 'columns', col);
    if (!fs.existsSync(colDir)) fs.mkdirSync(colDir, { recursive: true });

    const colConfig = siteConfig.columns[col] || {};
    const colTitle = colConfig.title || sorted[0]?.meta.sectionName || col.toUpperCase();
    const colDescription = colConfig.description
      ? colConfig.description.replace(/<[^>]+>/g, '')
      : `Posts from ${colTitle}`;
    const feedUrl = `${siteUrl}/columns/${col}/rss.xml`;

    fs.writeFileSync(
      path.join(colDir, 'rss.xml'),
      buildFeed({
        title: `${siteTitle} — ${colTitle}`,
        description: colDescription,
        siteUrl,
        feedUrl,
        pages: sorted
      })
    );

    log.log(`RSS feed generated: /columns/${col}/rss.xml`);
  });

  log.log('RSS feeds generated successfully');
}

module.exports = { generateRssFeed };
