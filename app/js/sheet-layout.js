/*
 * SHEET LAYOUT — the single source of truth for where everything sits on an
 * answer sheet. The PDF maker (sheet-pdf.js) draws from this, and the scan
 * reader will measure from this, so the two can never disagree.
 *
 * Units: points (1/72 inch). Origin: TOP-LEFT corner of the page, y grows downward.
 * Page: US Letter, 612 x 792 points.
 *
 * What the reader relies on:
 *  1. Four corner markers ("fiducials"). Three are solid black squares; the
 *     bottom-left one has a white hole, so the reader can tell which way is up.
 *  2. A "sheet code" strip at the top centre: a row of small squares that
 *     spells out the layout (how many questions, how many choices, which labels).
 *     The reader decodes it and rebuilds the exact same layout from this file.
 *  3. Bubble positions computed below.
 *
 * Only these settings change the bubble positions: number of questions,
 * the largest number of choices, and the label style. Questions with fewer
 * choices simply don't print their extra bubbles.
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});

  const LAYOUT_VERSION = 1;
  const PAGE = { width: 612, height: 792 };
  const MAX_QUESTIONS = 100;
  const MIN_CHOICES = 2;
  const MAX_CHOICES = 6;
  const ID_DIGITS = 7;

  const CHOICE_STYLES = {
    numbers: { code: 0, name: '1 2 3 4 5', labels: ['1', '2', '3', '4', '5', '6'], rtl: false },
    letters: { code: 1, name: 'A B C D E', labels: ['A', 'B', 'C', 'D', 'E', 'F'], rtl: false },
    hebrew: { code: 2, name: 'א ב ג ד ה', labels: ['א', 'ב', 'ג', 'ד', 'ה', 'ו'], rtl: true },
  };

  // ---------- Corner markers ----------
  const FIDUCIAL_SIZE = 30;      // side of each square
  const FIDUCIAL_INSET = 24;     // distance from the paper edge to the square
  const FIDUCIAL_HOLE = 12;      // white hole in the bottom-left marker

  function fiducials() {
    const c = FIDUCIAL_INSET + FIDUCIAL_SIZE / 2;
    const W = PAGE.width, Hh = PAGE.height;
    return [
      { name: 'topLeft', x: c, y: c, size: FIDUCIAL_SIZE, hole: 0 },
      { name: 'topRight', x: W - c, y: c, size: FIDUCIAL_SIZE, hole: 0 },
      { name: 'bottomRight', x: W - c, y: Hh - c, size: FIDUCIAL_SIZE, hole: 0 },
      { name: 'bottomLeft', x: c, y: Hh - c, size: FIDUCIAL_SIZE, hole: FIDUCIAL_HOLE },
    ];
  }

  // ---------- Sheet code strip ----------
  // [start=1] [16 data bits] [4 check bits] [end=1]  -> 22 cells
  const CODE_DATA_BITS = 16;
  const CODE_CHECK_BITS = 4;
  const CODE_CELLS = 1 + CODE_DATA_BITS + CODE_CHECK_BITS + 1;
  const CODE_CELL = 9;
  const CODE_PITCH = 12;

  function codeStripCells() {
    const width = (CODE_CELLS - 1) * CODE_PITCH + CODE_CELL;
    const x0 = PAGE.width / 2 - width / 2 + CODE_CELL / 2;
    const y = FIDUCIAL_INSET + FIDUCIAL_SIZE / 2;
    const cells = [];
    for (let i = 0; i < CODE_CELLS; i++) cells.push({ index: i, x: x0 + i * CODE_PITCH, y, size: CODE_CELL });
    return cells;
  }

  function checksum(data) {
    // sum of the four 4-bit pieces, plus 5 so that "all blank" is never valid
    return ((data & 15) + ((data >> 4) & 15) + ((data >> 8) & 15) + ((data >> 12) & 15) + 5) & 15;
  }

  // Layout settings -> array of 0/1, one per cell
  function encodeSheetCode(spec) {
    const style = CHOICE_STYLES[spec.choiceStyle];
    const data =
      (LAYOUT_VERSION & 7) |
      (((spec.numQuestions - 1) & 127) << 3) |
      (((spec.maxChoices - MIN_CHOICES) & 7) << 10) |
      ((style.code & 3) << 13);
    const check = checksum(data);
    const bits = [1];
    for (let i = 0; i < CODE_DATA_BITS; i++) bits.push((data >> i) & 1);
    for (let i = 0; i < CODE_CHECK_BITS; i++) bits.push((check >> i) & 1);
    bits.push(1);
    return bits;
  }

  // Array of 0/1 read from a scan -> layout settings, or null if it doesn't check out
  function decodeSheetCode(bits) {
    if (!bits || bits.length !== CODE_CELLS || bits[0] !== 1 || bits[CODE_CELLS - 1] !== 1) return null;
    let data = 0, check = 0;
    for (let i = 0; i < CODE_DATA_BITS; i++) data |= (bits[1 + i] ? 1 : 0) << i;
    for (let i = 0; i < CODE_CHECK_BITS; i++) check |= (bits[1 + CODE_DATA_BITS + i] ? 1 : 0) << i;
    if (checksum(data) !== check) return null;
    const version = data & 7;
    const numQuestions = ((data >> 3) & 127) + 1;
    const maxChoices = ((data >> 10) & 7) + MIN_CHOICES;
    const styleCode = (data >> 13) & 3;
    const choiceStyle = Object.keys(CHOICE_STYLES).find((k) => CHOICE_STYLES[k].code === styleCode);
    if (version !== LAYOUT_VERSION || !choiceStyle || numQuestions > MAX_QUESTIONS || maxChoices > MAX_CHOICES) return null;
    return { version, numQuestions, maxChoices, choiceStyle };
  }

  // ---------- Student ID grid (always left to right, digits 0-9 top to bottom) ----------
  const ID = {
    left: 60, top: 96,                 // block frame
    colPitch: 17, rowPitch: 14.4, bubble: 11.6,
    labelY: 108, boxTop: 116, boxHeight: 18, boxWidth: 14.5,
    firstRowY: 147,
  };
  ID.firstColX = ID.left + 14;
  ID.width = (ID_DIGITS - 1) * ID.colPitch + 28;
  ID.bottom = ID.firstRowY + 9 * ID.rowPitch + 10;

  function idGrid() {
    const boxes = [];
    const bubbles = [];
    for (let d = 0; d < ID_DIGITS; d++) {
      const x = ID.firstColX + d * ID.colPitch;
      boxes.push({ digit: d, x, y: ID.boxTop + ID.boxHeight / 2, w: ID.boxWidth, h: ID.boxHeight });
      for (let v = 0; v <= 9; v++) {
        bubbles.push({ digit: d, value: v, label: String(v), x, y: ID.firstRowY + v * ID.rowPitch, r: ID.bubble / 2 });
      }
    }
    return {
      frame: { x: ID.left, y: ID.top, w: ID.width, h: ID.bottom - ID.top },
      labelY: ID.labelY,
      centerX: ID.left + ID.width / 2,
      boxes,
      bubbles,
    };
  }

  // ---------- Header area (to the right of the ID grid) ----------
  const HEADER = { left: 200, right: 552, titleY: 78, top: 96, bottom: ID.bottom };

  // ---------- Answer area ----------
  const ANSWERS = {
    left: 60, right: 552, top: 308,
    maxRowsPerColumn: 25,
    rowPitch: 16.8,
    groupEvery: 5, groupGap: 4,
    columnWidth: 116,
    numberWidth: 20, numberGap: 5,
    maxBubblePitch: 17.5, maxBubble: 12.5,
  };

  /*
   * Normalise quiz settings.
   * quiz = {
   *   numQuestions: 1..100,
   *   choiceStyle: 'numbers' | 'letters' | 'hebrew',
   *   defaultChoices: 2..6,
   *   choiceOverrides: [{ from, to, choices }]   (optional, e.g. questions 16-20 have 2 choices)
   * }
   */
  function normalizeQuiz(quiz) {
    const numQuestions = clampInt(quiz.numQuestions, 1, MAX_QUESTIONS, 20);
    const choiceStyle = CHOICE_STYLES[quiz.choiceStyle] ? quiz.choiceStyle : 'numbers';
    const defaultChoices = clampInt(quiz.defaultChoices, MIN_CHOICES, MAX_CHOICES, 5);
    const choicesPerQuestion = [];
    for (let q = 1; q <= numQuestions; q++) choicesPerQuestion.push(defaultChoices);
    for (const o of quiz.choiceOverrides || []) {
      const from = clampInt(o.from, 1, numQuestions, 1);
      const to = clampInt(o.to, from, numQuestions, from);
      const n = clampInt(o.choices, MIN_CHOICES, MAX_CHOICES, defaultChoices);
      for (let q = from; q <= to; q++) choicesPerQuestion[q - 1] = n;
    }
    const maxChoices = Math.max.apply(null, choicesPerQuestion);
    return { numQuestions, choiceStyle, defaultChoices, choicesPerQuestion, maxChoices };
  }

  function clampInt(v, lo, hi, dflt) {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return dflt;
    return Math.min(hi, Math.max(lo, n));
  }

  /*
   * Bubble positions for every question.
   * spec = { numQuestions, maxChoices, choiceStyle }  (+ optional choicesPerQuestion)
   * Returns { columns, rowsPerColumn, rtl, questions: [{ number, numberX, numberAlign, y, choices: [{ index, label, x, y, r, printed }] }] }
   */
  function answerGrid(spec) {
    const A = ANSWERS;
    const style = CHOICE_STYLES[spec.choiceStyle];
    const n = spec.numQuestions;
    const maxC = spec.maxChoices;
    const columns = Math.ceil(n / A.maxRowsPerColumn);
    const rowsPerColumn = Math.ceil(n / columns);
    const slot = (A.right - A.left) / columns;
    const pitch = Math.min(A.maxBubblePitch, (A.columnWidth - A.numberWidth - A.numberGap) / maxC);
    const radius = Math.min(A.maxBubble, pitch - 3.5) / 2;
    const rtl = style.rtl;
    const flip = (x) => (rtl ? PAGE.width - x : x);

    const questions = [];
    for (let i = 0; i < n; i++) {
      const col = Math.floor(i / rowsPerColumn);
      const row = i % rowsPerColumn;
      const colLeft = A.left + col * slot + (slot - A.columnWidth) / 2;
      const y = A.top + row * A.rowPitch + Math.floor(row / A.groupEvery) * A.groupGap;
      const firstBubbleX = colLeft + A.numberWidth + A.numberGap + pitch / 2;
      const printedCount = spec.choicesPerQuestion ? spec.choicesPerQuestion[i] : maxC;
      const choices = [];
      for (let c = 0; c < maxC; c++) {
        choices.push({ index: c, label: style.labels[c], x: flip(firstBubbleX + c * pitch), y, r: radius, printed: c < printedCount });
      }
      // The number sits right next to its own bubbles (to their left, or to their right on Hebrew sheets).
      questions.push({ number: i + 1, numberX: flip(colLeft + A.numberWidth), numberAlign: rtl ? 'left' : 'right', y, choices });
    }
    return { columns, rowsPerColumn, rtl, pitch, radius, questions };
  }

  // Everything about one sheet design, in one object.
  function sheetLayout(quiz) {
    const q = normalizeQuiz(quiz);
    const spec = { numQuestions: q.numQuestions, maxChoices: q.maxChoices, choiceStyle: q.choiceStyle, choicesPerQuestion: q.choicesPerQuestion };
    return {
      version: LAYOUT_VERSION,
      page: PAGE,
      quiz: q,
      fiducials: fiducials(),
      codeCells: codeStripCells(),
      codeBits: encodeSheetCode(spec),
      id: idGrid(),
      header: HEADER,
      answers: answerGrid(spec),
      footerY: PAGE.height - (FIDUCIAL_INSET + FIDUCIAL_SIZE / 2) + 3,
    };
  }

  M.sheetLayout = {
    LAYOUT_VERSION,
    PAGE,
    MAX_QUESTIONS,
    MIN_CHOICES,
    MAX_CHOICES,
    ID_DIGITS,
    CHOICE_STYLES,
    ANSWERS,
    fiducials,
    codeStripCells,
    encodeSheetCode,
    decodeSheetCode,
    idGrid,
    normalizeQuiz,
    answerGrid,
    sheetLayout,
  };
})(typeof window !== 'undefined' ? window : globalThis);
