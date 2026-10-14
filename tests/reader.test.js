'use strict';
/*
 * Scan reader tests.
 *  1. Real scans in test-scans/ must read exactly as the test packet's instructions say.
 *  2. Distorted copies of those scans (tilted, sideways, photographed at an angle,
 *     low resolution, shadowed, grainy) must read the same.
 *  3. Computer-filled sheets of other layouts (6 choices, Hebrew, 100 questions, pre-filled) must read correctly.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const M = require('../tools/load-app');
const H = require('./helpers/images');

const L = M.sheetLayout;
const skip = H.havePdftoppm() ? false : 'pdftoppm is not installed';
const SCAN_DIR = path.join(__dirname, '..', 'test-scans');
const EXPECTED = M.testSheets.expected();

// What did the reader decide for each question, in the same words as the expectations?
function outcome(a) {
  if (a.status === 'blank') return 'blank';
  if (a.status === 'multiple' || a.status === 'unclear') return 'review';
  return a.label;
}

// Which test-packet sheet is this? (by its layout)
function whichSheet(spec) {
  const sheet = M.testSheets.SHEETS.find((s) => {
    const q = L.normalizeQuiz(s.quiz);
    return q.numQuestions === spec.numQuestions && q.choiceStyle === spec.choiceStyle && q.maxChoices === spec.maxChoices;
  });
  return sheet ? sheet.key : null;
}

function checkAgainstPacket(result, label) {
  assert.ok(result.ok, label + ': ' + result.error);
  const key = whichSheet(result.spec);
  assert.ok(key, label + ': not one of the test packet sheets');
  const exp = EXPECTED[key];
  assert.strictEqual(result.id, exp.id, label + ' (sheet ' + key + '): student ID');
  const wrong = [];
  for (const a of result.answers) {
    const ok = exp.answers[a.number].includes(outcome(a));
    if (!ok) wrong.push('Q' + a.number + ' read "' + outcome(a) + '" (' + a.fills.join(' ') + '), expected ' + exp.answers[a.number].join(' or '));
  }
  assert.deepStrictEqual(wrong, [], label + ' (sheet ' + key + ')');
  return key;
}

const scanFiles = fs.existsSync(SCAN_DIR) ? fs.readdirSync(SCAN_DIR).filter((f) => /\.pdf$/i.test(f)).sort() : [];
const scans = skip ? [] : scanFiles.map((f) => ({ file: f, pages: H.renderPdf(path.join(SCAN_DIR, f), 200) }));

test('real scans in test-scans/ read correctly', { skip: skip || (!scanFiles.length && 'no scans uploaded yet') }, () => {
  for (const scan of scans) {
    const found = new Set();
    scan.pages.forEach((img, i) => {
      const r = M.readSheet.read(img);
      if (!r.ok && /sheet code|corner/.test(r.error)) return; // e.g. the instruction page
      found.add(checkAgainstPacket(r, scan.file + ' page ' + (i + 1)));
    });
    assert.ok(found.size >= 1, scan.file + ': no test sheets found');
  }
});

const DISTORTIONS = {
  'tilted 4 degrees': (img) => H.rotate(img, 4),
  'tilted -9 degrees': (img) => H.rotate(img, -9),
  'turned sideways': (img) => H.rotate(img, 90),
  'photographed at an angle': (img) => H.perspective(img),
  'low resolution (about 120 dpi)': (img) => H.scale(img, 0.6),
  'shadow across the page': (img) => H.shadow(img, 0.45),
  'grainy': (img) => H.noise(img, 30),
  'phone-like: angle + shadow + grain': (img) => H.noise(H.shadow(H.perspective(img), 0.35), 20),
};

for (const [name, distort] of Object.entries(DISTORTIONS)) {
  test('real scans, ' + name, { skip: skip || (!scanFiles.length && 'no scans uploaded yet') }, () => {
    for (const scan of scans) {
      scan.pages.forEach((img, i) => {
        const r = M.readSheet.read(distort(img));
        if (!r.ok && /sheet code|corner/.test(r.error) && !M.readSheet.read(img).ok) return;
        checkAgainstPacket(r, scan.file + ' page ' + (i + 1) + ', ' + name);
      });
    }
  });
}

// ---------- Computer-filled sheets ----------
const DPI = 150;

// Fill a rendered sheet: answers[q] = choice index, null (blank) or [i, j] (double). Returns the image.
function fillSheet(img, layout, answers, id, darkness) {
  layout.answers.questions.forEach((q, i) => {
    const a = answers[i];
    const list = a === null ? [] : Array.isArray(a) ? a : [a];
    list.forEach((c) => H.fillBubble(img, DPI, q.choices[c].x, q.choices[c].y, q.choices[c].r, darkness(i)));
  });
  if (id) id.split('').forEach((d, pos) => {
    const b = layout.id.bubbles.find((x) => x.digit === pos && x.value === Number(d));
    H.fillBubble(img, DPI, b.x, b.y, b.r, 0.8);
  });
  return img;
}

function randomAnswers(quizNorm, seed) {
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  return quizNorm.choicesPerQuestion.map((n, i) => {
    if (i % 11 === 7) return null;                            // some blanks
    if (i % 13 === 5) return [0, n - 1];                       // some doubles
    return Math.floor(rnd() * n);
  });
}

const SYNTHETIC = [
  { title: '100 questions, Hebrew letters', quiz: { numQuestions: 100, choiceStyle: 'hebrew', defaultChoices: 5 } },
  { title: '100 questions, 6 choices', quiz: { numQuestions: 100, choiceStyle: 'letters', defaultChoices: 6 } },
  { title: '12 questions, true/false mix', quiz: { numQuestions: 12, choiceStyle: 'numbers', defaultChoices: 4, choiceOverrides: [{ from: 9, to: 12, choices: 2 }] } },
  { title: '45 questions, pre-filled', quiz: { numQuestions: 45, choiceStyle: 'hebrew', defaultChoices: 4 }, prefilled: true },
];

for (const c of SYNTHETIC) {
  test('computer-filled sheet: ' + c.title, { skip }, async () => {
    const student = { id: '2294268', firstName: 'Meir', lastName: 'Aber', hebFirst: 'מאיר', hebLast: 'אייבער', classCode: '4_4', classLabel: 'ד-ד' };
    const pdf = await M.sheetPdf.create({ quiz: c.quiz, students: c.prefilled ? [student] : null });
    const layout = L.sheetLayout(c.quiz);
    const q = L.normalizeQuiz(c.quiz);
    const answers = randomAnswers(q, c.quiz.numQuestions * 7 + 3);
    // mostly dark pencil, every 4th answer light pencil
    const img = fillSheet(H.renderPdf(pdf, DPI)[0], layout, answers, c.prefilled ? null : '2294268', (i) => (i % 4 === 3 ? 0.4 : 0.75));
    for (const variant of [img, H.rotate(img, 180), H.perspective(img)]) {
      const r = M.readSheet.read(variant, { quiz: c.quiz });
      assert.ok(r.ok, r.error);
      assert.strictEqual(r.id, '2294268');
      r.answers.forEach((a, i) => {
        const exp = answers[i];
        if (exp === null) assert.strictEqual(a.status, 'blank', 'Q' + a.number);
        else if (Array.isArray(exp)) assert.strictEqual(a.status, 'multiple', 'Q' + a.number);
        else {
          assert.strictEqual(a.status, 'ok', 'Q' + a.number + ' ' + a.fills.join(' '));
          assert.strictEqual(a.choice, exp, 'Q' + a.number);
        }
      });
    }
  });
}

test('a page that is not an answer sheet is rejected with a clear message', { skip }, async () => {
  const pages = H.renderPdf(await M.testSheets.createPacket(), 100);
  const r = M.readSheet.read(pages[0]); // the instruction page
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /corner|sheet code/);
});

test('a blank sheet reads as all blank, with the ID flagged as unclear', { skip }, async () => {
  const quiz = { numQuestions: 30, choiceStyle: 'numbers', defaultChoices: 5 };
  const r = M.readSheet.read(H.renderPdf(await M.sheetPdf.create({ quiz }), DPI)[0]);
  assert.ok(r.ok);
  assert.ok(r.answers.every((a) => a.status === 'blank'));
  assert.strictEqual(r.id, null);
  assert.strictEqual(r.needsReview, true);
});
