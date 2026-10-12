'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../tools/load-app');
const G = M.grading;

const NUM5 = { numQuestions: 5, choiceStyle: 'numbers', maxChoices: 5 };
const HEB4 = { numQuestions: 4, choiceStyle: 'hebrew', maxChoices: 4 };

test('answer key CSV: one row per question, with a header and two accepted answers', () => {
  const { answers, problems } = G.keyFromCsv('Question,Answer\n1,3\n2,1;4\n3,5\n5,2\n', NUM5);
  assert.deepStrictEqual(answers, [[2], [0, 3], [4], [], [1]]);
  assert.deepStrictEqual(problems, []);
});

test('answer key CSV: answers in order on one line (not mistaken for "question 1 = ...")', () => {
  assert.deepStrictEqual(G.keyFromCsv('1,3,2,4,5\n', NUM5).answers, [[0], [2], [1], [3], [4]]);
});

test('answer key CSV: Hebrew letters, or numbers/letters on a Hebrew sheet', () => {
  assert.deepStrictEqual(G.keyFromCsv('א\nד\n2\nB\n', HEB4).answers, [[0], [3], [1], [1]]);
});

test('answer key CSV: bad entries are reported in plain words', () => {
  const { answers, problems } = G.keyFromCsv('1,7\n2,X\n9,1\n', NUM5);
  assert.deepStrictEqual(answers[0], []);
  assert.strictEqual(problems.length, 4); // three bad rows + "no answers found"
  assert.match(problems.join(' '), /Question 9 is not on this sheet/);
});

test('answer key round trip through CSV', () => {
  const key = G.newKey(HEB4, 'Test');
  key.answers = [[0], [1, 2], [], [3]];
  assert.deepStrictEqual(G.keyFromCsv(G.keyToCsv(key), HEB4).answers, key.answers);
});

test('scoring: blanks and double answers are wrong; questions without a key answer are not counted', () => {
  const key = G.newKey(NUM5, 'Test');
  key.answers = [[0], [1, 2], [], [3], [4]];
  const s = G.score(key, [0, 2, 1, null, 'multiple']);
  assert.deepStrictEqual(s.perQuestion, [true, true, null, false, false]);
  assert.strictEqual(s.correct, 2);
  assert.strictEqual(s.possible, 4);
  assert.strictEqual(s.percent, 50);
});

test('the reader\'s result becomes starting answers', () => {
  const read = { answers: [{ status: 'ok', choice: 2 }, { status: 'blank', choice: null }, { status: 'multiple', choice: null }, { status: 'unclear', choice: 1 }] };
  assert.deepStrictEqual(G.answersFromRead(read), [2, null, 'multiple', 1]);
});
