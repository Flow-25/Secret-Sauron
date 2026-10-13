'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/**
 * URL for a file in public/ with a version tag derived from its modification time,
 * so browsers fetch the new file as soon as it changes (no stale cached CSS/JS).
 */
function asset(file) {
  let v = '0';
  try { v = Math.floor(fs.statSync(path.join(PUBLIC_DIR, file)).mtimeMs).toString(36); } catch { /* missing file */ }
  return `/static/${file}?v=${v}`;
}

module.exports = { asset, PUBLIC_DIR };
