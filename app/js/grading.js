/*
 * GRADING — answer keys and scores (no screens here, just the rules).
 *
 * An answer key:
 *   { id, title, layout: { numQuestions, choiceStyle, maxChoices }, answers: [[0], [2], [], [1, 3], ...] }
 *   answers[q] lists the accepted choices for question q+1 (0 = first choice).
 *   An empty list means the question is not counted (e.g. a dropped question).
 *
 * A sheet's final answers (after the teacher's review) are a list with one entry per question:
 *   a choice number, null (blank), or 'multiple' (more than one marked → counts as wrong).
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});
  const L = M.sheetLayout;

  function newKey(layout, title) {
    return {
      id: 'quiz-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      title: title || '',
      layout: { numQuestions: layout.numQuestions, choiceStyle: layout.choiceStyle, maxChoices: layout.maxChoices },
      answers: new Array(layout.numQuestions).fill(null).map(() => []),
      updatedAt: Date.now(),
    };
  }

  function sameLayout(a, b) {
    return a && b && a.numQuestions === b.numQuestions && a.choiceStyle === b.choiceStyle && a.maxChoices === b.maxChoices;
  }

  function labelsFor(layout) {
    return L.CHOICE_STYLES[layout.choiceStyle].labels.slice(0, layout.maxChoices);
  }

  // Turn "B", "2", "ב" (or "b") into a choice number for this layout; -1 if it isn't one.
  function parseChoice(text, layout) {
    const t = String(text).trim();
    if (!t) return -1;
    const labels = labelsFor(layout);
    let i = labels.findIndex((l) => l.toLowerCase() === t.toLowerCase());
    if (i >= 0) return i;
    // Also accept letters or numbers on any sheet: A=1st, 1=1st, א=1st
    for (const style of Object.values(L.CHOICE_STYLES)) {
      i = style.labels.findIndex((l) => l.toLowerCase() === t.toLowerCase());
      if (i >= 0 && i < layout.maxChoices) return i;
    }
    return -1;
  }

  /*
   * Read an answer key from CSV text. Accepts:
   *   - one row per question: "1,B"  or  "1,B;D" (two accepted answers)  (a header row is fine)
   *   - or a single row/column of answers in order: "B,C,A,D,..."
   * Returns { answers, problems }.
   */
  function keyFromCsv(text, layout) {
    const rows = M.roster.parseCsv(text).map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
    const answers = new Array(layout.numQuestions).fill(null).map(() => []);
    const problems = [];
    const splitMulti = (s) => s.split(/[;|/\s]+/).filter(Boolean);

    // One row per question, if there are several rows that start with a question number.
    // (A single row like "1,3,2,4" is a list of answers in order, not "question 1 = 3,2,4".)
    const numbered = rows.length > 1 ? rows.filter((r) => /^\d+$/.test(r[0]) && r.length >= 2 && r[1] !== '') : [];
    if (numbered.length) {
      for (const r of numbered) {
        const q = Number(r[0]);
        if (q < 1 || q > layout.numQuestions) { problems.push('Question ' + q + ' is not on this sheet (it has ' + layout.numQuestions + ').'); continue; }
        const picks = splitMulti(r.slice(1).join(' ')).map((a) => ({ a, i: parseChoice(a, layout) }));
        const bad = picks.filter((p) => p.i < 0);
        if (bad.length) problems.push('Question ' + q + ': "' + bad.map((b) => b.a).join(', ') + '" is not one of the choices.');
        answers[q - 1] = Array.from(new Set(picks.filter((p) => p.i >= 0).map((p) => p.i))).sort((a, b) => a - b);
      }
    } else {
      // answers in order, in one row or one column
      const flat = rows.length === 1 ? rows[0] : rows.map((r) => r[0]);
      flat.forEach((cell, q) => {
        if (q >= layout.numQuestions) return;
        const picks = splitMulti(cell).map((a) => parseChoice(a, layout));
        if (picks.some((i) => i < 0)) problems.push('Question ' + (q + 1) + ': "' + cell + '" is not one of the choices.');
        answers[q] = Array.from(new Set(picks.filter((i) => i >= 0))).sort((a, b) => a - b);
      });
      if (flat.length > layout.numQuestions) problems.push('The file has ' + flat.length + ' answers but the sheet has ' + layout.numQuestions + ' questions; the extra ones were ignored.');
    }
    if (!answers.some((a) => a.length)) problems.push('No answers were found in the file.');
    return { answers, problems };
  }

  function keyToCsv(key) {
    const labels = labelsFor(key.layout);
    const rows = [['Question', 'Answer']];
    key.answers.forEach((a, q) => rows.push([String(q + 1), a.map((i) => labels[i]).join(';')]));
    return M.roster.toCsv(rows);
  }

  // The reader's result → the starting answers (before any review).
  function answersFromRead(read) {
    return read.answers.map((a) => {
      if (a.status === 'ok') return a.choice;
      if (a.status === 'blank') return null;
      if (a.status === 'multiple') return 'multiple';
      return a.choice; // unclear: best guess, but the sheet is flagged for review
    });
  }

  /*
   * Score one sheet. Returns { correct, possible, percent, perQuestion: [true|false|null] }
   * (null = question not counted).
   */
  function score(key, answers) {
    let correct = 0, possible = 0;
    const perQuestion = key.answers.map((accepted, q) => {
      if (!accepted || !accepted.length) return null;
      possible++;
      const a = answers[q];
      const right = typeof a === 'number' && accepted.includes(a);
      if (right) correct++;
      return right;
    });
    return { correct, possible, percent: possible ? Math.round((correct / possible) * 1000) / 10 : 0, perQuestion };
  }

  function answerText(a, layout) {
    if (a === null || a === undefined) return '';
    if (a === 'multiple') return '*';
    return labelsFor(layout)[a] || '?';
  }

  M.grading = { newKey, sameLayout, labelsFor, parseChoice, keyFromCsv, keyToCsv, answersFromRead, score, answerText };
})(typeof window !== 'undefined' ? window : globalThis);
