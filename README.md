# Chaseframe

A static site generator built with Node.js, Express, and EJS. Designed as a flat-file CMS that reads Markdown content with YAML frontmatter from an external directory (such as an Obsidian vault), processes it through configurable templates, and outputs static HTML.


## How it works

Chaseframe reads a directory of Markdown files, parses their YAML frontmatter for metadata (title, date, tags, template, category, path overrides), and renders them through EJS templates into static HTML. The build system generates individual pages, date-based archives (year/month/day), topic (tag) pages, per-column RSS feeds, and a content index.

Content is kept separate from the generator — the Markdown source directory is configured via environment variable, so the same build system can point at any content directory.

## Project structure

```
├── server.js           # Entry point: Express server, file watcher, routing
├── rebuild.js          # Clean rebuild script
├── lib/
│   ├── build.js        # Core build pipeline
│   ├── content.js      # Markdown/frontmatter parsing, path resolution
│   ├── templates.js    # EJS template rendering with base/child inheritance
│   ├── archives.js     # Date-based archive generation
│   ├── tags.js         # Topic/tag page generation
│   ├── rss.js          # RSS feed generation
│   ├── special.js      # Homepage, content index, sorted pages
│   ├── helpers.js      # Template helper functions (backlinks, related articles)
│   ├── utils.js        # File system utilities
│   └── site-config.js  # Global site configuration
├── templates/          # EJS templates
│   ├── base.ejs        # Base layout
│   ├── article.ejs
│   ├── list.ejs
│   ├── homepage.ejs
│   ├── archives.ejs
│   ├── topics.ejs
│   ├── topics-index.ejs
│   ├── column-index.ejs
│   ├── content-index.ejs
│   ├── year-archives.ejs
│   ├── month-archives.ejs
│   ├── day-archives.ejs
│   ├── static.ejs
│   └── partials/       # Reusable template fragments
└── public/             # Generated output (gitignored)
```

## Setup

**Requirements:** Node.js

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/crsaila/chaseframe.git
   cd chaseframe
   npm install
   ```

2. Create a `.env` file with your content directory and site settings:
   ```
   CONTENT_DIR=/path/to/your/markdown/content
   BUILD_DIR=./public
   SITE_URL=https://yoursite.com
   SITE_TITLE=Your Site
   SITE_DESCRIPTION=Your site description
   PREVIEW_MODE=false
   INCLUDE_UNPUBLISHED=false
   AUTO_REBUILD=true
   ```

3. Build and run:
   ```bash
   node server.js
   ```
   The server starts at `http://localhost:3000` and watches the content directory for changes.

For a clean rebuild:
```bash
node rebuild.js && node server.js
```

## Content format

Content files are Markdown with YAML frontmatter:

```markdown
---
title: My Article
saved_date: 2025-03-15
category:
  - article
tags:
  - web
  - design
template: article
published: true
---

Article content goes here.
```

Key frontmatter fields: `title`, `saved_date`, `updated_date`, `category` (always list format), `tags`, `template`, `published`, `draft`, `path` (custom URL override), `file` (custom filename), `description`.

## Features

- **Flat-file CMS** — no database, content lives as Markdown files
- **Obsidian-compatible** — reads from an Obsidian vault, strips embed syntax
- **Template inheritance** — child templates render into a base layout
- **Date archives** — browsable by year, month, and day
- **Topic pages** — auto-generated from tags with multiple sort options
- **RSS feeds** — per-column feed generation
- **Backlinks** — tracks internal links between pages
- **File watching** — auto-rebuilds on content changes during development
- **Footnotes** — via `marked-footnote`
- **Section breaks** — whitespace-only lines convert to `<hr>`
- **Config-driven** — site metadata, navigation, and URLs managed through `site-config.js` and environment variables

## Deployment

The generated `public/` directory contains static HTML that can be served by any web server. Production deployment uses Apache with `.htaccess` for routing.

## Licence

[CC BY-SA 4.0](http://creativecommons.org/licenses/by-sa/4.0/)
