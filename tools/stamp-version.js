/*
 * Adds a version tag (?v=...) to every app file referenced in index.html.
 *
 * Why: browsers keep copies of a website's files for a while. After an update
 * they could mix a new index.html with an old script, which breaks the app.
 * A new tag on each update makes the browser fetch fresh copies.
 *
 * Run before committing a change to the app:   node tools/stamp-version.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'index.html');

function stamp(html, version) {
  return html.replace(/((?:src|href)="(?:app\/[^"?]+))(?:\?v=[^"]*)?"/g, '$1?v=' + version + '"');
}

if (require.main === module) {
  const version = process.argv[2] || new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  fs.writeFileSync(file, stamp(fs.readFileSync(file, 'utf8'), version));
  console.log('index.html files tagged with version ' + version);
}

module.exports = { stamp };
