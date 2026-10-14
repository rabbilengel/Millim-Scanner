/*
 * GRADE SCANS screen: load scans → answer key → check sheets → save results.
 */
(function () {
  'use strict';
  const M = window.Millim;
  const G = M.grading;
  const $ = (id) => document.getElementById(id);

  const DISPLAY_WIDTH = 1224; // straightened page kept at 2 pixels per point for showing to the teacher

  const session = {
    sheets: [],   // one per scanned page
    layout: null, // { numQuestions, choiceStyle, maxChoices } shared by the sheets
    key: null,    // the answer key being used
    reviewing: -1,
  };

  // ---------------- helpers ----------------
  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const roster = () => M.currentRoster || { students: [], classes: [] };
  const studentById = (id) => (id ? M.roster.findById(roster(), id) : null);
  const hebName = (s) => [s.hebFirst, s.hebLast].filter(Boolean).join(' ') || s.firstName + ' ' + s.lastName;

  // ---------------- saved answer keys ----------------
  function savedKeys() { return M.storage.load('quizzes', []); }
  function saveKey(key) {
    key.updatedAt = Date.now();
    const keys = savedKeys().filter((k) => k.id !== key.id);
    keys.unshift(key);
    M.storage.save('quizzes', keys);
  }

  // ---------------- 1. Reading scans ----------------
  $('scan-files').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    e.target.value = '';
    if (!files.length) return;
    await readFiles(files);
  });

  $('scan-clear').addEventListener('click', () => {
    if (session.sheets.length && !confirm('Remove all scanned sheets from this screen? (Saved results are kept.)')) return;
    session.sheets.forEach((s) => s.display && URL.revokeObjectURL(s.display.url));
    session.sheets = [];
    session.layout = null;
    session.key = null;
    $('scan-status').textContent = '';
    $('scan-clear').hidden = true;
    renderAll();
  });

  async function readFiles(files) {
    const status = $('scan-status'), progress = $('scan-progress');
    status.classList.remove('error');
    progress.hidden = false;
    progress.removeAttribute('value');
    $('scan-files').disabled = true;
    let count = 0;
    try {
      for await (const page of M.scanInput.pages(files)) {
        count++;
        status.textContent = 'Reading ' + page.fileName + ' — page ' + page.pageNumber + ' of ' + page.pageCount + '…';
        progress.max = page.pageCount; progress.value = page.pageNumber - 1;
        await tick();
        session.sheets.push(await readOne(page));
        progress.value = page.pageNumber;
        await tick();
      }
      status.textContent = 'Read ' + count + (count === 1 ? ' page.' : ' pages.');
    } catch (err) {
      console.error(err);
      status.textContent = 'Something went wrong while reading the file: ' + err.message;
      status.classList.add('error');
    } finally {
      progress.hidden = true;
      $('scan-files').disabled = false;
    }
    $('scan-clear').hidden = !session.sheets.length;
    chooseLayout();
    renderAll();
  }

  async function readOne(page) {
    const sheet = { n: session.sheets.length + 1, source: page.source, reviewed: false, skipped: false };
    let r;
    try { r = M.readSheet.read(page.image); } catch (err) { console.error(err); r = { ok: false, error: 'The reader stopped unexpectedly: ' + err.message }; }
    if (!r.ok) {
      sheet.error = r.error;
      sheet.display = await M.scanInput.grayToJpegUrl(r.page || page.image, 900);
      sheet.pxPerPt = null;
      return sheet;
    }
    sheet.display = await M.scanInput.grayToJpegUrl(r.page, DISPLAY_WIDTH);
    sheet.pxPerPt = r.scale * sheet.display.scale;
    sheet.read = { spec: r.spec, layout: r.layout, answers: r.answers, idDigits: r.idDigits, problems: r.problems, shifts: r.shifts };
    sheet.id = r.id || r.idRead;
    sheet.answers = G.answersFromRead(r);
    sheet.flagged = r.answers.filter((a) => a.status === 'multiple' || a.status === 'unclear').map((a) => a.number - 1);
    sheet.idUnclear = !r.id;
    return sheet;
  }

  // All sheets in one batch should be the same quiz; use the most common layout.
  function chooseLayout() {
    const counts = new Map();
    for (const s of session.sheets) {
      if (!s.read || !s.read.spec) continue;
      const k = JSON.stringify({ numQuestions: s.read.spec.numQuestions, choiceStyle: s.read.spec.choiceStyle, maxChoices: s.read.spec.maxChoices });
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    let best = null, n = 0;
    counts.forEach((c, k) => { if (c > n) { n = c; best = k; } });
    const layout = best ? JSON.parse(best) : null;
    if (!layout) return;
    if (!G.sameLayout(layout, session.layout)) {
      session.layout = layout;
      const match = savedKeys().find((k) => G.sameLayout(k.layout, layout));
      session.key = match || G.newKey(layout, '');
    }
  }

  // ---------------- 2. Answer key ----------------
  function renderKey() {
    const card = $('key-card');
    card.hidden = !session.layout;
    if (!session.layout) return;
    const key = session.key, layout = session.layout;
    const style = M.sheetLayout.CHOICE_STYLES[layout.choiceStyle];
    $('key-layout').textContent = 'Sheet layout (read from the scans): ' + layout.numQuestions + ' questions, choices ' + G.labelsFor(layout).join(' ') + '.';
    $('key-title').value = key.title || '';

    const sel = $('key-saved');
    sel.innerHTML = '';
    sel.add(new Option('— New answer key —', ''));
    savedKeys().filter((k) => G.sameLayout(k.layout, layout)).forEach((k) => {
      sel.add(new Option((k.title || 'Untitled') + '  (' + new Date(k.updatedAt).toLocaleDateString() + ')', k.id));
    });
    sel.value = savedKeys().some((k) => k.id === key.id) ? key.id : '';

    const grid = $('key-grid');
    grid.innerHTML = '';
    grid.classList.toggle('rtl', style.rtl);
    const labels = G.labelsFor(layout);
    key.answers.forEach((accepted, q) => {
      const row = el('div', { class: 'key-row' + (accepted.length ? '' : ' empty') }, [el('span', { class: 'qnum', text: String(q + 1) })]);
      labels.forEach((label, i) => {
        row.appendChild(el('button', {
          type: 'button', class: 'bubble' + (accepted.includes(i) ? ' on' : ''), text: label,
          title: 'Question ' + (q + 1) + ': ' + label,
          onclick: () => {
            const a = key.answers[q];
            key.answers[q] = a.includes(i) ? a.filter((x) => x !== i) : a.concat([i]).sort((x, y) => x - y);
            keyChanged();
          },
        }));
      });
      grid.appendChild(row);
    });
    const set = key.answers.filter((a) => a.length).length;
    $('key-status').textContent = set + ' of ' + layout.numQuestions + ' questions have an answer.';
    $('key-status').classList.remove('error');
  }

  function keyChanged() {
    saveKey(session.key);
    renderKey();
    renderSheets();
    if (session.reviewing >= 0) renderReview();
  }

  $('key-title').addEventListener('input', () => {
    session.key.title = $('key-title').value.trim();
    saveKey(session.key);
    // refresh the saved list label without redrawing the grid
    const opt = Array.from($('key-saved').options).find((o) => o.value === session.key.id);
    if (opt) opt.text = (session.key.title || 'Untitled') + '  (' + new Date().toLocaleDateString() + ')';
    else { $('key-saved').add(new Option(session.key.title || 'Untitled', session.key.id)); $('key-saved').value = session.key.id; }
  });

  $('key-saved').addEventListener('change', () => {
    const id = $('key-saved').value;
    session.key = id ? savedKeys().find((k) => k.id === id) : G.newKey(session.layout, '');
    renderKey();
    renderSheets();
  });

  $('key-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const { answers, problems } = G.keyFromCsv(await file.text(), session.layout);
    if (!answers.some((a) => a.length)) {
      $('key-status').textContent = problems.join(' ');
      $('key-status').classList.add('error');
      return;
    }
    session.key.answers = answers;
    if (!session.key.title) session.key.title = file.name.replace(/\.[^.]+$/, '');
    keyChanged();
    if (problems.length) { $('key-status').textContent += '  Note: ' + problems.join(' '); }
  });

  $('key-export').addEventListener('click', () => {
    download(G.keyToCsv(session.key), safeName('Answer key ' + (session.key.title || '')) + '.csv', 'text/csv');
  });

  $('key-clear').addEventListener('click', () => {
    if (!confirm('Clear all answers in this key?')) return;
    session.key.answers = session.key.answers.map(() => []);
    keyChanged();
  });

  // ---------------- 3. Sheets table ----------------
  function issues(sheet) {
    if (sheet.error) return [sheet.error];
    const out = [];
    if (!G.sameLayout(sheet.read.spec, session.layout)) out.push('Printed for a different quiz layout');
    if (!/^\d{7}$/.test(sheet.id || '')) out.push('Student ID unclear');
    else if (!studentById(sheet.id)) out.push('ID not on the roster');
    const dup = session.sheets.find((o) => o !== sheet && !o.skipped && !o.error && o.id && o.id === sheet.id);
    if (dup && /^\d{7}$/.test(sheet.id)) out.push('Same ID as sheet #' + dup.n);
    if (sheet.flagged.length) out.push(sheet.flagged.length + (sheet.flagged.length === 1 ? ' answer' : ' answers') + ' to check');
    (sheet.read.problems || []).forEach((p) => out.push(p));
    return out;
  }

  function gradable(sheet) {
    return !sheet.error && !sheet.skipped && G.sameLayout(sheet.read.spec, session.layout);
  }

  function scoreOf(sheet) {
    if (!gradable(sheet) || !session.key) return null;
    const s = G.score(session.key, sheet.answers);
    return s.possible ? s : null;
  }

  function statusOf(sheet) {
    if (sheet.skipped) return { cls: 'skipped', text: 'Left out' };
    if (sheet.error) return { cls: 'bad', text: '✗ ' + sheet.error };
    const list = issues(sheet);
    if (sheet.reviewed) return { cls: 'good', text: '✓ Checked' + (list.length && !sheet.flagged.length ? ' (' + list.join('; ') + ')' : '') };
    if (list.length) return { cls: 'warn', text: '⚠ ' + list.join('; ') };
    return { cls: 'good', text: '✓ OK' };
  }

  const needsReview = (s) => !s.skipped && !s.reviewed && (s.error ? false : issues(s).length > 0);

  function renderSheets() {
    const card = $('sheets-card');
    card.hidden = !session.sheets.length;
    if (!session.sheets.length) return;
    const tbody = $('sheets-table').querySelector('tbody');
    tbody.innerHTML = '';
    for (const sheet of session.sheets) {
      const st = studentById(sheet.id);
      const sc = scoreOf(sheet);
      const status = statusOf(sheet);
      const nameCell = el('td', {}, st
        ? [el('span', { dir: 'rtl', lang: 'he', text: hebName(st) }), el('span', { class: 'muted', text: '  ' + st.firstName + ' ' + st.lastName })]
        : [el('span', { class: 'muted', text: sheet.error ? '' : 'Unknown student' })]);
      tbody.appendChild(el('tr', { class: sheet.skipped ? 'skipped' : '' }, [
        el('td', { class: 'muted', text: String(sheet.n) }),
        nameCell,
        el('td', { dir: 'rtl', text: st ? st.classLabel : '' }),
        el('td', { dir: 'ltr', text: sheet.error ? '' : (sheet.id || '') }),
        el('td', { text: sc ? sc.correct + ' / ' + sc.possible + '  (' + Math.round(sc.percent) + '%)' : '—' }),
        el('td', { class: 'st ' + status.cls, text: status.text }),
        el('td', {}, [el('button', { type: 'button', class: needsReview(sheet) ? 'primary small' : 'small', text: needsReview(sheet) ? 'Review' : 'View', onclick: () => openReview(sheet.n - 1) })]),
      ]));
    }
    const total = session.sheets.length;
    const flagged = session.sheets.filter(needsReview).length;
    const errors = session.sheets.filter((s) => s.error && !s.skipped).length;
    const keyCount = session.key ? session.key.answers.filter((a) => a.length).length : 0;
    $('sheets-summary').textContent =
      total + (total === 1 ? ' sheet' : ' sheets') + ' read. ' +
      (flagged ? flagged + ' need your review. ' : 'Nothing needs review. ') +
      (errors ? errors + ' could not be read. ' : '') +
      (keyCount ? '' : 'Enter the answer key above to see scores.');
  }

  function renderAll() {
    renderKey();
    renderSheets();
  }

  // ---------------- Review ----------------
  function openReview(i) {
    session.reviewing = i;
    $('review').hidden = false;
    document.body.classList.add('no-scroll');
    renderReview();
  }

  function closeReview() {
    session.reviewing = -1;
    $('review').hidden = true;
    document.body.classList.remove('no-scroll');
    renderSheets();
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url; });
  }

  const QUESTION_REASON = { multiple: 'more than one answer is marked', light: 'the mark is very light', unclear: 'unclear — maybe an erasure' };

  async function renderReview() {
    const sheet = session.sheets[session.reviewing];
    if (!sheet) return closeReview();
    $('review-title').textContent = 'Sheet ' + sheet.n + ' of ' + session.sheets.length + '  ·  ' + sheet.source;
    const img = await loadImage(sheet.display.url);
    if (session.sheets[session.reviewing] !== sheet) return; // moved on while loading
    drawSheet(sheet, img);

    const side = { problems: $('review-problems'), flagged: $('review-flagged'), all: $('review-all') };
    side.problems.innerHTML = '';
    side.flagged.innerHTML = '';
    side.all.innerHTML = '';
    $('review-skip').textContent = sheet.skipped ? 'Include this page again' : 'Leave this page out';

    if (sheet.error) {
      side.problems.appendChild(el('li', { text: sheet.error }));
      $('review-id').disabled = true; $('review-student').disabled = true; $('review-accept').disabled = true;
      side.flagged.appendChild(el('p', { class: 'muted', text: 'This page could not be read, so it will not be graded. If it is an answer sheet, try scanning it again.' }));
      return;
    }
    $('review-id').disabled = false; $('review-student').disabled = false; $('review-accept').disabled = false;

    // Student
    $('review-id').value = sheet.id && /^\d+$/.test(sheet.id) ? sheet.id : '';
    fillStudentSelect(sheet.id);
    const st = studentById(sheet.id);
    const info = $('review-student-info');
    info.className = st ? '' : 'error-text';
    info.textContent = st ? hebName(st) + '  ·  ' + st.firstName + ' ' + st.lastName + '  ·  ' + st.classLabel + ' (' + st.classCode + ')'
      : (sheet.idUnclear ? 'The ID bubbles were unclear (read as ' + (sheet.id || '???????').replace(/\?/g, '·') + '). ' : '') + 'No student with this ID on the roster.';

    issues(sheet).filter((t) => !/answers? to check|^Student ID unclear|^ID not on the roster/.test(t)).forEach((t) => side.problems.appendChild(el('li', { text: t })));

    // Flagged questions, with a picture of each row
    if (!sheet.flagged.length) side.flagged.appendChild(el('p', { class: 'muted', text: 'None — every answer was read clearly.' }));
    for (const q of sheet.flagged) {
      const r = sheet.read.answers[q];
      const reason = r.status === 'multiple' ? QUESTION_REASON.multiple : r.reason === 'light' ? QUESTION_REASON.light : QUESTION_REASON.unclear;
      const crop = el('canvas', { class: 'row-crop' });
      drawRowCrop(crop, sheet, img, q);
      side.flagged.appendChild(el('div', { class: 'flag-item' }, [
        el('div', { class: 'flag-head' }, [el('strong', { text: 'Question ' + (q + 1) }), el('span', { class: 'muted', text: ' — ' + reason })]),
        crop,
        answerButtons(sheet, q, true),
      ]));
    }

    // All answers
    sheet.answers.forEach((a, q) => {
      side.all.appendChild(el('div', { class: 'all-row' + (sheet.flagged.includes(q) ? ' flagged' : '') }, [
        el('span', { class: 'qnum', text: String(q + 1) }), answerButtons(sheet, q, false),
      ]));
    });
  }

  function answerButtons(sheet, q, withExtras) {
    const layout = sheet.read.spec || session.layout;
    const printed = sheet.read.layout.answers.questions[q].choices.filter((c) => c.printed).length;
    const labels = G.labelsFor(layout).slice(0, printed);
    // show the key's answer only if this sheet is the same quiz layout as the key
    const key = session.key && G.sameLayout(layout, session.key.layout) && session.key.answers[q];
    const wrap = el('span', { class: 'answer-buttons' + (M.sheetLayout.CHOICE_STYLES[layout.choiceStyle].rtl ? ' rtl' : '') });
    const set = (v) => { sheet.answers[q] = v; renderReview(); renderSheets(); };
    labels.forEach((label, i) => {
      wrap.appendChild(el('button', {
        type: 'button', text: label,
        class: 'bubble' + (sheet.answers[q] === i ? ' on' : '') + (key && key.includes(i) ? ' key' : ''),
        title: key && key.includes(i) ? 'Correct answer' : '',
        onclick: () => set(i),
      }));
    });
    if (withExtras) {
      wrap.appendChild(el('button', { type: 'button', class: 'chip-btn' + (sheet.answers[q] === null ? ' on' : ''), text: 'Blank', onclick: () => set(null) }));
      wrap.appendChild(el('button', { type: 'button', class: 'chip-btn' + (sheet.answers[q] === 'multiple' ? ' on' : ''), text: 'Two answers (wrong)', onclick: () => set('multiple') }));
    } else {
      wrap.appendChild(el('span', { class: 'muted small-text', text: sheet.answers[q] === null ? 'blank' : sheet.answers[q] === 'multiple' ? 'two answers' : '' }));
    }
    return wrap;
  }

  // Draw the straightened sheet with the reading marked on it.
  function drawSheet(sheet, img) {
    const canvas = $('review-canvas');
    const width = Math.min(img.width, Math.max(320, canvas.parentElement.clientWidth - 2));
    const k = width / img.width;
    canvas.width = Math.round(img.width * k);
    canvas.height = Math.round(img.height * k);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (!sheet.pxPerPt) return;
    const s = sheet.pxPerPt * k;
    const qs = sheet.read.layout.answers.questions;
    qs.forEach((q, qi) => {
      const sh = sheet.read.shifts.rows[qi];
      const a = sheet.answers[qi];
      if (sheet.flagged.includes(qi)) {
        const xs = q.choices.map((c) => c.x);
        const x0 = Math.min.apply(null, xs) - 22, x1 = Math.max.apply(null, xs) + 22;
        ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 2;
        ctx.strokeRect((x0 + sh.dx) * s, (q.y - 9 + sh.dy) * s, (x1 - x0) * s, 18 * s);
      }
      q.choices.forEach((c, ci) => {
        if (a === ci || (a === 'multiple' && sheet.read.answers[qi].candidates && sheet.read.answers[qi].candidates.includes(ci))) {
          ctx.strokeStyle = a === 'multiple' ? '#d6336c' : '#1f5fbf'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc((c.x + sh.dx) * s, (c.y + sh.dy) * s, (c.r + 2) * s, 0, Math.PI * 2); ctx.stroke();
        }
      });
    });
    // ID digits as read
    sheet.read.layout.id.bubbles.forEach((b) => {
      const d = sheet.read.idDigits[b.digit];
      if (d.status === 'ok' && d.choice === b.value) {
        const sh = sheet.read.shifts.id[b.digit];
        ctx.strokeStyle = '#1f5fbf'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc((b.x + sh.dx) * s, (b.y + sh.dy) * s, (b.r + 2) * s, 0, Math.PI * 2); ctx.stroke();
      }
    });
  }

  // An enlarged picture of one question row.
  function drawRowCrop(canvas, sheet, img, qi) {
    const q = sheet.read.layout.answers.questions[qi];
    const sh = sheet.read.shifts.rows[qi];
    const xs = q.choices.map((c) => c.x).concat([q.numberX]);
    const x0 = Math.min.apply(null, xs) - 16 + sh.dx, x1 = Math.max.apply(null, xs) + 16 + sh.dx;
    const y0 = q.y - 11 + sh.dy, y1 = q.y + 11 + sh.dy;
    const zoom = 3; // screen pixels per point
    canvas.width = Math.round((x1 - x0) * zoom);
    canvas.height = Math.round((y1 - y0) * zoom);
    const p = sheet.pxPerPt;
    canvas.getContext('2d').drawImage(img, x0 * p, y0 * p, (x1 - x0) * p, (y1 - y0) * p, 0, 0, canvas.width, canvas.height);
  }

  function fillStudentSelect(currentId) {
    const sel = $('review-student');
    sel.innerHTML = '';
    sel.add(new Option('— choose —', ''));
    const r = roster();
    for (const c of r.classes) {
      const group = document.createElement('optgroup');
      group.label = c + '  ' + M.hebrew.classLabel(c);
      M.roster.studentsInClass(r, c).forEach((s) => group.appendChild(new Option(s.id + '  ' + hebName(s), s.id)));
      sel.appendChild(group);
    }
    sel.value = studentById(currentId) ? currentId : '';
  }

  function setReviewId(id) {
    const sheet = session.sheets[session.reviewing];
    sheet.id = id;
    sheet.idUnclear = false;
    renderReview();
    renderSheets();
  }

  $('review-id').addEventListener('input', () => {
    const v = $('review-id').value.replace(/\D/g, '');
    if (v.length === 7) setReviewId(v);
  });
  $('review-student').addEventListener('change', () => { if ($('review-student').value) setReviewId($('review-student').value); });

  $('review-accept').addEventListener('click', () => {
    const sheet = session.sheets[session.reviewing];
    sheet.reviewed = true;
    sheet.flagged = [];
    goToNextFlagged(true);
  });
  $('review-skip').addEventListener('click', () => {
    const sheet = session.sheets[session.reviewing];
    sheet.skipped = !sheet.skipped;
    renderReview(); renderSheets();
  });
  $('review-prev').addEventListener('click', () => { if (session.reviewing > 0) { session.reviewing--; renderReview(); } });
  $('review-next').addEventListener('click', () => { if (session.reviewing < session.sheets.length - 1) { session.reviewing++; renderReview(); } });
  $('review-next-flagged').addEventListener('click', () => goToNextFlagged(false));
  $('review-close').addEventListener('click', closeReview);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('review').hidden) closeReview(); });

  function goToNextFlagged(closeIfNone) {
    const n = session.sheets.length;
    for (let k = 1; k <= n; k++) {
      const i = (session.reviewing + k) % n;
      if (needsReview(session.sheets[i])) { session.reviewing = i; renderReview(); renderSheets(); return; }
    }
    if (closeIfNone) closeReview();
    else { renderSheets(); alert('No other sheets need review.'); }
  }

  // ---------------- 4. Save & export ----------------
  function resultRows() {
    const layout = session.layout;
    return session.sheets.filter(gradable).map((sheet) => {
      const st = studentById(sheet.id);
      const sc = G.score(session.key, sheet.answers);
      return {
        studentId: sheet.id, onRoster: !!st,
        hebLast: st ? st.hebLast : '', hebFirst: st ? st.hebFirst : '',
        lastName: st ? st.lastName : '', firstName: st ? st.firstName : '',
        classCode: st ? st.classCode : '', classLabel: st ? st.classLabel : '',
        answers: sheet.answers.slice(),
        answerText: sheet.answers.map((a) => G.answerText(a, layout)),
        correct: sc.correct, possible: sc.possible, percent: sc.percent,
        source: sheet.source, reviewed: sheet.reviewed,
      };
    });
  }

  function checkReadyToSave() {
    if (!session.key || !session.key.answers.some((a) => a.length)) return 'Enter the answer key first.';
    if (!session.key.title) return 'Give the quiz a name first (in the Answer key section).';
    return null;
  }

  $('save-results').addEventListener('click', () => {
    const problem = checkReadyToSave();
    const status = $('save-status');
    status.classList.toggle('error', !!problem);
    if (problem) { status.textContent = problem; return; }
    const waiting = session.sheets.filter(needsReview).length;
    if (waiting && !confirm(waiting + ' sheet(s) still need review. Save anyway?')) return;
    const rows = resultRows();
    const storeKey = 'results.' + session.key.id;
    const existing = M.storage.load(storeKey, null);
    const byStudent = new Map((existing ? existing.rows : []).map((r) => [r.studentId, r]));
    rows.forEach((r) => byStudent.set(r.studentId, Object.assign(r, { savedAt: Date.now() })));
    saveKey(session.key);
    const ok = M.storage.save(storeKey, {
      quizId: session.key.id, title: session.key.title, layout: session.layout,
      key: session.key.answers, savedAt: Date.now(), rows: Array.from(byStudent.values()),
    });
    status.textContent = ok ? 'Saved ' + rows.length + ' results for "' + session.key.title + '".' : 'Could not save (the browser blocked storage). Download the CSV instead.';
    status.classList.toggle('error', !ok);
  });

  $('export-results').addEventListener('click', () => {
    if (!session.key || !session.key.answers.some((a) => a.length)) { $('save-status').textContent = 'Enter the answer key first.'; return; }
    const rows = resultRows().sort((a, b) =>
      (a.classCode || 'zz').localeCompare(b.classCode || 'zz') || new Intl.Collator('he').compare(a.hebLast, b.hebLast) || new Intl.Collator('he').compare(a.hebFirst, b.hebFirst));
    const n = session.layout.numQuestions;
    const header = ['Class', 'כיתה', 'Hebrew Last Name', 'Hebrew First Name', 'Last Name', 'First Name', 'ID', 'Correct', 'Possible', 'Percent'];
    for (let q = 1; q <= n; q++) header.push('Q' + q);
    const keyRow = ['', '', 'Answer key', '', '', '', '', '', '', ''].concat(session.key.answers.map((a) => a.map((i) => G.labelsFor(session.layout)[i]).join(';')));
    const lines = [header, keyRow].concat(rows.map((r) => [r.classCode, r.classLabel, r.hebLast, r.hebFirst, r.lastName, r.firstName, r.studentId, r.correct, r.possible, r.percent].concat(r.answerText)));
    // The invisible mark at the start tells Excel the file is UTF-8, so Hebrew shows correctly.
    download('﻿' + M.roster.toCsv(lines), safeName('Results ' + (session.key.title || 'quiz')) + '.csv', 'text/csv');
  });

  function safeName(s) {
    return String(s).replace(/[^A-Za-z0-9 _().-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'quiz';
  }

  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
    const a = el('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  document.addEventListener('millim:roster', () => { if (session.sheets.length) renderSheets(); });
})();
