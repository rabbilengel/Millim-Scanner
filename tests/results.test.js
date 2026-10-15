'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../tools/load-app');
const R = M.results;

const roster = M.roster.fromCsv([
  'Last Name,First Name,Zipgrade ID,Class,Hebrew First Name,Hebrew Last Name',
  'Cohen,Moshe,1000001,4_2,משה,כהן',
  'Adler,Avi,1000002,4_2,אבי,אדלר',
  'Levi,Dovid,1000003,4_2,דוד,לוי',
  'Brown,Ben,1000004,5_1,בנימין,בראון',
].join('\n'));

const quiz = {
  id: 'q1', title: 'Test', layout: { numQuestions: 4, choiceStyle: 'hebrew', maxChoices: 4 },
  answers: [[0], [1], [2, 3], []], // Q3 accepts two answers, Q4 not counted
};

// saved results: names/classes as they were at grading time (may be out of date)
const saved = [
  { docId: '1000001', studentId: '1000001', answers: [0, 1, 3, 0] },          // 3/3
  { docId: '1000002', studentId: '1000002', answers: [1, 1, null, 2] },       // 1/3
  { docId: '1000004', studentId: '1000004', answers: [0, 'multiple', 2, 1] }, // 2/3
  { docId: 'sheet-x', studentId: '12?4567', answers: [2, 2, 2, 2] },          // 1/3 (Q3), not on roster
];

test('scores are recalculated from the current key, with names and classes from the roster', () => {
  const rows = R.prepare(quiz, saved, roster);
  assert.deepStrictEqual(rows.map((r) => r.correct), [3, 1, 2, 1]);
  assert.deepStrictEqual(rows.map((r) => r.possible), [3, 3, 3, 3]);
  assert.strictEqual(rows[0].hebLast, 'כהן');
  assert.strictEqual(rows[0].classLabel, 'ד-ב');
  assert.strictEqual(rows[3].classCode, undefined);
  // fixing the key changes the scores
  const fixed = Object.assign({}, quiz, { answers: [[0], [1], [2, 3], [0]] });
  assert.deepStrictEqual(R.prepare(fixed, saved, roster).map((r) => r.correct), [4, 1, 2, 1]);
});

test('a class list shows every student in the class, sorted by Hebrew last name, graded or not', () => {
  const rows = R.prepare(quiz, saved, roster);
  const list = R.classList(rows, roster, '4_2');
  assert.deepStrictEqual(list.map((x) => x.student.hebLast), ['אדלר', 'כהן', 'לוי']);
  assert.deepStrictEqual(list.map((x) => (x.result ? x.result.correct : null)), [1, 3, null]);
  assert.deepStrictEqual(R.classesIn(rows), ['4_2', '5_1', '']);
  assert.strictEqual(R.classList(rows, roster, '')[0].result.studentId, '12?4567');
});

test('summary: average, highest, lowest', () => {
  const rows = R.prepare(quiz, saved, roster);
  const s = R.summary(rows.slice(0, 3));
  assert.strictEqual(s.count, 3);
  assert.strictEqual(s.high, 100);
  assert.strictEqual(s.low, 33.3);
  assert.strictEqual(s.average, 66.7);
  assert.strictEqual(R.summary([]).average, null);
});

test('item analysis: percent correct and the most chosen wrong answer', () => {
  const rows = R.prepare(quiz, saved, roster);
  const items = R.itemAnalysis(quiz, rows);
  assert.strictEqual(items[0].percentCorrect, 50);          // 2 of 4 chose א
  assert.deepStrictEqual(items[0].counts, [2, 1, 1, 0]);
  assert.strictEqual(items[1].multiple, 1);
  assert.strictEqual(items[1].percentCorrect, 50);
  assert.strictEqual(items[2].percentCorrect, 75);          // ג or ד both accepted
  assert.strictEqual(items[2].blank, 1);
  assert.strictEqual(items[3].counted, false);
  assert.strictEqual(items[3].percentCorrect, null);
  // Q1: wrong answers ב and ג chosen once each
  assert.deepStrictEqual(items[0].wrongChoices.map((w) => w.count), [1, 1]);
});

test('CSV files open in Excel with Hebrew (start with the UTF-8 mark) and list ungraded students', () => {
  const rows = R.prepare(quiz, saved, roster);
  const csv = R.resultsCsv(quiz, R.classList(rows, roster, '4_2'));
  assert.ok(csv.startsWith('﻿'));
  const lines = M.roster.parseCsv(csv);
  assert.strictEqual(lines[1][2], 'Answer key');
  assert.deepStrictEqual(lines[1].slice(10), ['א', 'ב', 'ג;ד', '']);
  assert.strictEqual(lines[2][2], 'אדלר');
  assert.strictEqual(lines[4][9], 'not graded');
  const items = M.roster.parseCsv(R.itemAnalysisCsv(quiz, R.itemAnalysis(quiz, rows)));
  assert.deepStrictEqual(items[1].slice(0, 3), ['1', 'א', '50']);
});
