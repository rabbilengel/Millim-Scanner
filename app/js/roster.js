/*
 * Roster: reads the class list CSV and answers questions like
 * "who is in class 4_1, sorted by Hebrew last name?"
 *
 * Expected columns (order doesn't matter, extra columns are ignored):
 *   Last Name, First Name, Zipgrade ID, Class, Hebrew First Name, Hebrew Last Name
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});
  const H = M.hebrew;

  const ID_LENGTH = 7;

  // Simple, careful CSV reader (handles quotes, commas inside quotes, Windows line endings).
  function parseCsv(text) {
    text = String(text).replace(/^﻿/, '');
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((f) => f.trim() !== ''));
  }

  function toCsv(rows) {
    return rows
      .map((r) => r.map((v) => {
        const s = v == null ? '' : String(v);
        return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(','))
      .join('\r\n') + '\r\n';
  }

  const COLUMN_NAMES = {
    lastName: ['last name', 'lastname', 'last'],
    firstName: ['first name', 'firstname', 'first'],
    id: ['zipgrade id', 'student id', 'id'],
    classCode: ['class', 'class code'],
    hebFirst: ['hebrew first name'],
    hebLast: ['hebrew last name'],
  };

  function findColumns(header) {
    const norm = header.map((h) => h.trim().toLowerCase());
    const cols = {};
    for (const key of Object.keys(COLUMN_NAMES)) {
      cols[key] = norm.findIndex((h) => COLUMN_NAMES[key].includes(h));
    }
    return cols;
  }

  // Compare students by Hebrew last name, then Hebrew first name (falls back to English names).
  const heCollator = new Intl.Collator('he');
  function compareStudents(a, b) {
    return (
      heCollator.compare(a.hebLast || a.lastName, b.hebLast || b.lastName) ||
      heCollator.compare(a.hebFirst || a.firstName, b.hebFirst || b.firstName) ||
      a.id.localeCompare(b.id)
    );
  }

  function compareClassCodes(a, b) {
    const pa = H.parseClassCode(a), pb = H.parseClassCode(b);
    if (pa && pb) return pa.grade - pb.grade || pa.classNum - pb.classNum;
    return String(a).localeCompare(String(b));
  }

  /*
   * Build a roster from CSV text.
   * Returns { students, classes, problems } — problems is a list of
   * plain-English messages about rows that couldn't be used.
   */
  function fromCsv(text) {
    const rows = parseCsv(text);
    const problems = [];
    if (!rows.length) return { students: [], classes: [], problems: ['The roster file is empty.'] };

    const cols = findColumns(rows[0]);
    const missing = Object.keys(cols).filter((k) => cols[k] < 0);
    if (missing.includes('id') || missing.includes('classCode')) {
      return {
        students: [], classes: [],
        problems: ['Could not find the "Zipgrade ID" and "Class" columns in the first row of the roster file.'],
      };
    }

    const students = [];
    const seen = new Map();
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const get = (k) => (cols[k] >= 0 ? (row[cols[k]] || '').trim() : '');
      const id = get('id');
      const classCode = get('classCode').replace(/\s+/g, '');
      const line = r + 1;
      if (!new RegExp('^\\d{' + ID_LENGTH + '}$').test(id)) {
        problems.push('Row ' + line + ': ID "' + id + '" is not ' + ID_LENGTH + ' digits — skipped.');
        continue;
      }
      if (seen.has(id)) {
        problems.push('Row ' + line + ': ID ' + id + ' is also used on row ' + seen.get(id) + ' — skipped.');
        continue;
      }
      const parsed = H.parseClassCode(classCode);
      if (!parsed) problems.push('Row ' + line + ': class "' + classCode + '" is not in the 4_1 format.');
      seen.set(id, line);
      students.push({
        id,
        lastName: get('lastName'),
        firstName: get('firstName'),
        hebFirst: get('hebFirst'),
        hebLast: get('hebLast'),
        classCode,
        classLabel: H.classLabel(classCode),
        grade: parsed ? parsed.grade : null,
        classNum: parsed ? parsed.classNum : null,
      });
    }

    const classes = Array.from(new Set(students.map((s) => s.classCode))).sort(compareClassCodes);
    return { students, classes, problems };
  }

  function studentsInClass(roster, classCode) {
    return roster.students.filter((s) => s.classCode === classCode).sort(compareStudents);
  }

  function gradesOf(roster) {
    return Array.from(new Set(roster.students.map((s) => s.grade).filter((g) => g != null))).sort((a, b) => a - b);
  }

  // All students of a grade: class by class, each class sorted by Hebrew last name.
  function studentsInGrade(roster, grade) {
    return roster.classes
      .filter((c) => { const p = H.parseClassCode(c); return p && p.grade === Number(grade); })
      .reduce((all, c) => all.concat(studentsInClass(roster, c)), []);
  }

  function findById(roster, id) {
    return roster.students.find((s) => s.id === String(id)) || null;
  }

  // ---------- Editing ----------
  const CSV_HEADER = ['Last Name', 'First Name', 'Zipgrade ID', 'Class', 'Hebrew First Name', 'Hebrew Last Name'];

  // Students -> roster CSV text (same columns as the original file).
  function studentsToCsv(students) {
    const sorted = students.slice().sort((a, b) => compareClassCodes(a.classCode, b.classCode) || compareStudents(a, b));
    return toCsv([CSV_HEADER].concat(sorted.map((s) => [s.lastName, s.firstName, s.id, s.classCode, s.hebFirst, s.hebLast])));
  }

  /*
   * Check a student before saving. originalId = the student's ID before editing (null for a new student).
   * Returns a list of problems in plain words (empty = OK).
   */
  function checkStudent(roster, s, originalId) {
    const problems = [];
    if (!new RegExp('^\\d{' + ID_LENGTH + '}$').test(s.id || '')) problems.push('The ID must be exactly ' + ID_LENGTH + ' digits.');
    else if (s.id !== originalId && findById(roster, s.id)) {
      const other = findById(roster, s.id);
      problems.push('ID ' + s.id + ' already belongs to ' + ([other.hebFirst, other.hebLast].join(' ').trim() || other.firstName + ' ' + other.lastName) + '.');
    }
    if (!H.parseClassCode(s.classCode)) problems.push('Class must look like 4_1 (grade, underscore, class number).');
    if (!(s.hebFirst || s.firstName) || !(s.hebLast || s.lastName)) problems.push('Type at least a first and last name (Hebrew or English).');
    return problems;
  }

  // Add or replace one student (originalId = the ID before editing, or null) -> new roster CSV text
  function csvWithStudent(roster, s, originalId) {
    const others = roster.students.filter((x) => x.id !== originalId && x.id !== s.id);
    return studentsToCsv(others.concat([s]));
  }

  function csvWithoutStudent(roster, id) {
    return studentsToCsv(roster.students.filter((x) => x.id !== id));
  }

  M.roster = {
    ID_LENGTH,
    studentsToCsv,
    checkStudent,
    csvWithStudent,
    csvWithoutStudent,
    compareClassCodes,
    parseCsv,
    toCsv,
    fromCsv,
    compareStudents,
    studentsInClass,
    studentsInGrade,
    gradesOf,
    findById,
  };
})(typeof window !== 'undefined' ? window : globalThis);
