'use strict';
/*
 * Checks the printed PDF against the layout map: renders the PDF to an image
 * (with the free "pdftoppm" program) and looks at the pixels where the map says
 * markers and bubbles are. If the PDF and the map ever drift apart, this fails.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const M = require('../tools/load-app');
const L = M.sheetLayout;

const SCALE = 2; // pixels per point (144 dpi)

function havePdftoppm() {
  try { execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' }); return true; } catch (e) { return false; }
}

// Render each page to a grayscale image: { width, height, data } with 0 = black, 255 = white.
function renderPages(pdfBytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'millim-'));
  const pdf = path.join(dir, 'in.pdf');
  fs.writeFileSync(pdf, pdfBytes);
  execFileSync('pdftoppm', ['-gray', '-r', String(72 * SCALE), pdf, path.join(dir, 'page')]);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.pgm')).sort();
  const pages = files.map((f) => readPgm(fs.readFileSync(path.join(dir, f))));
  fs.rmSync(dir, { recursive: true, force: true });
  return pages;
}

function readPgm(buf) {
  let pos = 0;
  const tokens = [];
  while (tokens.length < 4) {
    while (/\s/.test(String.fromCharCode(buf[pos]))) pos++;
    if (buf[pos] === 35) { while (buf[pos] !== 10) pos++; continue; }
    let t = '';
    while (!/\s/.test(String.fromCharCode(buf[pos]))) t += String.fromCharCode(buf[pos++]);
    tokens.push(t);
  }
  pos++;
  return { width: Number(tokens[1]), height: Number(tokens[2]), data: buf.subarray(pos) };
}

// Average darkness (0 = white, 1 = black) inside a circle, in page points.
function darkness(img, x, y, r) {
  let sum = 0, n = 0;
  const cx = x * SCALE, cy = y * SCALE, rr = r * SCALE;
  for (let py = Math.floor(cy - rr); py <= Math.ceil(cy + rr); py++) {
    for (let px = Math.floor(cx - rr); px <= Math.ceil(cx + rr); px++) {
      if ((px - cx) ** 2 + (py - cy) ** 2 > rr * rr) continue;
      sum += 1 - img.data[py * img.width + px] / 255;
      n++;
    }
  }
  return sum / n;
}

// Darkness along a thin ring (where a bubble's outline should be).
function ringDarkness(img, x, y, r) {
  let best = 0;
  for (const rr of [r - 0.5, r, r + 0.5]) {
    let sum = 0;
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      const px = Math.round((x + rr * Math.cos(a)) * SCALE), py = Math.round((y + rr * Math.sin(a)) * SCALE);
      sum += 1 - img.data[py * img.width + px] / 255;
    }
    best = Math.max(best, sum / 32);
  }
  return best;
}

function checkPage(img, layout, student) {
  assert.strictEqual(img.width, layout.page.width * SCALE);
  for (const f of layout.fiducials) {
    if (f.hole) {
      assert.ok(darkness(img, f.x, f.y, f.hole / 2 - 1) < 0.05, 'hole in ' + f.name);
      assert.ok(darkness(img, f.x - f.size / 2 + 4, f.y, 3) > 0.95, 'ring of ' + f.name);
    } else {
      assert.ok(darkness(img, f.x, f.y, f.size / 2 - 2) > 0.95, f.name + ' marker');
    }
  }
  layout.codeCells.forEach((c, i) => {
    const d = darkness(img, c.x, c.y, c.size / 2 - 1.5);
    if (layout.codeBits[i]) assert.ok(d > 0.9, 'code cell ' + i + ' should be black');
    else assert.ok(d < 0.05, 'code cell ' + i + ' should be white');
  });
  const digits = student ? student.id.split('').map(Number) : null;
  for (const b of layout.id.bubbles) {
    const d = darkness(img, b.x, b.y, b.r * 0.7);
    if (digits && digits[b.digit] === b.value) assert.ok(d > 0.9, 'pre-filled ID bubble');
    else {
      assert.ok(d < 0.35, 'empty ID bubble ' + b.digit + '/' + b.value + ' darkness ' + d.toFixed(2));
      assert.ok(ringDarkness(img, b.x, b.y, b.r) > 0.3, 'ID bubble outline where the map says');
    }
  }
  for (const q of layout.answers.questions) {
    for (const c of q.choices) {
      const d = darkness(img, c.x, c.y, c.r * 0.7);
      assert.ok(d < 0.35, 'Q' + q.number + ' empty bubble darkness ' + d.toFixed(2));
      const ring = ringDarkness(img, c.x, c.y, c.r);
      if (c.printed) assert.ok(ring > 0.3, 'Q' + q.number + ' choice ' + c.label + ' outline where the map says');
      else assert.ok(ring < 0.05, 'Q' + q.number + ' choice ' + c.label + ' should not be printed');
    }
  }
}

const skip = havePdftoppm() ? false : 'pdftoppm is not installed';

test('blank sheets: the PDF matches the layout map', { skip }, async () => {
  for (const quiz of [
    { title: 'English test', numQuestions: 30, choiceStyle: 'numbers', defaultChoices: 5 },
    { title: 'מבחן', numQuestions: 100, choiceStyle: 'hebrew', defaultChoices: 5, choiceOverrides: [{ from: 91, to: 100, choices: 2 }] },
    { title: 'Six choices', numQuestions: 100, choiceStyle: 'letters', defaultChoices: 6 },
  ]) {
    const pages = renderPages(await M.sheetPdf.create({ quiz, students: null, copies: 2 }));
    assert.strictEqual(pages.length, 2);
    checkPage(pages[0], L.sheetLayout(quiz), null);
  }
});

test('pre-filled sheets: one page per student, ID bubbles filled in', { skip }, async () => {
  const roster = M.roster.fromCsv(fs.readFileSync(path.join(__dirname, '..', 'data', 'roster.csv'), 'utf8'));
  const students = M.roster.studentsInClass(roster, roster.classes[0]).slice(0, 3);
  const quiz = { title: 'Pre-filled', numQuestions: 20, choiceStyle: 'letters', defaultChoices: 4 };
  const pages = renderPages(await M.sheetPdf.create({ quiz, students }));
  assert.strictEqual(pages.length, students.length);
  pages.forEach((img, i) => checkPage(img, L.sheetLayout(quiz), students[i]));
});

test('test packet: instruction page + sheets A, B, C', { skip }, async () => {
  const pages = renderPages(await M.testSheets.createPacket());
  assert.strictEqual(pages.length, 4);
  M.testSheets.SHEETS.forEach((sheet, i) => checkPage(pages[i + 1], L.sheetLayout(sheet.quiz), sheet.student));
});

test('a whole grade (about 125 sheets) is created quickly', async () => {
  const roster = M.roster.fromCsv(fs.readFileSync(path.join(__dirname, '..', 'data', 'roster.csv'), 'utf8'));
  const grade = M.roster.gradesOf(roster)[0];
  const students = M.roster.studentsInGrade(roster, grade);
  const started = Date.now();
  const bytes = await M.sheetPdf.create({ quiz: { numQuestions: 100, choiceStyle: 'hebrew', defaultChoices: 5 }, students });
  const doc = await globalThis.PDFLib.PDFDocument.load(bytes);
  assert.strictEqual(doc.getPageCount(), students.length);
  assert.ok(Date.now() - started < 20000, 'took ' + (Date.now() - started) + ' ms');
});
