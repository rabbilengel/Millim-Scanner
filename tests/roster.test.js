'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const M = require('../tools/load-app');
const R = M.roster;

const csvPath = path.join(__dirname, '..', 'data', 'roster.csv');

test('the real roster loads with no problems', () => {
  const roster = R.fromCsv(fs.readFileSync(csvPath, 'utf8'));
  assert.deepStrictEqual(roster.problems, []);
  assert.ok(roster.students.length > 0);
  for (const s of roster.students) {
    assert.match(s.id, /^\d{7}$/);
    assert.ok(s.grade && s.classNum, 'class code ' + s.classCode);
  }
});

test('the copy of the roster built into the app matches data/roster.csv', () => {
  // If this fails: run  node tools/build-roster-data.js
  const { build, outPath } = require('../tools/build-roster-data');
  assert.strictEqual(fs.readFileSync(outPath, 'utf8'), build());
});

const SAMPLE = [
  'Last Name,First Name,Zipgrade ID,Class,Hebrew First Name,Hebrew Last Name',
  'Cohen,"Moshe, Jr.",1000003,4_2,משה,כהן',
  'Levi,Dovid,1000001,4_2,דוד,לוי',
  'Adler,Avi,1000002,4_2,אבי,אדלר',
  'Brown,Ben,1000004,5_1,בנימין,בראון',
  'Bad,Id,12345,4_1,א,ב',
  'Dup,Id,1000001,4_1,א,ב',
].join('\r\n');

test('CSV with quotes, Windows line endings and bad rows', () => {
  const roster = R.fromCsv('﻿' + SAMPLE);
  assert.strictEqual(roster.students.length, 4);
  assert.strictEqual(roster.problems.length, 2);
  assert.match(roster.problems[0], /not 7 digits/);
  assert.match(roster.problems[1], /also used on row/);
  assert.strictEqual(R.findById(roster, '1000003').firstName, 'Moshe, Jr.');
  assert.deepStrictEqual(roster.classes, ['4_2', '5_1']);
});

test('a class is sorted by Hebrew last name', () => {
  const roster = R.fromCsv(SAMPLE);
  const names = R.studentsInClass(roster, '4_2').map((s) => s.hebLast);
  assert.deepStrictEqual(names, ['אדלר', 'כהן', 'לוי']);
  assert.strictEqual(R.studentsInClass(roster, '4_2')[0].classLabel, 'ד-ב');
});

test('a grade lists classes in order, each sorted', () => {
  const roster = R.fromCsv(SAMPLE);
  assert.deepStrictEqual(R.gradesOf(roster), [4, 5]);
  assert.deepStrictEqual(R.studentsInGrade(roster, 4).map((s) => s.id), ['1000002', '1000003', '1000001']);
});

test('CSV writer and reader agree', () => {
  const rows = [['a', 'b,c', 'd"e'], ['שלום', '', 'x\ny']];
  assert.deepStrictEqual(R.parseCsv(R.toCsv(rows)), rows);
});
