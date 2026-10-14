/*
 * READ SHEET — turns one image of an answer sheet into answers.
 *
 *   const result = Millim.readSheet.read(grayImage, { quiz })   // quiz is optional
 *
 * Steps:
 *  1. Find the corner markers (find-sheet.js) and work out the page's position.
 *  2. "Straighten" the page into a clean, upright image in page coordinates.
 *  3. Read the sheet code strip → which layout this is (questions, choices, labels).
 *  4. Nudge each row of bubbles into place (scanners stretch paper slightly).
 *  5. Measure how dark each bubble is and decide: answer, blank, double, or unsure.
 *
 * Nothing is guessed: anything unclear is flagged for the teacher to review.
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});
  const I = M.image;
  const L = M.sheetLayout;

  const SCALE = 3; // pixels per point in the straightened page (216 dpi)
  const MAX_SHIFT = 6; // how far (in points, ~2 mm) a row of bubbles may be off from where the corners predict

  // Decision thresholds. "Fill" is how dark a bubble is beyond an empty bubble:
  // 0 = like an empty bubble, 1 = solid black.
  const T = {
    blank: 0.12,        // below this, the darkest bubble is treated as empty
    faint: 0.22,        // a lone mark between blank and this is too faint to trust → teacher reviews it
    secondRatio: 0.5,   // second-darkest / darkest above this → can't tell which one is meant
    doubleMark: 0.3,    // ... and if the second one is also at least this dark → two answers marked
  };

  // ---------- Straighten ----------
  function straighten(img, toImage) {
    const W = Math.round(L.PAGE.width * SCALE), H = Math.round(L.PAGE.height * SCALE);
    const out = I.create(W, H);
    const h = toImage.coefficients;
    for (let v = 0; v < H; v++) {
      const py = (v + 0.5) / SCALE;
      for (let u = 0; u < W; u++) {
        const px = (u + 0.5) / SCALE;
        const w = h[6] * px + h[7] * py + 1;
        const x = (h[0] * px + h[1] * py + h[2]) / w - 0.5;
        const y = (h[3] * px + h[4] * py + h[5]) / w - 0.5;
        out.data[v * W + u] = I.sample(img, x, y);
      }
    }
    return out;
  }

  // ---------- Even out the lighting ----------
  /*
   * Shadows and uneven light make the paper darker in some places. Estimate the
   * paper brightness in each small area (most of any area is blank paper) and
   * brighten every area so its paper becomes white.
   */
  function flattenLighting(page) {
    const block = Math.round(16 * SCALE);
    const bw = Math.ceil(page.width / block), bh = Math.ceil(page.height / block);
    const paper = new Float32Array(bw * bh);
    const hist = new Uint32Array(256);
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        hist.fill(0);
        let n = 0;
        for (let y = by * block; y < Math.min(page.height, (by + 1) * block); y += 2)
          for (let x = bx * block; x < Math.min(page.width, (bx + 1) * block); x += 2) { hist[page.data[y * page.width + x]]++; n++; }
        // brightness that 10% of the pixels are brighter than
        let count = 0, v = 255;
        for (; v > 0; v--) { count += hist[v]; if (count >= n * 0.1) break; }
        paper[by * bw + bx] = v;
      }
    }
    // Smooth: replace each block by the median of its neighbourhood (ignores solid black markers).
    const smooth = new Float32Array(bw * bh);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const near = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = bx + dx, y = by + dy;
        if (x >= 0 && y >= 0 && x < bw && y < bh) near.push(paper[y * bw + x]);
      }
      near.sort((a, b) => a - b);
      smooth[by * bw + bx] = Math.max(40, near[Math.floor(near.length / 2)]);
    }
    const out = I.create(page.width, page.height);
    for (let y = 0; y < page.height; y++) {
      const fy = Math.min(bh - 1, Math.max(0, y / block - 0.5));
      const y0 = Math.floor(fy), y1 = Math.min(bh - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < page.width; x++) {
        const fx = Math.min(bw - 1, Math.max(0, x / block - 0.5));
        const x0 = Math.floor(fx), x1 = Math.min(bw - 1, x0 + 1), tx = fx - x0;
        const p = (smooth[y0 * bw + x0] * (1 - tx) + smooth[y0 * bw + x1] * tx) * (1 - ty) +
                  (smooth[y1 * bw + x0] * (1 - tx) + smooth[y1 * bw + x1] * tx) * ty;
        out.data[y * page.width + x] = (page.data[y * page.width + x] * 255) / p;
      }
    }
    return out;
  }

  // ---------- Measuring on the straightened page (all positions in points) ----------
  function makeMeter(page) {
    // Paper white and ink black for this sheet, so pale scans and dark scans read the same.
    const white = I.percentile(sampleGrid(page, 6), 80);
    const black = Math.min(white - 40, I.percentile(L.fiducials().filter((f) => !f.hole).map((f) => meanIn(page, f.x, f.y, f.size * 0.3)), 50));
    const dark = (v) => Math.max(0, Math.min(1, (white - v) / (white - black)));

    function disc(x, y, r) {
      let sum = 0, n = 0;
      const cx = x * SCALE, cy = y * SCALE, rr = r * SCALE;
      for (let py = Math.floor(cy - rr); py <= Math.ceil(cy + rr); py++) {
        for (let px = Math.floor(cx - rr); px <= Math.ceil(cx + rr); px++) {
          if ((px + 0.5 - cx) ** 2 + (py + 0.5 - cy) ** 2 > rr * rr) continue;
          if (px < 0 || py < 0 || px >= page.width || py >= page.height) continue;
          sum += dark(page.data[py * page.width + px]); n++;
        }
      }
      return n ? sum / n : 0;
    }
    function ring(x, y, r) {
      let sum = 0;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        sum += dark(I.sample(page, (x + r * Math.cos(a)) * SCALE - 0.5, (y + r * Math.sin(a)) * SCALE - 0.5));
      }
      return sum / 24;
    }
    function box(x, y, half) {
      return dark(meanIn(page, x, y, half));
    }
    return { white, black, disc, ring, box };
  }

  function meanIn(page, x, y, half) {
    let sum = 0, n = 0;
    for (let py = Math.round((y - half) * SCALE); py <= Math.round((y + half) * SCALE); py++)
      for (let px = Math.round((x - half) * SCALE); px <= Math.round((x + half) * SCALE); px++) {
        if (px < 0 || py < 0 || px >= page.width || py >= page.height) continue;
        sum += page.data[py * page.width + px]; n++;
      }
    return n ? sum / n : 255;
  }

  function sampleGrid(page, step) {
    const out = [];
    for (let y = 0; y < page.height; y += step * SCALE) for (let x = 0; x < page.width; x += step * SCALE) out.push(page.data[Math.floor(y) * page.width + Math.floor(x)]);
    return out;
  }

  // ---------- Sheet code ----------
  function readCode(meter) {
    const cells = L.codeStripCells();
    const levels = cells.map((c) => meter.box(c.x, c.y, c.size * 0.3));
    const bits = levels.map((d) => (d > 0.5 ? 1 : 0));
    return { bits, levels, spec: L.decodeSheetCode(bits) };
  }

  // ---------- Alignment ----------
  /*
   * Scanners and cameras stretch the paper slightly, so a bubble can be a
   * little off from where the corner markers predict. For each group of
   * bubbles (a question row, or an ID column) try small shifts and keep the
   * one where the printed circles line up best.
   */
  function alignGroup(meter, bubbles, maxShift) {
    const score = (dx, dy) => {
      let sum = 0;
      for (const b of bubbles) {
        // the edge of a bubble: dark at its outline, white just outside it
        sum += meter.ring(b.x + dx, b.y + dy, b.r) - meter.ring(b.x + dx, b.y + dy, b.r + 2.2);
      }
      return sum;
    };
    // Coarse search in 1-point steps, then fine-tune in half-point steps.
    let best = { dx: 0, dy: 0, score: score(0, 0) };
    for (let dy = -maxShift; dy <= maxShift; dy += 1)
      for (let dx = -maxShift; dx <= maxShift; dx += 1) {
        const s = score(dx, dy);
        if (s > best.score) best = { dx, dy, score: s };
      }
    const c = best;
    for (let dy = c.dy - 0.5; dy <= c.dy + 0.5; dy += 0.5)
      for (let dx = c.dx - 0.5; dx <= c.dx + 0.5; dx += 0.5) {
        const s = score(dx, dy);
        if (s > best.score) best = { dx, dy, score: s };
      }
    return best;
  }

  // Smooth the shifts: each group's shift should be close to its neighbours' (median of nearby groups).
  function smoothShifts(shifts, neighbours) {
    return shifts.map((s, i) => {
      const near = neighbours(i).map((j) => shifts[j]);
      const med = (k) => near.map((n) => n[k]).sort((a, b) => a - b)[Math.floor(near.length / 2)];
      const mdx = med('dx'), mdy = med('dy');
      // keep the group's own shift if it agrees with its neighbours, otherwise use theirs
      return Math.abs(s.dx - mdx) <= 1 && Math.abs(s.dy - mdy) <= 1 ? s : { dx: mdx, dy: mdy, smoothed: true };
    });
  }

  // ---------- Deciding ----------
  function decide(fills) {
    const order = fills.map((f, i) => ({ f, i })).sort((a, b) => b.f - a.f);
    const first = order[0], second = order[1] || { f: 0, i: -1 };
    if (first.f < T.blank) return { status: 'blank', choice: null };
    if (second.f >= T.doubleMark && second.f >= first.f * T.secondRatio) {
      const marked = order.filter((o) => o.f >= T.doubleMark && o.f >= first.f * T.secondRatio).map((o) => o.i).sort((a, b) => a - b);
      return { status: 'multiple', choice: null, candidates: marked };
    }
    if (second.f >= first.f * T.secondRatio) {
      return { status: 'unclear', choice: first.i, candidates: [first.i, second.i] };
    }
    if (first.f < T.faint) {
      // A very faint lone mark could be a smudge, a check mark or a poor erasure: ask the teacher.
      return { status: 'unclear', choice: first.i, candidates: [first.i], reason: 'light' };
    }
    return { status: 'ok', choice: first.i };
  }

  // ---------- Main ----------
  function readAligned(img, corners, quiz) {
    const layoutCorners = L.fiducials();
    const pagePts = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].map((n) => layoutCorners.find((f) => f.name === n));
    const imgPts = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].map((n) => corners[n]);
    const toImage = M.homography.fromPoints(pagePts, imgPts);
    if (!toImage) return { error: 'The corner markers are in impossible positions.' };
    const page = flattenLighting(straighten(img, toImage));
    const meter = makeMeter(page);
    const code = readCode(meter);
    return { toImage, page, meter, code };
  }

  /*
   * img: gray image. options.quiz: the quiz settings (optional). If given, its
   * per-question choice counts are used and the sheet code is checked against it.
   */
  function read(img, options) {
    options = options || {};
    const found = M.findSheet.findSheet(img);
    if (found.error) return { ok: false, error: found.error };

    // Try the orientation the hole suggests first, then the other three turns.
    const pts = found.clockwiseFromBottomLeft;
    let aligned = null, turns = 0;
    for (let k = 0; k < 4; k++) {
      const p = pts.slice(k).concat(pts.slice(0, k));
      const attempt = readAligned(img, { bottomLeft: p[0], topLeft: p[1], topRight: p[2], bottomRight: p[3] }, options.quiz);
      if (attempt.error) continue;
      if (attempt.code.spec) { aligned = attempt; turns = k; break; }
      if (!aligned) aligned = attempt;
    }
    if (!aligned) return { ok: false, error: 'Could not straighten the sheet.' };

    const { page, meter, code } = aligned;
    const problems = [];
    let spec = code.spec;
    if (!spec) {
      if (!options.quiz) return { ok: false, error: 'Could not read the sheet code (the small squares at the top). Is this one of our answer sheets?', page };
      problems.push('Could not read the sheet code; used the quiz settings instead.');
    }
    let quizNorm = options.quiz ? L.normalizeQuiz(options.quiz) : null;
    if (spec && quizNorm && (spec.numQuestions !== quizNorm.numQuestions || spec.choiceStyle !== quizNorm.choiceStyle || spec.maxChoices !== quizNorm.maxChoices)) {
      problems.push('This sheet was printed for a different quiz layout (' + spec.numQuestions + ' questions, ' + spec.maxChoices + ' choices).');
      quizNorm = null;
    }
    const layoutQuiz = quizNorm
      ? { numQuestions: quizNorm.numQuestions, choiceStyle: quizNorm.choiceStyle, defaultChoices: quizNorm.defaultChoices, choiceOverrides: options.quiz.choiceOverrides }
      : { numQuestions: spec.numQuestions, choiceStyle: spec.choiceStyle, defaultChoices: spec.maxChoices };
    const layout = L.sheetLayout(layoutQuiz);

    // --- Align bubble groups ---
    const qs = layout.answers.questions;
    const rowShifts = smoothShifts(
      qs.map((q) => alignGroup(meter, q.choices.filter((c) => c.printed), MAX_SHIFT)),
      (i) => {
        const per = layout.answers.rowsPerColumn, col = Math.floor(i / per), out = [];
        for (let j = Math.max(col * per, i - 2); j <= Math.min(Math.min(qs.length, (col + 1) * per) - 1, i + 2); j++) out.push(j);
        return out;
      }
    );
    const idCols = [];
    for (let d = 0; d < L.ID_DIGITS; d++) idCols.push(layout.id.bubbles.filter((b) => b.digit === d));
    const idShifts = smoothShifts(idCols.map((col) => alignGroup(meter, col, MAX_SHIFT)),
      (i) => [i - 1, i, i + 1].filter((j) => j >= 0 && j < L.ID_DIGITS));

    // --- Measure ---
    const rawFill = (b, s) => meter.disc(b.x + s.dx, b.y + s.dy, b.r * 0.68);
    const answerRaw = qs.map((q, i) => q.choices.map((c) => (c.printed ? rawFill(c, rowShifts[i]) : null)));
    const idRaw = idCols.map((col, d) => col.map((b) => rawFill(b, idShifts[d])));

    // An empty bubble isn't pure white (outline anti-aliasing, the printed label). Use this sheet's typical empty bubble as zero.
    const all = answerRaw.flat().filter((v) => v != null).concat(idRaw.flat());
    const empty = I.percentile(all, 25);
    const fill = (v) => (v == null ? 0 : Math.max(0, (v - empty) / (1 - empty)));

    const answers = qs.map((q, i) => {
      const fills = answerRaw[i].map(fill);
      const printed = q.choices.filter((c) => c.printed).length;
      const d = decide(fills.slice(0, printed));
      return Object.assign({ number: q.number, fills: fills.map((f) => Math.round(f * 100) / 100), label: d.choice != null ? q.choices[d.choice].label : null }, d);
    });

    const idDigits = idRaw.map((col) => decide(col.map(fill)));
    const idComplete = idDigits.every((d) => d.status === 'ok');
    const id = idDigits.map((d) => (d.status === 'ok' ? String(d.choice) : '?')).join('');

    return {
      ok: true,
      orientationFromHole: found.holeFound && turns === 0,
      spec: spec || null,
      layout,
      quiz: layoutQuiz,
      id: idComplete ? id : null,
      idRead: id,
      idDigits: idDigits.map((d, i) => Object.assign({ fills: idRaw[i].map((v) => Math.round(fill(v) * 100) / 100) }, d)),
      answers,
      needsReview: !idComplete || answers.some((a) => a.status === 'multiple' || a.status === 'unclear') || problems.length > 0,
      problems,
      page,           // straightened page image (for showing to the teacher)
      scale: SCALE,
      calibration: { white: meter.white, black: meter.black, emptyBubble: Math.round(empty * 100) / 100 },
      shifts: { rows: rowShifts, id: idShifts },
    };
  }

  M.readSheet = { read, decide, straighten, SCALE, THRESHOLDS: T };
})(typeof window !== 'undefined' ? window : globalThis);
