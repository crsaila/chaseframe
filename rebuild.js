// rebuild.js
require('dotenv').config();
const buildSystem = require('./lib/build');

// Create the config object manually
const config = {
  CONTENT_DIR: process.env.CONTENT_DIR || './content',
  BUILD_DIR: process.env.BUILD_DIR || './public',
  BUILD_MODE: process.env.BUILD_MODE || 'production'
};

buildSystem.buildSite(config, true);