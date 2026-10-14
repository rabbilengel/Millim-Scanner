/*
 * RESULTS screen: saved quizzes → class lists, item analysis, answer key, CSV, backup.
 */
(function () {
  'use strict';
  const M = window.Millim;
  const D = M.dataStore, R = M.results, G = M.grading;
  const el = M.ui.el;
  const $ = (id) => document.getElementById(id);

  const state = {
    quizId: '',
    raw: [],       // results as saved
    rows: [],      // results re-scored with the current key and roster
    classCode: 'all',
    sub: M.storage.load('resultsSub', 'students'),
    open: new Set(), // students whose answers are shown
  };

  const roster = () => M.currentRoster || { students: [], classes: [] };
  const quiz = () => D.getQuiz(state.quizId);
  const pct = (p) => (p == null ? '—' : (Math.round(p * 10) / 10) + '%');

  // ---------------- Quiz list ----------------
  function renderQuizList() {
    const sel = $('res-quiz');
    const list = D.quizzes();
    sel.innerHTML = '';
    list.forEach((q) => {
      const when = q.lastGradedAt || q.updatedAt;
      sel.add(new Option((q.title || 'Untitled') + (when ? '  —  ' + new Date(when).toLocaleDateString() : ''), q.id));
    });
    if (!list.some((q) => q.id === state.quizId)) state.quizId = list.length ? list[0].id : '';
    sel.value = state.quizId;
    $('res-empty').hidden = list.length > 0;
    $('res-quiz').parentElement.hidden = list.length === 0;
    renderBanner();
  }

  function renderBanner() {
    const n = D.localOnlyCount();
    $('res-local-banner').hidden = n === 0;
    $('res-local-text').textContent = n + (n === 1 ? ' quiz was' : ' quizzes were') + ' saved only in this browser before you signed in. ';
  }

  $('res-local-upload').addEventListener('click', async () => {
    $('res-local-upload').disabled = true;
    try {
      const r = await D.uploadLocal();
      $('res-local-text').textContent = 'Uploaded ' + r.quizCount + ' quizzes and ' + r.resultCount + ' results to your account.';
    } catch (err) {
      $('res-local-text').textContent = 'Upload failed: ' + M.cloud.explain(err);
    } finally {
      $('res-local-upload').disabled = false;
      renderQuizList();
    }
  });

  $('res-quiz').addEventListener('change', () => { state.quizId = $('res-quiz').value; state.classCode = 'all'; state.open.clear(); loadQuiz(); });

  async function loadQuiz() {
    const q = quiz();
    $('res-body').hidden = !q;
    if (!q) return;
    try {
      state.raw = await D.listResults(q.id);
    } catch (err) {
      console.error(err);
      state.raw = [];
      $('res-stats').textContent = 'Could not load results: ' + (M.cloud ? M.cloud.explain(err) : err.message);
    }
    if (quiz() !== q) return; // another quiz was picked meanwhile
    rescore();
    renderKeyEditor();
  }

  function rescore() {
    const q = quiz();
    if (!q) return;
    state.rows = R.prepare(q, state.raw, roster());
    render();
  }

  // ---------------- Body ----------------
  function filtered() {
    if (state.classCode === 'all') return state.rows;
    return state.rows.filter((r) => (r.classCode || '') === state.classCode);
  }

  function render() {
    renderStats();
    renderClassPicker();
    document.querySelectorAll('.subtab').forEach((b) => b.classList.toggle('active', b.dataset.sub === state.sub));
    $('res-students').hidden = state.sub !== 'students';
    $('res-items').hidden = state.sub !== 'items';
    $('res-key').hidden = state.sub !== 'key';
    if (state.sub === 'students') renderStudents();
    if (state.sub === 'items') renderItems();
  }

  function renderStats() {
    const s = R.summary(filtered());
    const box = $('res-stats');
    box.innerHTML = '';
    const stat = (label, value) => box.appendChild(el('div', { class: 'stat' }, [el('div', { class: 'stat-value', text: value }), el('div', { class: 'stat-label', text: label })]));
    let graded = String(s.count);
    if (state.classCode && state.classCode !== 'all') graded += ' of ' + M.roster.studentsInClass(roster(), state.classCode).length;
    stat('Students graded', graded);
    stat('Class average', pct(s.average));
    stat('Highest', pct(s.high));
    stat('Lowest', pct(s.low));
    const possible = state.rows.length ? state.rows[0].possible : quiz().answers.filter((a) => a.length).length;
    stat('Questions counted', String(possible));
  }

  function renderClassPicker() {
    const box = $('res-class-picker');
    box.innerHTML = '';
    const chip = (code, label, count) => box.appendChild(el('button', {
      type: 'button', class: 'chip' + (state.classCode === code ? ' active' : ''),
      onclick: () => { state.classCode = code; render(); },
    }, [el('span', { dir: 'auto', text: label }), el('span', { class: 'muted', text: ' · ' + count })]));
    chip('all', 'All classes', state.rows.length);
    R.classesIn(state.rows).forEach((code) => {
      chip(code, code ? M.hebrew.classLabel(code) + ' ' + code : 'Not on roster', state.rows.filter((r) => (r.classCode || '') === code).length);
    });
  }

  function studentEntries() {
    if (state.classCode === 'all') {
      return state.rows.slice()
        .sort((a, b) => (a.classCode || 'zz').localeCompare(b.classCode || 'zz', undefined, { numeric: true }) || R.byHebrewName(a, b))
        .map((r) => ({ student: null, result: r }));
    }
    return R.classList(state.rows, roster(), state.classCode);
  }

  function renderStudents() {
    const q = quiz();
    const table = $('res-students-table');
    table.innerHTML = '';
    const all = state.classCode === 'all';
    const head = ['#'].concat(all ? ['כיתה'] : []).concat(['שם משפחה', 'שם פרטי', 'Name', 'ID', 'Score', '%', '']);
    table.appendChild(el('thead', {}, [el('tr', {}, head.map((h, i) => el('th', { dir: i >= head.length - 5 ? 'ltr' : null, text: h })))]));
    const tbody = el('tbody');
    studentEntries().forEach((entry, i) => {
      const r = entry.result, s = entry.student || r;
      const id = (entry.student && entry.student.id) || (r && r.studentId) || '';
      const key = r ? r.docId : 'none-' + id;
      const cells = [String(i + 1)];
      if (all) cells.push(r.classLabel || '');
      cells.push(s.hebLast || '', s.hebFirst || '', ((s.firstName || '') + ' ' + (s.lastName || '')).trim() || (r && !r.onRoster ? 'Not on roster' : ''), id);
      const tr = el('tr', { class: r ? 'clickable' + (r.percent < 60 ? ' low' : '') : 'ungraded' });
      cells.forEach((c, ci) => tr.appendChild(el('td', { dir: ci >= cells.length - 2 ? 'ltr' : null, text: c })));
      if (r) {
        tr.appendChild(el('td', { dir: 'ltr', text: r.correct + ' / ' + r.possible }));
        tr.appendChild(el('td', { dir: 'ltr', class: 'num', text: pct(r.percent) }));
        tr.appendChild(el('td', {}, [el('button', {
          type: 'button', class: 'link-button danger small-text', text: 'delete', title: 'Delete this result',
          onclick: (e) => { e.stopPropagation(); deleteResult(r); },
        })]));
        tr.addEventListener('click', () => { state.open.has(key) ? state.open.delete(key) : state.open.add(key); renderStudents(); });
      } else {
        tr.appendChild(el('td', { dir: 'ltr', class: 'muted', text: 'not graded' }));
        tr.appendChild(el('td'));
        tr.appendChild(el('td'));
      }
      tbody.appendChild(tr);
      if (r && state.open.has(key)) {
        tbody.appendChild(el('tr', { class: 'detail' }, [el('td', { colspan: String(cells.length + 3) }, [answersView(q, r)])]));
      }
    });
    table.appendChild(tbody);
  }

  function answersView(q, r) {
    const labels = G.labelsFor(q.layout);
    const box = el('div', { class: 'answers-view', dir: 'ltr' });
    r.answers.forEach((a, i) => {
      const verdict = r.perQuestion[i];
      const text = a === null || a === undefined ? '–' : a === 'multiple' ? '2+' : labels[a];
      const keyText = (q.answers[i] || []).map((k) => labels[k]).join('/');
      box.appendChild(el('span', {
        class: 'ans ' + (verdict === true ? 'right' : verdict === false ? 'wrong' : 'uncounted'),
        title: 'Question ' + (i + 1) + ': answered ' + text + (keyText ? ', correct ' + keyText : ' (not counted)'),
      }, [el('b', { text: String(i + 1) }), ' ' + text]));
    });
    if (r.source) box.appendChild(el('div', { class: 'muted small-text', text: 'From ' + r.source + (r.savedAt ? ', saved ' + new Date(r.savedAt).toLocaleString() : '') }));
    return box;
  }

  async function deleteResult(r) {
    const name = [r.hebFirst, r.hebLast].filter(Boolean).join(' ') || r.studentId;
    if (!confirm('Delete the result for ' + name + '?')) return;
    await D.deleteResult(state.quizId, r.docId);
    state.raw = state.raw.filter((x) => x.docId !== r.docId);
    rescore();
  }

  function renderItems() {
    const q = quiz();
    const labels = G.labelsFor(q.layout);
    const items = R.itemAnalysis(q, filtered());
    const table = $('res-items-table');
    table.innerHTML = '';
    table.appendChild(el('thead', {}, [el('tr', {}, ['Question', 'Correct', '% correct'].concat(labels).concat(['Blank', 'Two answers']).map((h) => el('th', { text: h })))]));
    const tbody = el('tbody');
    items.forEach((it) => {
      const tr = el('tr', { class: it.counted && it.percentCorrect < 50 ? 'low' : '' });
      tr.appendChild(el('td', { class: 'num', text: String(it.number) }));
      tr.appendChild(el('td', { text: it.counted ? it.key.map((k) => labels[k]).join(' / ') : 'not counted' }));
      const bar = el('div', { class: 'bar' }, [el('div', { class: 'bar-fill', style: 'width:' + (it.percentCorrect || 0) + '%' })]);
      tr.appendChild(el('td', { class: 'pct-cell' }, [el('span', { class: 'num', text: pct(it.percentCorrect) }), bar]));
      const topWrong = it.wrongChoices.length ? it.wrongChoices[0].choice : -1;
      it.counts.forEach((c, choice) => {
        tr.appendChild(el('td', { class: 'num ' + (it.key.includes(choice) ? 'right' : choice === topWrong ? 'top-wrong' : ''), text: String(c) }));
      });
      tr.appendChild(el('td', { class: 'num muted', text: String(it.blank) }));
      tr.appendChild(el('td', { class: 'num muted', text: String(it.multiple) }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  // ---------------- Answer key editing ----------------
  const saveQuizSoon = M.ui.debounce(async () => {
    const q = quiz();
    if (!q) return;
    const status = await D.saveQuiz(q);
    $('res-key-status').textContent = 'Answer key saved. ' + M.ui.saveMessage(status);
  }, 800);

  function renderKeyEditor() {
    const q = quiz();
    if (!q) return;
    $('res-key-title').value = q.title || '';
    M.keyGrid.render($('res-key-grid'), q, () => {
      renderKeyEditor();
      rescore();
      $('res-key-status').textContent = 'Re-scored everyone with the new key…';
      saveQuizSoon();
    });
  }

  $('res-key-title').addEventListener('input', () => {
    const q = quiz();
    if (!q) return;
    q.title = $('res-key-title').value.trim();
    saveQuizSoon();
  });

  $('res-delete-quiz').addEventListener('click', async () => {
    const q = quiz();
    if (!q) return;
    if (!confirm('Delete "' + (q.title || 'Untitled') + '" and all ' + state.raw.length + ' of its results? This cannot be undone.')) return;
    await D.deleteQuiz(q.id);
    state.quizId = '';
    renderQuizList();
    loadQuiz();
  });

  // ---------------- Tabs inside the results ----------------
  document.querySelectorAll('.subtab').forEach((b) => b.addEventListener('click', () => {
    state.sub = b.dataset.sub;
    M.storage.save('resultsSub', state.sub);
    render();
  }));

  // ---------------- CSV ----------------
  $('res-export').addEventListener('click', () => {
    const q = quiz();
    const part = state.classCode === 'all' ? 'all classes' : state.classCode ? 'class ' + state.classCode : 'not on roster';
    M.ui.download(R.resultsCsv(q, studentEntries()), M.ui.safeName('Results ' + (q.title || 'quiz') + ' ' + part) + '.csv', 'text/csv');
  });
  $('res-export-items').addEventListener('click', () => {
    const q = quiz();
    const part = state.classCode === 'all' ? 'all classes' : 'class ' + (state.classCode || 'unknown');
    M.ui.download(R.itemAnalysisCsv(q, R.itemAnalysis(q, filtered())), M.ui.safeName('Item analysis ' + (q.title || 'quiz') + ' ' + part) + '.csv', 'text/csv');
  });

  // ---------------- Backup ----------------
  $('backup-download').addEventListener('click', async () => {
    $('backup-status').textContent = 'Preparing…';
    try {
      const data = await D.exportAll();
      M.ui.download(JSON.stringify(data), 'Millim backup ' + new Date().toISOString().slice(0, 10) + '.json', 'application/json');
      $('backup-status').textContent = 'Backup downloaded (' + data.quizzes.length + ' quizzes).';
    } catch (err) {
      $('backup-status').textContent = 'Could not make the backup: ' + err.message;
    }
  });

  $('backup-restore').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm('Add the quizzes and results from "' + file.name + '"? Quizzes already here with the same name stay; the same student\'s result is replaced.')) return;
      $('backup-status').textContent = 'Restoring…';
      const r = await D.importAll(data);
      $('backup-status').textContent = 'Restored ' + r.quizCount + ' quizzes and ' + r.resultCount + ' results.';
      renderQuizList();
      loadQuiz();
    } catch (err) {
      $('backup-status').textContent = 'Could not restore: ' + err.message;
    }
  });

  // ---------------- Keep up to date ----------------
  document.addEventListener('millim:data', () => {
    const before = state.quizId;
    renderQuizList();
    if (state.quizId !== before) loadQuiz();
  });
  document.addEventListener('millim:roster', rescore);
  // Reload when the tab is opened (results may have just been saved on the Grade scans tab).
  document.querySelector('[data-tab="results"]').addEventListener('click', () => { renderQuizList(); loadQuiz(); });
  document.addEventListener('millim:ready', () => { renderQuizList(); loadQuiz(); });
})();
