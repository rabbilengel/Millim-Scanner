/*
 * RESULTS — the numbers behind the Results tab (no screens here).
 *  - scores are always recalculated from the quiz's current answer key,
 *    so fixing a key later updates everyone's score
 *  - class lists sorted by Hebrew last name, including students not yet graded
 *  - item analysis: percent correct per question, and which wrong answers were chosen most
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});
  const G = M.grading;

  const he = new Intl.Collator('he');
  function byHebrewName(a, b) {
    return he.compare(a.hebLast || a.lastName || '', b.hebLast || b.lastName || '') ||
      he.compare(a.hebFirst || a.firstName || '', b.hebFirst || b.firstName || '');
  }

  function scored(quiz, row) {
    return Object.assign({}, row, G.score(quiz, row.answers));
  }

  // Use the roster's current name and class for each result (in case the roster was updated since grading).
  function withRoster(row, roster) {
    const st = roster && /^\d{7}$/.test(row.studentId || '') ? M.roster.findById(roster, row.studentId) : null;
    if (!st) return row;
    return Object.assign({}, row, {
      onRoster: true, hebLast: st.hebLast, hebFirst: st.hebFirst, lastName: st.lastName, firstName: st.firstName,
      classCode: st.classCode, classLabel: st.classLabel,
    });
  }

  function prepare(quiz, rows, roster) {
    return rows.map((r) => scored(quiz, withRoster(r, roster)));
  }

  // Which classes appear in these results (in class order), plus 'unknown' if some students aren't on the roster.
  function classesIn(rows) {
    const codes = Array.from(new Set(rows.map((r) => r.classCode).filter(Boolean)));
    codes.sort((a, b) => {
      const pa = M.hebrew.parseClassCode(a), pb = M.hebrew.parseClassCode(b);
      return pa && pb ? pa.grade - pb.grade || pa.classNum - pb.classNum : a.localeCompare(b);
    });
    if (rows.some((r) => !r.classCode)) codes.push('');
    return codes;
  }

  /*
   * One class: every student on the roster in that class (sorted by Hebrew last name),
   * with their result or null if they have none yet.
   */
  function classList(rows, roster, classCode) {
    if (!classCode) {
      return rows.filter((r) => !r.classCode).sort((a, b) => (a.studentId || '').localeCompare(b.studentId || ''))
        .map((r) => ({ student: null, result: r }));
    }
    const byId = new Map(rows.filter((r) => r.classCode === classCode).map((r) => [r.studentId, r]));
    const list = M.roster.studentsInClass(roster, classCode).map((s) => ({ student: s, result: byId.get(s.id) || null }));
    // results for this class whose student is no longer on the roster
    byId.forEach((r, id) => { if (!list.some((x) => x.student && x.student.id === id)) list.push({ student: null, result: r }); });
    return list;
  }

  function summary(rows) {
    const pcts = rows.filter((r) => r.possible > 0).map((r) => r.percent);
    if (!pcts.length) return { count: rows.length, average: null, high: null, low: null };
    const avg = pcts.reduce((s, p) => s + p, 0) / pcts.length;
    return { count: rows.length, average: Math.round(avg * 10) / 10, high: Math.max.apply(null, pcts), low: Math.min.apply(null, pcts) };
  }

  /*
   * Item analysis for a set of results.
   * Returns one entry per question:
   *  { number, key: [choices], counted, answered, counts: [per choice], blank, multiple,
   *    percentCorrect, wrongChoices: [{ choice, count }] most chosen first }
   */
  function itemAnalysis(quiz, rows) {
    const n = quiz.layout.numQuestions, k = quiz.layout.maxChoices;
    const out = [];
    for (let q = 0; q < n; q++) {
      const key = quiz.answers[q] || [];
      const counts = new Array(k).fill(0);
      let blank = 0, multiple = 0;
      rows.forEach((r) => {
        const a = r.answers[q];
        if (a === null || a === undefined) blank++;
        else if (a === 'multiple') multiple++;
        else if (a >= 0 && a < k) counts[a]++;
      });
      const total = rows.length;
      const correct = key.reduce((s, c) => s + (counts[c] || 0), 0);
      const wrongChoices = counts.map((count, choice) => ({ choice, count }))
        .filter((w) => !key.includes(w.choice) && w.count > 0)
        .sort((a, b) => b.count - a.count);
      out.push({
        number: q + 1, key, counted: key.length > 0, total, counts, blank, multiple,
        percentCorrect: key.length && total ? Math.round((correct / total) * 1000) / 10 : null,
        wrongChoices,
      });
    }
    return out;
  }

  // ---------- CSV ----------
  function resultsCsv(quiz, entries) {
    const labels = G.labelsFor(quiz.layout);
    const header = ['Class', 'כיתה', 'Hebrew Last Name', 'Hebrew First Name', 'Last Name', 'First Name', 'ID', 'Correct', 'Possible', 'Percent'];
    for (let q = 1; q <= quiz.layout.numQuestions; q++) header.push('Q' + q);
    const lines = [header, ['', '', 'Answer key', '', '', '', '', '', '', ''].concat(quiz.answers.map((a) => a.map((i) => labels[i]).join(';')))];
    entries.forEach(({ student, result }) => {
      const s = student || result || {};
      const base = [s.classCode || '', s.classLabel || '', s.hebLast || '', s.hebFirst || '', s.lastName || '', s.firstName || '', s.id || s.studentId || ''];
      if (!result) lines.push(base.concat(['', '', 'not graded']));
      else lines.push(base.concat([result.correct, result.possible, result.percent]).concat(result.answers.map((a) => G.answerText(a, quiz.layout))));
    });
    // The invisible mark at the start tells Excel the file is UTF-8, so Hebrew shows correctly.
    return '﻿' + M.roster.toCsv(lines);
  }

  function itemAnalysisCsv(quiz, items) {
    const labels = G.labelsFor(quiz.layout);
    const header = ['Question', 'Correct answer', 'Percent correct'].concat(labels.map((l) => 'Chose ' + l)).concat(['Blank', 'Two answers', 'Most chosen wrong answer']);
    const lines = [header].concat(items.map((it) => [
      it.number, it.key.map((i) => labels[i]).join(';') || '(not counted)', it.percentCorrect == null ? '' : it.percentCorrect,
    ].concat(it.counts).concat([it.blank, it.multiple, it.wrongChoices.length ? labels[it.wrongChoices[0].choice] : ''])));
    return '﻿' + M.roster.toCsv(lines);
  }

  M.results = { byHebrewName, prepare, classesIn, classList, summary, itemAnalysis, resultsCsv, itemAnalysisCsv };
})(typeof window !== 'undefined' ? window : globalThis);
