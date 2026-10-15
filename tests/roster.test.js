'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const M = require('../tools/load-app');
const R = M.roster;

// A made-up roster (no real students) in the same format as the real one.
const csvPath = path.join(__dirname, 'fixtures', 'sample-roster.csv');

test('a full roster file loads with no problems', () => {
  const roster = R.fromCsv(fs.readFileSync(csvPath, 'utf8'));
  assert.deepStrictEqual(roster.problems, []);
  assert.ok(roster.students.length > 0);
  for (const s of roster.students) {
    assert.match(s.id, /^\d{7}$/);
    assert.ok(s.grade && s.classNum, 'class code ' + s.classCode);
  }
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

// ---------- Editing the roster in the app ----------

test('adding, editing and removing a student', () => {
  const roster = R.fromCsv(SAMPLE);
  // add
  const added = R.fromCsv(R.csvWithStudent(roster, { id: '1000009', hebFirst: 'יוסף', hebLast: 'בלום', firstName: 'Yosef', lastName: 'Blum', classCode: '4_2' }, null));
  assert.strictEqual(added.students.length, 5);
  assert.deepStrictEqual(R.studentsInClass(added, '4_2').map((s) => s.hebLast), ['אדלר', 'בלום', 'כהן', 'לוי']);
  // edit: move Levi to another class and fix his name
  const levi = R.findById(added, '1000001');
  const moved = R.fromCsv(R.csvWithStudent(added, Object.assign({}, levi, { classCode: '5_1', hebFirst: 'דוד צבי' }), '1000001'));
  assert.strictEqual(moved.students.length, 5);
  assert.strictEqual(R.findById(moved, '1000001').classCode, '5_1');
  assert.strictEqual(R.findById(moved, '1000001').hebFirst, 'דוד צבי');
  // edit: change an ID (the old one disappears)
  const renumbered = R.fromCsv(R.csvWithStudent(moved, Object.assign({}, R.findById(moved, '1000004'), { id: '1000044' }), '1000004'));
  assert.strictEqual(R.findById(renumbered, '1000004'), null);
  assert.strictEqual(R.findById(renumbered, '1000044').hebLast, 'בראון');
  // remove
  const removed = R.fromCsv(R.csvWithoutStudent(renumbered, '1000003'));
  assert.strictEqual(removed.students.length, 4);
  assert.deepStrictEqual(removed.problems, []);
});

test('student checks: ID format, duplicate ID, class format, names', () => {
  const roster = R.fromCsv(SAMPLE);
  const ok = { id: '1000009', hebFirst: 'א', hebLast: 'ב', firstName: '', lastName: '', classCode: '4_6' };
  assert.deepStrictEqual(R.checkStudent(roster, ok, null), []);
  assert.match(R.checkStudent(roster, Object.assign({}, ok, { id: '12345' }), null).join(' '), /exactly 7 digits/);
  assert.match(R.checkStudent(roster, Object.assign({}, ok, { id: '1000001' }), null).join(' '), /already belongs to דוד לוי/);
  // keeping your own ID while editing is fine
  assert.deepStrictEqual(R.checkStudent(roster, Object.assign({}, ok, { id: '1000001' }), '1000001'), []);
  assert.match(R.checkStudent(roster, Object.assign({}, ok, { classCode: '4-6' }), null).join(' '), /like 4_1/);
  assert.match(R.checkStudent(roster, Object.assign({}, ok, { hebLast: '' }), null).join(' '), /first and last name/);
});

test('a full roster survives being written back out unchanged', () => {
  const roster = R.fromCsv(fs.readFileSync(csvPath, 'utf8'));
  const again = R.fromCsv(R.studentsToCsv(roster.students));
  assert.strictEqual(again.students.length, roster.students.length);
  for (const s of roster.students) assert.deepStrictEqual(R.findById(again, s.id), s);
});
