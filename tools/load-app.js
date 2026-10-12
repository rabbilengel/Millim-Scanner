/*
 * Loads the app's code into Node.js (for tests and for the tools in this folder).
 * The browser loads the same files with <script> tags in index.html.
 */
'use strict';
const path = require('path');

const appDir = path.join(__dirname, '..', 'app');

globalThis.PDFLib = require(path.join(appDir, 'vendor', 'pdf-lib.min.js'));
globalThis.fontkit = require(path.join(appDir, 'vendor', 'fontkit.umd.min.js'));
require(path.join(appDir, 'vendor', 'heebo-font.js'));

for (const file of [
  'hebrew.js', 'roster.js', 'sheet-layout.js', 'sheet-pdf.js', 'test-sheets.js',
  'reader/image.js', 'reader/homography.js', 'reader/find-sheet.js', 'reader/read-sheet.js',
  'grading.js',
]) {
  require(path.join(appDir, 'js', file));
}

module.exports = globalThis.Millim;
