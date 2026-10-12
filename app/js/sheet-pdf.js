/*
 * SHEET PDF — draws answer sheets as a PDF, using the positions in sheet-layout.js.
 *
 *   const bytes = await Millim.sheetPdf.create({
 *     quiz: { title, numQuestions, choiceStyle, defaultChoices, choiceOverrides },
 *     students: [student, ...] | null,   // null = blank sheets
 *     copies: 1,                          // blank sheets only
 *   });
 *
 * Uses pdf-lib (PDFLib) + fontkit and the embedded Heebo font.
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});
  const H = M.hebrew;
  const L = M.sheetLayout;

  const BLACK = [0, 0, 0];
  const INK = [0.12, 0.12, 0.12];
  const BUBBLE_LINE = [0.3, 0.3, 0.3];
  const BUBBLE_LABEL = [0.5, 0.5, 0.5];
  const FAINT = [0.6, 0.6, 0.6];

  function base64ToBytes(b64) {
    if (typeof atob === 'function') {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return Uint8Array.from(Buffer.from(b64, 'base64'));
  }

  // Wraps a pdf-lib page so we can use top-left coordinates and handle Hebrew.
  function Painter(pdf, page, fonts) {
    const PDFLib = root.PDFLib;
    const pageH = page.getHeight();
    const rgb = (c) => PDFLib.rgb(c[0], c[1], c[2]);

    function textWidth(text, opts) {
      const font = opts.bold ? fonts.bold : fonts.regular;
      return H.visualRuns(text, opts.dir || 'rtl')
        .reduce((w, run) => w + font.widthOfTextAtSize(H.toDrawable(run), opts.size), 0);
    }

    return {
      textWidth,
      // opts: { x, y (baseline), size, bold, align: 'left'|'center'|'right', dir: 'rtl'|'ltr', color }
      text(text, opts) {
        text = String(text == null ? '' : text);
        if (!text) return;
        const font = opts.bold ? fonts.bold : fonts.regular;
        const dir = opts.dir || (H.containsHebrew(text) ? 'rtl' : 'ltr');
        const runs = H.visualRuns(text, dir);
        const total = runs.reduce((w, run) => w + font.widthOfTextAtSize(H.toDrawable(run), opts.size), 0);
        let x = opts.x;
        if (opts.align === 'center') x -= total / 2;
        else if (opts.align === 'right') x -= total;
        for (const run of runs) {
          const s = H.toDrawable(run);
          page.drawText(s, { x, y: pageH - opts.y, size: opts.size, font, color: rgb(opts.color || INK) });
          x += font.widthOfTextAtSize(s, opts.size);
        }
      },
      rect(x, y, w, h, opts) {
        opts = opts || {};
        page.drawRectangle({
          x, y: pageH - y - h, width: w, height: h,
          color: opts.fill ? rgb(opts.fill) : undefined,
          borderColor: opts.stroke ? rgb(opts.stroke) : undefined,
          borderWidth: opts.stroke ? (opts.lineWidth || 0.8) : 0,
        });
      },
      circle(x, y, r, opts) {
        opts = opts || {};
        page.drawEllipse({
          x, y: pageH - y, xScale: r, yScale: r,
          color: opts.fill ? rgb(opts.fill) : undefined,
          borderColor: opts.stroke ? rgb(opts.stroke) : undefined,
          borderWidth: opts.stroke ? (opts.lineWidth || 0.8) : 0,
        });
      },
      line(x1, y1, x2, y2, opts) {
        opts = opts || {};
        page.drawLine({
          start: { x: x1, y: pageH - y1 }, end: { x: x2, y: pageH - y2 },
          thickness: opts.lineWidth || 0.8, color: rgb(opts.color || INK),
        });
      },
    };
  }

  // A bubble with its label printed lightly inside.
  function drawBubble(p, b, filled) {
    if (filled) {
      p.circle(b.x, b.y, b.r, { fill: BLACK });
      return;
    }
    p.circle(b.x, b.y, b.r, { stroke: BUBBLE_LINE, lineWidth: 0.8 });
    const size = b.r * 1.15;
    p.text(b.label, { x: b.x, y: b.y + size * 0.36, size, align: 'center', color: BUBBLE_LABEL, dir: 'ltr' });
  }

  function drawMarkers(p, layout) {
    for (const f of layout.fiducials) {
      p.rect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size, { fill: BLACK });
      if (f.hole) p.rect(f.x - f.hole / 2, f.y - f.hole / 2, f.hole, f.hole, { fill: [1, 1, 1] });
    }
    layout.codeCells.forEach((c, i) => {
      if (layout.codeBits[i]) p.rect(c.x - c.size / 2, c.y - c.size / 2, c.size, c.size, { fill: BLACK });
    });
  }

  function drawIdGrid(p, layout, student) {
    const g = layout.id;
    p.rect(g.frame.x, g.frame.y, g.frame.w, g.frame.h, { stroke: FAINT, lineWidth: 0.6 });
    p.text('מספר תלמיד  Student ID', { x: g.centerX, y: g.labelY - 2, size: 8, align: 'center', bold: true });
    const digits = student ? student.id.split('') : null;
    for (const box of g.boxes) {
      p.rect(box.x - box.w / 2, box.y - box.h / 2, box.w, box.h, { stroke: BUBBLE_LINE, lineWidth: 0.6 });
      if (digits) p.text(digits[box.digit], { x: box.x, y: box.y + 4.5, size: 12, bold: true, align: 'center', dir: 'ltr' });
    }
    for (const b of g.bubbles) {
      drawBubble(p, b, digits ? Number(digits[b.digit]) === b.value : false);
    }
  }

  function drawExampleMarks(p, x, y, r) {
    // Correct: fully filled
    p.circle(x, y, r, { fill: BLACK });
    // Wrong examples: check mark, X, small dot, half filled
    let ex = x - 70;
    const wrong = [
      (cx) => { p.circle(cx, y, r, { stroke: BUBBLE_LINE }); p.line(cx - 3.5, y, cx - 1, y + 3, { lineWidth: 1.2 }); p.line(cx - 1, y + 3, cx + 4, y - 4, { lineWidth: 1.2 }); },
      (cx) => { p.circle(cx, y, r, { stroke: BUBBLE_LINE }); p.line(cx - 3.5, y - 3.5, cx + 3.5, y + 3.5, { lineWidth: 1.2 }); p.line(cx - 3.5, y + 3.5, cx + 3.5, y - 3.5, { lineWidth: 1.2 }); },
      (cx) => { p.circle(cx, y, r, { stroke: BUBBLE_LINE }); p.circle(cx, y, 1.8, { fill: BLACK }); },
      (cx) => { p.circle(cx, y, r, { stroke: BUBBLE_LINE }); p.rect(cx - r * 0.7, y, r * 1.4, r * 0.6, { fill: BLACK }); },
    ];
    for (const draw of wrong) { draw(ex); ex -= 20; }
  }

  function drawHeader(p, layout, title, student) {
    const h = layout.header;
    const right = h.right;
    if (title) p.text(title, { x: layout.page.width / 2, y: h.titleY, size: 15, bold: true, align: 'center' });

    if (student) {
      const hebName = [student.hebFirst, student.hebLast].filter(Boolean).join(' ');
      p.text('שם: ' + (hebName || student.firstName + ' ' + student.lastName), { x: right, y: h.top + 14, size: 14, bold: true, align: 'right', dir: 'rtl' });
      p.text('כיתה: ' + student.classLabel, { x: right, y: h.top + 34, size: 12, bold: true, align: 'right', dir: 'rtl' });
      p.text('תאריך: ____________', { x: right - 110, y: h.top + 34, size: 11, align: 'right', dir: 'rtl' });
      p.text(student.firstName + ' ' + student.lastName + '  ·  ' + student.classCode + '  ·  ID ' + student.id,
        { x: right, y: h.top + 50, size: 8.5, align: 'right', dir: 'ltr', color: [0.35, 0.35, 0.35] });
    } else {
      p.text('שם: ________________________________', { x: right, y: h.top + 16, size: 12, align: 'right', dir: 'rtl' });
      p.text('כיתה: __________      תאריך: ______________', { x: right, y: h.top + 42, size: 12, align: 'right', dir: 'rtl' });
    }

    // Instructions box
    const boxTop = h.top + 62, boxBottom = h.bottom, boxLeft = h.left + 8;
    p.rect(boxLeft, boxTop, right - boxLeft, boxBottom - boxTop, { stroke: FAINT, lineWidth: 0.6 });
    const lines = [
      'מלאו את העיגול כולו בעיפרון כהה.',
      'סמנו תשובה אחת בלבד לכל שאלה.',
      'כדי לשנות תשובה – מחקו היטב.',
      student ? 'מספר התלמיד כבר מסומן – אין צורך לסמן אותו.' : 'כתבו את מספר התלמיד במשבצות וסמנו את העיגולים מתחתיו.',
    ];
    const tx = right - 10;
    p.text('הוראות', { x: tx, y: boxTop + 16, size: 10.5, bold: true, align: 'right', dir: 'rtl' });
    lines.forEach((t, i) => p.text('•  ' + t, { x: tx, y: boxTop + 32 + i * 14, size: 9.5, align: 'right', dir: 'rtl' }));

    const exY = boxBottom - 20;
    p.text('נכון:', { x: tx, y: exY + 3.5, size: 9.5, bold: true, align: 'right', dir: 'rtl' });
    drawExampleMarks(p, tx - 36, exY, 6);
    p.text('לא נכון:', { x: tx - 60, y: exY + 3.5, size: 9.5, bold: true, align: 'right', dir: 'rtl' });
    // wrong examples are drawn to the left of "לא נכון:"
  }

  function drawAnswers(p, layout) {
    const grid = layout.answers;
    for (const q of grid.questions) {
      p.text(String(q.number), { x: q.numberX, y: q.y + 3.4, size: 9.5, bold: true, align: q.numberAlign, dir: 'ltr' });
      for (const c of q.choices) if (c.printed) drawBubble(p, c, false);
    }
  }

  function drawFooter(p, layout, title) {
    const q = layout.quiz;
    const style = L.CHOICE_STYLES[q.choiceStyle];
    const info = q.numQuestions + ' questions  ·  ' + style.labels.slice(0, q.maxChoices).join(' ') + '  ·  layout v' + layout.version;
    p.text('Millim Scanner  ·  ' + info, { x: layout.page.width / 2, y: layout.footerY, size: 7, align: 'center', dir: 'ltr', color: FAINT });
  }

  function drawSheet(p, layout, title, student) {
    drawMarkers(p, layout);
    drawHeader(p, layout, title, student);
    drawIdGrid(p, layout, student);
    drawAnswers(p, layout);
    drawFooter(p, layout, title);
  }

  async function newDocument() {
    const PDFLib = root.PDFLib;
    const pdf = await PDFLib.PDFDocument.create();
    pdf.registerFontkit(root.fontkit);
    // Ligatures off: pdf-lib spaces combined letters like "ff" incorrectly.
    const options = { features: { liga: false } };
    const fonts = {
      regular: await pdf.embedFont(base64ToBytes(root.HEEBO_FONT.regular), options),
      bold: await pdf.embedFont(base64ToBytes(root.HEEBO_FONT.bold), options),
    };
    return { pdf, fonts };
  }

  async function create(opts) {
    const layout = L.sheetLayout(opts.quiz);
    const { pdf, fonts } = await newDocument();
    const title = (opts.quiz.title || '').trim();
    pdf.setTitle(title || 'Answer sheets');
    pdf.setCreator('Millim Scanner');
    const students = opts.students && opts.students.length ? opts.students : null;
    const pages = students || new Array(Math.max(1, Number(opts.copies) || 1)).fill(null);
    for (const student of pages) {
      const page = pdf.addPage([layout.page.width, layout.page.height]);
      drawSheet(Painter(pdf, page, fonts), layout, title, student);
    }
    return pdf.save();
  }

  M.sheetPdf = { create, newDocument, Painter, drawSheet };
})(typeof window !== 'undefined' ? window : globalThis);
