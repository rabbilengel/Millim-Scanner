/*
 * Writes test-sheets/test-packet.pdf — the printable packet used to test the
 * reader on real scans. (The app can also make this packet: Answer sheets tab.)
 *
 * Run:   node tools/make-test-packet.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('./load-app');

(async () => {
  const out = path.join(__dirname, '..', 'test-sheets', 'test-packet.pdf');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await M.testSheets.createPacket());
  console.log('Wrote ' + path.relative(path.join(__dirname, '..'), out));
})();
