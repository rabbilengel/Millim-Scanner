/*
 * Copies data/roster.csv into app/data/roster-data.js.
 *
 * Why: when the app is opened by double-clicking index.html, browsers don't
 * let a page read other files from the computer, so the roster is also
 * stored inside a script file. (On GitHub Pages the app reads data/roster.csv
 * directly, so it always has the latest roster.)
 *
 * Run after changing the roster:   node tools/build-roster-data.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
const csvPath = path.join(repo, 'data', 'roster.csv');
const outPath = path.join(repo, 'app', 'data', 'roster-data.js');

function build() {
  const csv = fs.readFileSync(csvPath, 'utf8');
  return (
    '/* Generated from data/roster.csv by tools/build-roster-data.js — do not edit by hand. */\n' +
    '(typeof window !== "undefined" ? window : globalThis).MILLIM_ROSTER_CSV = ' + JSON.stringify(csv) + ';\n'
  );
}

if (require.main === module) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, build());
  console.log('Wrote ' + path.relative(repo, outPath));
}

module.exports = { build, outPath };
