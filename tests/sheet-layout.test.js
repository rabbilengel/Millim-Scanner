'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../tools/load-app');
const L = M.sheetLayout;

const STYLES = Object.keys(L.CHOICE_STYLES);

test('the sheet code strip can be read back for every layout', () => {
  for (const choiceStyle of STYLES) {
    for (let maxChoices = L.MIN_CHOICES; maxChoices <= L.MAX_CHOICES; maxChoices++) {
      for (let numQuestions = 1; numQuestions <= L.MAX_QUESTIONS; numQuestions++) {
        const bits = L.encodeSheetCode({ numQuestions, maxChoices, choiceStyle });
        assert.deepStrictEqual(L.decodeSheetCode(bits), { version: L.LAYOUT_VERSION, numQuestions, maxChoices, choiceStyle });
      }
    }
  }
});

test('a misread sheet code is rejected, not misunderstood', () => {
  const bits = L.encodeSheetCode({ numQuestions: 37, maxChoices: 4, choiceStyle: 'hebrew' });
  for (let i = 0; i < bits.length; i++) {
    const bad = bits.slice();
    bad[i] = bad[i] ? 0 : 1;
    assert.strictEqual(L.decodeSheetCode(bad), null, 'flipping cell ' + i);
  }
  assert.strictEqual(L.decodeSheetCode(new Array(bits.length).fill(0)), null);
  assert.strictEqual(L.decodeSheetCode(new Array(bits.length).fill(1)), null);
});

test('per-question choice counts', () => {
  const q = L.normalizeQuiz({ numQuestions: 20, defaultChoices: 4, choiceOverrides: [{ from: 16, to: 20, choices: 2 }] });
  assert.strictEqual(q.maxChoices, 4);
  assert.deepStrictEqual(q.choicesPerQuestion.slice(14), [4, 2, 2, 2, 2, 2]);
  const grid = L.sheetLayout({ numQuestions: 20, defaultChoices: 4, choiceOverrides: [{ from: 16, to: 20, choices: 2 }] }).answers;
  assert.deepStrictEqual(grid.questions[15].choices.map((c) => c.printed), [true, true, false, false]);
});

function boxOf(b) { return { x0: b.x - b.r, x1: b.x + b.r, y0: b.y - b.r, y1: b.y + b.r }; }
function overlaps(a, b, gap) { return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap; }

const CASES = [];
for (const choiceStyle of STYLES) {
  for (const numQuestions of [1, 10, 25, 26, 30, 50, 51, 75, 76, 99, 100]) {
    for (const defaultChoices of [2, 4, 5, 6]) CASES.push({ numQuestions, choiceStyle, defaultChoices });
  }
}

test('every bubble is on the page, clear of the corner markers, and not touching another bubble', () => {
  for (const quiz of CASES) {
    const layout = L.sheetLayout(quiz);
    const bubbles = layout.answers.questions.flatMap((q) => q.choices).concat(layout.id.bubbles);
    const markers = layout.fiducials.map((f) => ({ x0: f.x - f.size / 2, x1: f.x + f.size / 2, y0: f.y - f.size / 2, y1: f.y + f.size / 2 }));
    const boxes = bubbles.map(boxOf);
    for (const b of boxes) {
      assert.ok(b.x0 > 40 && b.x1 < 572 && b.y0 > 60 && b.y1 < 740, JSON.stringify(quiz));
      for (const m of markers) assert.ok(!overlaps(b, m, 6), 'bubble near a corner marker: ' + JSON.stringify(quiz));
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        assert.ok(!overlaps(boxes[i], boxes[j], 2), 'bubbles touch: ' + JSON.stringify(quiz));
      }
    }
    assert.ok(layout.answers.radius >= 5.5, 'bubbles big enough to fill');
  }
});

test('Hebrew sheets run right to left; other sheets left to right', () => {
  const he = L.sheetLayout({ numQuestions: 30, choiceStyle: 'hebrew', defaultChoices: 5 }).answers;
  assert.ok(he.questions[0].choices[0].x > he.questions[0].choices[1].x, 'א is to the right of ב');
  assert.ok(he.questions[0].choices[0].x > he.questions[20].choices[0].x, 'question 1 is in the right-hand column');
  const en = L.sheetLayout({ numQuestions: 30, choiceStyle: 'numbers', defaultChoices: 5 }).answers;
  assert.ok(en.questions[0].choices[0].x < en.questions[0].choices[1].x);
  assert.ok(en.questions[0].choices[0].x < en.questions[20].choices[0].x);
});

test('student ID grid: 7 digits x 10 values', () => {
  const g = L.idGrid();
  assert.strictEqual(g.bubbles.length, 70);
  assert.strictEqual(g.boxes.length, 7);
});

test('up to 25 questions per column', () => {
  assert.strictEqual(L.answerGrid({ numQuestions: 25, maxChoices: 5, choiceStyle: 'numbers' }).columns, 1);
  assert.strictEqual(L.answerGrid({ numQuestions: 26, maxChoices: 5, choiceStyle: 'numbers' }).columns, 2);
  assert.strictEqual(L.answerGrid({ numQuestions: 100, maxChoices: 5, choiceStyle: 'numbers' }).columns, 4);
});
