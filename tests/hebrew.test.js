'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../tools/load-app');
const H = M.hebrew;

test('class codes become Hebrew labels', () => {
  assert.strictEqual(H.classLabel('4_1'), 'ד-א');
  assert.strictEqual(H.classLabel('5_3'), 'ה-ג');
  assert.strictEqual(H.classLabel('6_5'), 'ו-ה');
  assert.strictEqual(H.gradeLabel(6), 'ו');
  assert.deepStrictEqual(H.parseClassCode(' 4_2 '), { grade: 4, classNum: 2 });
  assert.strictEqual(H.parseClassCode('4-2'), null);
});

test('a Hebrew line with an English word is split into runs in visual (left-to-right) order', () => {
  const runs = H.visualRuns('שם: John', 'rtl');
  assert.deepStrictEqual(runs, [{ text: 'John', dir: 'ltr' }, { text: 'שם: ', dir: 'rtl' }]);
});

test('numbers inside a Hebrew line stay in reading order', () => {
  const runs = H.visualRuns('כיתה 4_1 היום', 'rtl');
  assert.deepStrictEqual(runs, [
    { text: ' היום', dir: 'rtl' },
    { text: '4_1', dir: 'ltr' },
    { text: 'כיתה ', dir: 'rtl' },
  ]);
});

test('an English line keeps its order', () => {
  const runs = H.visualRuns('Grade 4 — ד', 'ltr');
  assert.strictEqual(runs[0].text, 'Grade 4 — ');
  assert.strictEqual(runs[1].text, 'ד');
});

test('the font engine reverses Hebrew runs itself (our PDF text relies on this)', () => {
  const font = globalThis.fontkit.create(Buffer.from(globalThis.HEEBO_FONT.regular, 'base64'));
  const order = font.layout('אבג').glyphs.map((g) => String.fromCodePoint(g.codePoints[0])).join('');
  assert.strictEqual(order, 'גבא');
  // and a run without Hebrew letters is NOT reversed, so toDrawable reverses it for us
  assert.strictEqual(H.toDrawable({ text: ' (- ', dir: 'rtl' }), ' -) ');
});
