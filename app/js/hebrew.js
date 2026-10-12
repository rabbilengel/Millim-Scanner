/*
 * Hebrew helpers.
 *  - Class codes: "4_1"  <->  "ד-א"
 *  - Right-to-left text for PDFs: the PDF library draws text left to right,
 *    so we split each line into Hebrew and non-Hebrew pieces ("runs") and
 *    place them in the correct visual order ourselves.
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});

  // Hebrew letters used as numbers: 1 = א, 2 = ב, ... 10 = י
  const HEBREW_NUMBER_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י'];

  function hebrewLetterForNumber(n) {
    return HEBREW_NUMBER_LETTERS[n - 1] || String(n);
  }

  // "4_1" -> { grade: 4, classNum: 1 }   (returns null if the code doesn't look right)
  function parseClassCode(code) {
    const m = /^\s*(\d{1,2})\s*_\s*(\d{1,2})\s*$/.exec(String(code || ''));
    if (!m) return null;
    return { grade: Number(m[1]), classNum: Number(m[2]) };
  }

  // "4_1" -> "ד-א"
  function classLabel(code) {
    const p = parseClassCode(code);
    if (!p) return String(code || '');
    return hebrewLetterForNumber(p.grade) + '-' + hebrewLetterForNumber(p.classNum);
  }

  // 4 -> "ד"
  function gradeLabel(grade) {
    return hebrewLetterForNumber(Number(grade));
  }

  // ---------- Right-to-left text for PDFs ----------

  const HEBREW_RE = /[֐-׿יִ-ﭏ]/;
  const STRONG_LTR_RE = /[A-Za-z0-9À-ɏ]/;
  const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' };

  function charDirection(ch) {
    if (HEBREW_RE.test(ch)) return 'rtl';
    if (STRONG_LTR_RE.test(ch)) return 'ltr';
    return null; // spaces, punctuation: take direction from their neighbours
  }

  function containsHebrew(text) {
    return HEBREW_RE.test(text);
  }

  /*
   * Split text into runs, returned in the order they should be drawn from
   * LEFT to RIGHT on the page.
   * baseDir is the direction of the whole line: 'rtl' for Hebrew lines, 'ltr' for English lines.
   *
   * Each run is { text, dir }. For dir 'rtl' runs, `text` is still in reading
   * order; use toDrawable() to get the string to hand to the PDF library.
   */
  function visualRuns(text, baseDir) {
    baseDir = baseDir || 'rtl';
    const chars = Array.from(String(text));
    const dirs = chars.map(charDirection);

    // Resolve neutrals: if the strong directions on both sides agree, use that; else the base.
    for (let i = 0; i < chars.length; i++) {
      if (dirs[i]) continue;
      let before = null;
      for (let j = i - 1; j >= 0; j--) if (charDirection(chars[j])) { before = charDirection(chars[j]); break; }
      let after = null;
      for (let j = i + 1; j < chars.length; j++) if (charDirection(chars[j])) { after = charDirection(chars[j]); break; }
      dirs[i] = before && before === after ? before : baseDir;
    }

    const runs = [];
    for (let i = 0; i < chars.length; i++) {
      const last = runs[runs.length - 1];
      if (last && last.dir === dirs[i]) last.text += chars[i];
      else runs.push({ text: chars[i], dir: dirs[i] });
    }
    if (baseDir === 'rtl') runs.reverse();
    return runs;
  }

  /*
   * The PDF library's font engine (fontkit) already reverses any run that
   * contains Hebrew letters. For such runs we only mirror brackets.
   * Runs with no Hebrew letters (e.g. " - " between two Hebrew words) are not
   * reversed by fontkit, so we reverse them here.
   */
  function toDrawable(run) {
    if (run.dir !== 'rtl') return run.text;
    const mirrored = Array.from(run.text).map((c) => MIRROR[c] || c);
    return containsHebrew(run.text) ? mirrored.join('') : mirrored.reverse().join('');
  }

  M.hebrew = {
    hebrewLetterForNumber,
    parseClassCode,
    classLabel,
    gradeLabel,
    containsHebrew,
    visualRuns,
    toDrawable,
  };
})(typeof window !== 'undefined' ? window : globalThis);
