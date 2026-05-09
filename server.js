// server.js - Main entry point for the Markdown CMS

require('dotenv').config();
const express = require('express');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const buildSystem = require('./lib/build');
const log = require('./lib/logger');

const app = express();
const PORT = process.env.PORT || 3000;
const CONTENT_DIR = process.env.CONTENT_DIR || './content';
const BUILD_DIR = path.resolve(process.env.BUILD_DIR || path.join(__dirname, 'public'));
const BUILD_MODE = process.env.BUILD_MODE || 'production';
const AUTO_REBUILD = process.env.AUTO_REBUILD !== 'false';

const config = {
  CONTENT_DIR,
  BUILD_DIR,
  BUILD_MODE,
};

// Archive subdomain — serve public/html5/ as root for archive.localhost
const ARCHIVE_DIR = path.resolve(path.join(__dirname, 'public', 'html5'));
const PUBLIC_DIR  = path.resolve(path.join(__dirname, 'public'));
app.use((req, res, next) => {
  const host = req.hostname;
  if (host === 'archive.localhost') {
    return express.static(ARCHIVE_DIR)(req, res, () => {
      express.static(PUBLIC_DIR)(req, res, () => {
        const url = req.path.replace(/\/$/, '');
        const candidates = [
          path.join(ARCHIVE_DIR, url),
          path.join(ARCHIVE_DIR, `${url}.html`),
          path.join(ARCHIVE_DIR, url, 'index.html'),
        ];
        const found = candidates.find(p => fs.existsSync(p) && fs.statSync(p).isFile());
        if (found) return res.sendFile(found);
        res.status(404).sendFile(path.join(BUILD_DIR, '404.html'), err => {
          if (err) res.status(404).send('Page not found');
        });
      });
    });
  }
  next();
});

app.use(express.static('public'));

// Initial build
buildSystem.buildSite(config);

// Content watcher
if (AUTO_REBUILD) {
  const watcher = chokidar.watch(CONTENT_DIR, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true,
  });

  watcher
    .on('add',    p => { log.log(`Added: ${path.relative(CONTENT_DIR, p)}`);   buildSystem.buildSite(config); })
    .on('change', p => { log.info(`Changed: ${path.relative(CONTENT_DIR, p)}`); buildSystem.buildSite(config); })
    .on('unlink', p => { log.log(`Removed: ${path.relative(CONTENT_DIR, p)}`); buildSystem.buildSite(config); });

  log.log('Watching content/ for changes');
}

// Static asset watcher — copy changed files directly to public/ without a full rebuild
const STATIC_SOURCE_DIR = path.join(__dirname, 'static');
const staticWatcher = chokidar.watch(STATIC_SOURCE_DIR, {
  ignored: /(^|[\/\\])\./,
  persistent: true,
  ignoreInitial: true,
});

staticWatcher.on('change', changedPath => {
  const rel = path.relative(STATIC_SOURCE_DIR, changedPath);
  const dest = path.join(BUILD_DIR, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(changedPath, dest);
  log.info(`Static: ${rel}`);
});

// Route handler
app.get('*', (req, res) => {
  let url = req.path;
  const sortParam = req.query.sort;

  if (url === '/') url = '/index';
  url = url.replace(/\/$/, '');

  if (url === '/archives' && sortParam) {
    if (sortParam === 'asc') return res.sendFile(path.join(BUILD_DIR, 'archives/index-asc.html'));
    if (sortParam === 'desc') return res.sendFile(path.join(BUILD_DIR, 'archives/index-desc.html'));
  }

  const columnMatch = url.match(/^\/columns\/([^\/]+)(\/.*)?$/);
  if (columnMatch) {
    const candidates = [
      path.join(BUILD_DIR, url),
      path.join(BUILD_DIR, `${url}.html`),
      path.join(BUILD_DIR, url, 'index.html'),
    ];
    const found = candidates.find(p => fs.existsSync(p) && fs.statSync(p).isFile());
    if (!found) {
      const siteConfig = require('./lib/site-config');
      return res.redirect(302, `${siteConfig.archiveUrl}${url}`);
    }
  }

  if (url === '/topics' && sortParam) {
    if (['alpha', 'alpha-desc', 'count-desc', 'count-asc'].includes(sortParam)) {
      return res.sendFile(path.join(BUILD_DIR, `topics/index-${sortParam}.html`));
    }
  }

  const candidates = [
    path.join(BUILD_DIR, url),
    path.join(BUILD_DIR, `${url}.html`),
    path.join(BUILD_DIR, url, 'index.html'),
  ];

  const found = candidates.find(p => fs.existsSync(p) && fs.statSync(p).isFile());
  if (found) {
    res.sendFile(found);
  } else {
    res.status(404).sendFile(path.join(BUILD_DIR, '404.html'), err => {
      if (err) res.status(404).send('Page not found');
    });
  }
});

app.listen(PORT, () => {
  log.info(`localhost:${PORT}  [${BUILD_MODE}]`);
});

module.exports = { config };
