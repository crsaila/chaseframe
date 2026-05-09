# chaseframe — Project Guide

## Overview
Custom Node.js markdown CMS. Content is authored in Markdown with YAML frontmatter, processed through a `lib/` pipeline, rendered with EJS templates, and output to `public/`. See README.md for setup instructions.

## Key directories
- `content/` — markdown source files
- `static/` — git-tracked source assets (CSS, favicons, etc.) — supply your own
- `public/` — gitignored build output; never edit directly
- `lib/` — build pipeline modules
- `templates/` — EJS templates and partials

## Build
- `node rebuild.js` (or `npm run build`) regenerates `public/` from `content/` and `static/`
- `static/` is copied to `public/` on every build

## Configuration
- `lib/site-config.js` — site name, author, navigation, columns, social links
- `.env` (copy from `.env.example`) — content directory, build settings, social API keys

## Template system
- `template:` frontmatter key selects the EJS template (default: `default`)
- `static-sidebar` — two-column layout for static pages; no date/metadata footer
- `+++` on its own line separates main content from sidebar sections
- `## Heading` immediately after `+++` becomes the sidebar section heading
- Multiple `+++` separators = multiple sidebar sections

## Content conventions
- Wiki-style links `[[Page Title]]` are resolved after all pages are parsed
- `[[target|display text]]` for aliased wiki links
- `title: none` suppresses the page title prefix in `<title>`
- Column posts live under `content/columns/[name]/` and are routed to `/columns/[name]/YYYY/MM/DD/slug`
- `published: false` hides a page from production builds
- `draft: true` hides from production but shows in preview mode
- `isAuthorPage: true` in frontmatter enables Person JSON-LD on static-sidebar pages

## Social posting (`publish.js`)
- `node publish.js` — posts the most recently dated unposted candidate to configured networks
- `node publish.js --dry-run` — previews post text without sending
- `node publish.js --list` — lists all unposted candidates
- Frontmatter: `social: bluesky` or `social: [bluesky, mastodon]` marks a post; `saved_date` is required

## Topics system
- Topic pages live at `/topics/[slug].html`; index at `/topics/index.html`
- `hiddenTopics` in `site-config.js` suppresses topics from the index
- `topicAliases` merges one topic into another: `{ 'alias-slug': 'canonical-slug' }`

## Known failure modes
- Date links in column contexts must be scoped to `/columns/[name]/YYYY/...` — root-relative date links break in column contexts
- `saved_date` values are treated as local-midnight dates — use `getDate()` / `getMonth()` / `getFullYear()`, never `getUTC*`
