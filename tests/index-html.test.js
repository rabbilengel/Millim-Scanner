'use strict';
/*
 * Checks on index.html: every app file it loads exists, and all carry the same
 * version tag (?v=...) so browsers fetch fresh copies after an update.
 * If the version test fails: run  node tools/stamp-version.js
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const repo = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const refs = Array.from(html.matchAll(/(?:src|href)="(app\/[^"]+)"/g)).map((m) => m[1]);

test('every app file in index.html exists', () => {
  assert.ok(refs.length > 20);
  for (const ref of refs) assert.ok(fs.existsSync(path.join(repo, ref.split('?')[0])), ref + ' is missing');
});

test('every app file in index.html has the same version tag', () => {
  const versions = new Set(refs.map((r) => (r.match(/\?v=([^"&]+)/) || [])[1]));
  assert.ok(!versions.has(undefined), 'a file has no ?v= tag — run: node tools/stamp-version.js');
  assert.strictEqual(versions.size, 1, 'files have different version tags — run: node tools/stamp-version.js');
});

test('every script in app/js is loaded by index.html', () => {
  const loaded = new Set(refs.map((r) => r.split('?')[0]));
  const walk = (dir) => fs.readdirSync(path.join(repo, dir), { withFileTypes: true })
    .flatMap((d) => (d.isDirectory() ? walk(dir + '/' + d.name) : [dir + '/' + d.name]));
  for (const f of walk('app/js').filter((f) => f.endsWith('.js'))) assert.ok(loaded.has(f), f + ' is not loaded by index.html');
});
