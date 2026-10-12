/*
 * TEST SHEETS — a printable packet for testing the reader on real scans.
 *
 * Page 1 tells the teacher exactly what to mark on each sheet, so we know
 * the correct reading of every bubble. The same information (EXPECTED) is
 * used by the automated tests once the scans are uploaded.
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});

  // A fake student who is deliberately NOT in the roster (the reader should flag the ID).
  const FAKE_STUDENT = {
    id: '9990001', firstName: 'Test', lastName: 'Student',
    hebFirst: 'תלמיד', hebLast: 'ניסיון', classCode: '4_1', classLabel: 'ד-א',
  };

  const SHEETS = [
    {
      key: 'A',
      quiz: { title: 'Test Sheet A', numQuestions: 30, choiceStyle: 'numbers', defaultChoices: 5 },
      student: null,
      writeId: '1234567',
      steps: [
        'Write 1234567 in the ID boxes and fill in the matching ID bubbles.',
        'Q1-10 (dark pencil): 1, 2, 3, 4, 5, 1, 2, 3, 4, 5',
        'Q11-15 (VERY LIGHT pencil): 5, 4, 3, 2, 1',
        'Q16: fill BOTH 2 and 4 (a double answer).',
        'Q17: fill 3, erase it completely, then fill 1.',
        'Q18: fill 5, erase it only partly (sloppy), then fill 2.',
        'Q19: leave blank.',
        'Q20: draw only a small check mark inside bubble 3 (do not fill it).',
        'Q21-25 (pen): 2, 4, 1, 3, 5',
        'Q26-29: leave blank.   Q30: fill 4.',
      ],
    },
    {
      key: 'B',
      quiz: { title: 'דף ניסיון ב  Test Sheet B', numQuestions: 100, choiceStyle: 'hebrew', defaultChoices: 5 },
      student: null,
      writeId: '7654321',
      steps: [
        'Write 7654321 in the ID boxes and fill in the matching ID bubbles.',
        'Q1-20 (dark pencil): Q1 = א,  Q2 = ב,  Q3 = ג,  Q4 = ד,  Q5 = ה,  then repeat (Q6 = א, Q7 = ב, ...).',
        'Q50: ג     Q76: ד     Q100: ה',
        'Leave every other question blank.',
      ],
    },
    {
      key: 'C',
      quiz: {
        title: 'Test Sheet C', numQuestions: 20, choiceStyle: 'letters', defaultChoices: 4,
        choiceOverrides: [{ from: 16, to: 20, choices: 2 }],
      },
      student: FAKE_STUDENT,
      steps: [
        'This sheet is pre-filled for a made-up student (ID 9990001) who is not on the roster.',
        'Q1-15 (dark pencil): repeat the pattern  A, B, C, D  (Q1 = A, Q2 = B, ... Q5 = A again).',
        'Q16-20 (dark pencil): A, B, A, B, A',
      ],
    },
  ];

  /*
   * What the reader should report for each sheet.
   * Each answer is a list of acceptable results: a choice label, 'blank',
   * or 'review' (the reader flags it for the teacher to check).
   */
  function expected() {
    const pattern = (labels, from, to) => {
      const out = {};
      for (let q = from; q <= to; q++) out[q] = [labels[(q - from) % labels.length]];
      return out;
    };
    const blanks = (out, n) => { for (let q = 1; q <= n; q++) if (!out[q]) out[q] = ['blank']; return out; };

    const a = Object.assign(
      {},
      pattern(['1', '2', '3', '4', '5'], 1, 10),
      { 11: ['5'], 12: ['4'], 13: ['3'], 14: ['2'], 15: ['1'] },
      { 16: ['review'], 17: ['1'], 18: ['2', 'review'], 20: ['review', '3', 'blank'] },
      { 21: ['2'], 22: ['4'], 23: ['1'], 24: ['3'], 25: ['5'], 30: ['4'] }
    );
    const b = Object.assign({}, pattern(['א', 'ב', 'ג', 'ד', 'ה'], 1, 20), { 50: ['ג'], 76: ['ד'], 100: ['ה'] });
    const c = Object.assign({}, pattern(['A', 'B', 'C', 'D'], 1, 15), { 16: ['A'], 17: ['B'], 18: ['A'], 19: ['B'], 20: ['A'] });

    return {
      A: { id: '1234567', idInRoster: false, answers: blanks(a, 30) },
      B: { id: '7654321', idInRoster: false, answers: blanks(b, 100) },
      C: { id: '9990001', idInRoster: false, answers: blanks(c, 20) },
    };
  }

  function drawPlanPage(painter) {
    const p = painter;
    let y = 60;
    const left = 60;
    const line = (text, opts) => {
      p.text(text, Object.assign({ x: left, y, size: 10.5, dir: 'ltr' }, opts || {}));
      y += (opts && opts.gap) || 16;
    };
    line('Millim Scanner — test packet', { size: 18, bold: true, gap: 26 });
    line('Print this whole packet at 100% size ("Actual size", not "Fit to page").', { gap: 15 });
    line('Fill in Sheets A, B and C exactly as described below. They test the reader on real scans.', { gap: 26 });

    for (const sheet of SHEETS) {
      line('Sheet ' + sheet.key + '  (' + sheet.quiz.numQuestions + ' questions)', { size: 13, bold: true, gap: 18 });
      for (const step of sheet.steps) line('•  ' + step, { x: left + 10, gap: 15 });
      y += 10;
    }

    y += 6;
    line('Scanning', { size: 13, bold: true, gap: 18 });
    [
      'Scan Sheets A, B and C together into ONE PDF (you may include this page too).',
      'Use grayscale at 300 dpi if your copier offers it (200 dpi is also fine).',
      'Turn Sheet A upside down before scanning, and feed Sheet B a little crooked.',
      'If you can, scan the same sheets a second time in black-and-white mode, as a second PDF.',
      'Then upload the PDF(s) to the "test-scans" folder in the repository (see the README).',
    ].forEach((t) => line('•  ' + t, { x: left + 10, gap: 15 }));
  }

  // Build the whole packet (plan page + sheets A, B, C) as PDF bytes.
  async function createPacket() {
    const S = M.sheetPdf;
    const L = M.sheetLayout;
    const { pdf, fonts } = await S.newDocument();
    pdf.setTitle('Millim Scanner test packet');
    pdf.setCreator('Millim Scanner');
    const W = L.PAGE.width, Hh = L.PAGE.height;
    drawPlanPage(S.Painter(pdf, pdf.addPage([W, Hh]), fonts));
    for (const sheet of SHEETS) {
      const layout = L.sheetLayout(sheet.quiz);
      S.drawSheet(S.Painter(pdf, pdf.addPage([W, Hh]), fonts), layout, sheet.quiz.title, sheet.student);
    }
    return pdf.save();
  }

  M.testSheets = { FAKE_STUDENT, SHEETS, expected, createPacket };
})(typeof window !== 'undefined' ? window : globalThis);
