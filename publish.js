'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { parseMarkdownFile } = require('./lib/content');
const { getAllMarkdownFiles } = require('./lib/utils');
const { hasCategory } = require('./lib/helpers');
const siteConfig = require('./lib/site-config');

const buildSystem = require('./lib/build');

const LOG_FILE = path.join(__dirname, 'published-social.json');
const CONTENT_DIR = process.env.CONTENT_DIR;
const SITE_URL = (process.env.SITE_URL || siteConfig.siteUrl).replace(/\/$/, '');
const DRY_RUN = process.argv.includes('--dry-run');
const LIST = process.argv.includes('--list');
const UPDATE_STATS = process.argv.includes('--update-stats');
const SKIP_REBUILD = process.argv.includes('--skip-rebuild');

function hasSocial(social, network) {
  if (!social) return false;
  return Array.isArray(social) ? social.includes(network) : social === network;
}

function loadLog() {
  if (!fs.existsSync(LOG_FILE)) return [];
  return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
}

function saveLog(log) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2) + '\n', 'utf8');
}

function buildPostText(page, network) {
  const url = `${SITE_URL}${page.path}.html`;
  const tags = Array.isArray(page.tags) ? page.tags : [];
  const tagsLine = tags.length ? tags.map(t => `#${t}`).join(' ') : '';

  const slug = page.path.split('/').filter(Boolean).pop() || '';

  let lead;
  if (page.meta.description) {
    lead = page.meta.description;
  } else if (page.meta.title) {
    lead = `Wrote a new post called "${page.meta.title}"`;
  } else {
    lead = `New post: ${slug}`;
  }

  const parts = tagsLine ? [lead, url, tagsLine] : [lead, url];
  let text = parts.join('\n\n');

  if (network === 'bluesky') {
    const graphemes = [...text];
    if (graphemes.length > 300) {
      const overhead = url.length + 2 + (tagsLine ? tagsLine.length + 2 : 0);
      const maxLead = 300 - overhead;
      if (maxLead > 3) {
        lead = [...lead].slice(0, maxLead - 1).join('') + '…';
      } else {
        lead = null;
      }
      const newParts = lead
        ? (tagsLine ? [lead, url, tagsLine] : [lead, url])
        : (tagsLine ? [url, tagsLine] : [url]);
      text = newParts.join('\n\n');

      // Last resort: drop tags if still over limit
      if ([...text].length > 300) {
        text = lead ? `${lead}\n\n${url}` : url;
      }
    }
  }

  return text;
}

// Bluesky requires byte-offset facets for URLs and hashtags to be interactive
function buildBlueskyFacets(text) {
  const facets = [];

  const byteOffset = (str, charIndex) =>
    Buffer.byteLength(str.slice(0, charIndex), 'utf8');

  const urlRegex = /https?:\/\/[^\s]+/g;
  let m;
  while ((m = urlRegex.exec(text)) !== null) {
    facets.push({
      index: {
        byteStart: byteOffset(text, m.index),
        byteEnd: byteOffset(text, m.index + m[0].length),
      },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }],
    });
  }

  const tagRegex = /#([a-zA-Z][a-zA-Z0-9_]*)/g;
  while ((m = tagRegex.exec(text)) !== null) {
    facets.push({
      index: {
        byteStart: byteOffset(text, m.index),
        byteEnd: byteOffset(text, m.index + m[0].length),
      },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[1] }],
    });
  }

  return facets;
}

async function postToMastodon(text) {
  const instance = process.env.MASTODON_INSTANCE;
  const token = process.env.MASTODON_ACCESS_TOKEN;

  if (!instance || !token) throw new Error('Missing MASTODON_INSTANCE or MASTODON_ACCESS_TOKEN');

  const res = await fetch(`${instance}/api/v1/statuses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: text, visibility: 'public' }),
  });

  if (!res.ok) throw new Error(`Mastodon ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return { postId: data.id, postUrl: data.url };
}

async function postToBluesky(text) {
  const identifier = process.env.BLUESKY_IDENTIFIER;
  const password = process.env.BLUESKY_APP_PASSWORD;

  if (!identifier || !password) throw new Error('Missing BLUESKY_IDENTIFIER or BLUESKY_APP_PASSWORD');

  const authRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });

  if (!authRes.ok) throw new Error(`Bluesky auth ${authRes.status}: ${await authRes.text()}`);

  const { did, accessJwt } = await authRes.json();

  const facets = buildBlueskyFacets(text);
  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    langs: ['en'],
    ...(facets.length > 0 && { facets }),
  };

  const postRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessJwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ repo: did, collection: 'app.bsky.feed.post', record }),
  });

  if (!postRes.ok) throw new Error(`Bluesky post ${postRes.status}: ${await postRes.text()}`);

  const { uri } = await postRes.json();
  const rkey = uri.split('/').pop();
  return {
    postId: uri,
    postUrl: `https://bsky.app/profile/${identifier}/post/${rkey}`,
  };
}

async function fetchMastodonStats(postId) {
  const instance = process.env.MASTODON_INSTANCE;
  const token = process.env.MASTODON_ACCESS_TOKEN;
  if (!instance || !token) throw new Error('Missing Mastodon credentials');

  const res = await fetch(`${instance}/api/v1/statuses/${postId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Mastodon ${res.status}`);
  const data = await res.json();
  return {
    replies: data.replies_count || 0,
    favourites: data.favourites_count || 0,
    boosts: data.reblogs_count || 0,
  };
}

async function fetchBlueskyStats(atUri) {
  const res = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(atUri)}`
  );
  if (!res.ok) throw new Error(`Bluesky ${res.status}`);
  const data = await res.json();
  const post = data.posts?.[0];
  if (!post) throw new Error('Post not found');
  return {
    replies: post.replyCount || 0,
    likes: post.likeCount || 0,
    reposts: post.repostCount || 0,
  };
}

async function updateStats() {
  const log = loadLog();
  if (!log.length) { console.log('No posts in log.'); return; }

  let updated = 0;
  for (const entry of log) {
    let changed = false;

    if (entry.networks?.mastodon?.postId) {
      try {
        entry.networks.mastodon.stats = await fetchMastodonStats(entry.networks.mastodon.postId);
        changed = true;
      } catch (err) {
        console.error(`Mastodon stats failed for ${entry.path}: ${err.message}`);
      }
    }

    if (entry.networks?.bluesky?.postId) {
      try {
        entry.networks.bluesky.stats = await fetchBlueskyStats(entry.networks.bluesky.postId);
        changed = true;
      } catch (err) {
        console.error(`Bluesky stats failed for ${entry.path}: ${err.message}`);
      }
    }

    if (changed) {
      entry.statsUpdatedAt = new Date().toISOString();
      updated++;
      console.log(`Updated: ${entry.path}`);
    }
  }

  saveLog(log);
  console.log(`\nStats updated for ${updated} post${updated === 1 ? '' : 's'}.`);

  if (updated > 0 && !SKIP_REBUILD) {
    console.log('Rebuilding…');
    buildSystem.buildSite({
      CONTENT_DIR: process.env.CONTENT_DIR,
      BUILD_DIR: path.join(__dirname, 'public'),
      BUILD_MODE: process.env.BUILD_MODE || 'production',
      SITE_URL: process.env.SITE_URL,
      SITE_TITLE: process.env.SITE_TITLE,
      SITE_DESCRIPTION: process.env.SITE_DESCRIPTION,
    });
  }
}

async function main() {
  if (UPDATE_STATS) { await updateStats(); return; }

  if (!CONTENT_DIR) {
    console.error('CONTENT_DIR not set in .env');
    process.exit(1);
  }

  const files = getAllMarkdownFiles(CONTENT_DIR);
  const candidates = [];

  for (const file of files) {
    let page;
    try { page = parseMarkdownFile(file, CONTENT_DIR); } catch { continue; }

    if (!page.isPublished || page.isDraft) continue;
    if (!page.meta.social) continue;
    if (!page.meta.saved_date) continue;

    page._sourceFile = path.relative(CONTENT_DIR, file);
    candidates.push(page);
  }

  if (!candidates.length) {
    console.log('No posts with social: frontmatter found.');
    return;
  }

  const log = loadLog();
  const posted = new Set(log.map(e => e.path));
  const postedBySource = new Set(log.filter(e => e.sourceFile).map(e => e.sourceFile));

  const unposted = candidates.filter(p =>
    !posted.has(p.path) && !postedBySource.has(p._sourceFile)
  );

  if (!unposted.length) {
    console.log('All social posts already published.');
    return;
  }

  if (LIST) {
    unposted.sort((a, b) => new Date(b.meta.saved_date) - new Date(a.meta.saved_date));
    console.log(`${unposted.length} unposted:\n`);
    unposted.forEach(p => {
      const date = p.meta.saved_date ? new Date(p.meta.saved_date).toISOString().slice(0, 10) : '(no date)';
      const networks = Array.isArray(p.meta.social) ? p.meta.social.join(', ') : p.meta.social;
      console.log(`  ${date}  ${p.path}  [${networks}]`);
    });
    return;
  }

  // Pick the most recently dated unposted candidate
  unposted.sort((a, b) => new Date(b.meta.saved_date) - new Date(a.meta.saved_date));
  const page = unposted[0];

  console.log(`${DRY_RUN ? '[dry run] ' : ''}Posting: ${page.path}`);

  const networks = Array.isArray(page.meta.social) ? page.meta.social : [page.meta.social];
  const entry = {
    path: page.path,
    sourceFile: page._sourceFile,
    postedAt: new Date().toISOString(),
    networks: {},
  };

  for (const network of networks) {
    const text = buildPostText(page, network);
    console.log(`\n── ${network} ──\n${text}\n`);

    try {
      if (DRY_RUN) {
        console.log(`(dry run — not sent)`);
        continue;
      }
      let result;
      if (network === 'mastodon') result = await postToMastodon(text);
      else if (network === 'bluesky') result = await postToBluesky(text);
      else { console.warn(`Unknown network: ${network}`); continue; }

      entry.networks[network] = result;
      console.log(`${network}: ${result.postUrl}`);
    } catch (err) {
      console.error(`${network} failed: ${err.message}`);
    }
  }

  if (!DRY_RUN) {
    log.push(entry);
    saveLog(log);
    console.log('\nLog updated.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
