/*
 * APP — the screens: tabs, the answer-sheet form, and the roster view.
 * The real work happens in the other files; this one connects them to the page.
 */
(function () {
  'use strict';
  const M = window.Millim;
  const L = M.sheetLayout;
  const $ = (id) => document.getElementById(id);

  const state = {
    roster: { students: [], classes: [], problems: [] },
    rosterSource: '',
    pdfUrl: null,
    selectedClass: null,
  };

  // ---------------- Tabs ----------------
  function showTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
    M.storage.save('tab', name);
  }
  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  // ---------------- Roster ----------------
  /*
   * The roster lives in your account (Firebase) when signed in, or in this browser when not.
   * If there isn't one yet, the Roster tab asks for a CSV file.
   */
  async function loadRoster() {
    const cloud = M.dataStore.mode() === 'cloud';
    let saved = null, loadFailed = false;
    try { saved = await M.dataStore.getRoster(); } catch (err) { console.error(err); loadFailed = true; }
    if (saved && saved.csv) {
      state.rosterSource = (cloud ? 'saved in your account' : 'saved in this browser') +
        (saved.updatedAt ? ' (last changed ' + new Date(saved.updatedAt).toLocaleDateString() + ')' : '');
    } else if (loadFailed) {
      state.rosterSource = 'could not reach your account to load the roster — check the internet connection and reload the page';
    } else {
      state.rosterSource = 'no roster yet — click "Replace the whole roster from a CSV file" to load your class list';
    }
    state.roster = M.roster.fromCsv(saved && saved.csv ? saved.csv : '');
    if (!state.roster.students.length) state.roster.problems = [];
    // Share the roster with the other screens (e.g. Grade scans, Results).
    M.currentRoster = state.roster;
    document.dispatchEvent(new CustomEvent('millim:roster'));
    renderRoster();
    fillClassAndGradeLists();
  }

  // Save a changed roster, then show it everywhere.
  async function saveRosterCsv(csv, name, doneMessage) {
    const status = $('roster-status');
    status.classList.remove('error');
    status.textContent = 'Saving…';
    try {
      const result = await M.dataStore.saveRoster(csv, name);
      await loadRoster();
      status.textContent = result === 'failed' ? M.ui.saveMessage(result) : doneMessage + ' ' + M.ui.saveMessage(result);
      status.classList.toggle('error', result === 'failed');
    } catch (err) {
      console.error(err);
      status.textContent = 'Could not save the roster: ' + (M.cloud ? M.cloud.explain(err) : err.message);
      status.classList.add('error');
    }
  }

  function renderRoster() {
    const r = state.roster;
    $('roster-summary').textContent =
      r.students.length + ' students in ' + r.classes.length + ' classes — ' + state.rosterSource + '.';
    const problems = $('roster-problems');
    problems.innerHTML = '';
    r.problems.forEach((msg) => { const li = document.createElement('li'); li.textContent = msg; problems.appendChild(li); });

    const picker = $('class-picker');
    picker.innerHTML = '';
    if (!r.classes.includes(state.selectedClass)) state.selectedClass = r.classes[0] || null;
    for (const code of r.classes) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (code === state.selectedClass ? ' active' : '');
      b.innerHTML = '<span dir="rtl" lang="he"></span> <span class="muted"></span>';
      b.children[0].textContent = M.hebrew.classLabel(code);
      b.children[1].textContent = code + ' · ' + r.students.filter((s) => s.classCode === code).length;
      b.addEventListener('click', () => { state.selectedClass = code; renderRoster(); });
      picker.appendChild(b);
    }

    const tbody = $('roster-table').querySelector('tbody');
    tbody.innerHTML = '';
    const students = state.selectedClass ? M.roster.studentsInClass(r, state.selectedClass) : [];
    students.forEach((s, i) => {
      const tr = document.createElement('tr');
      [String(i + 1), s.hebLast, s.hebFirst, s.firstName + ' ' + s.lastName, s.id].forEach((v, col) => {
        const td = document.createElement('td');
        td.textContent = v;
        if (col >= 3) td.dir = 'ltr';
        tr.appendChild(td);
      });
      const td = document.createElement('td');
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'link-button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => openStudent(s));
      td.appendChild(edit);
      tr.appendChild(td);
      tbody.appendChild(tr);
    });
  }

  // ----- Add / edit one student -----
  let editing = null; // the student being edited, or null when adding

  function fillClassSelect(current) {
    const sel = $('st-class');
    sel.innerHTML = '';
    state.roster.classes.forEach((c) => sel.add(new Option(c + '  —  ' + M.hebrew.classLabel(c), c)));
    sel.add(new Option('Another class…', '__new'));
    sel.value = state.roster.classes.includes(current) ? current : (current ? '__new' : (state.selectedClass || state.roster.classes[0] || '__new'));
    $('st-class-new').value = current && !state.roster.classes.includes(current) ? current : '';
    $('st-class-new-wrap').hidden = sel.value !== '__new';
  }

  function openStudent(s) {
    editing = s || null;
    $('student-dialog-title').textContent = s ? 'Edit student' : 'Add a student';
    $('st-heb-first').value = s ? s.hebFirst : '';
    $('st-heb-last').value = s ? s.hebLast : '';
    $('st-first').value = s ? s.firstName : '';
    $('st-last').value = s ? s.lastName : '';
    $('st-id').value = s ? s.id : '';
    fillClassSelect(s ? s.classCode : null);
    $('st-delete').hidden = !s;
    $('st-problems').innerHTML = '';
    $('st-warning').textContent = '';
    $('student-dialog').showModal();
    $('st-heb-first').focus();
  }

  function studentFromForm() {
    const classCode = $('st-class').value === '__new' ? $('st-class-new').value.replace(/\s+/g, '') : $('st-class').value;
    return {
      id: $('st-id').value.replace(/\D/g, ''),
      hebFirst: $('st-heb-first').value.trim(), hebLast: $('st-heb-last').value.trim(),
      firstName: $('st-first').value.trim(), lastName: $('st-last').value.trim(),
      classCode,
    };
  }

  $('st-class').addEventListener('change', () => {
    $('st-class-new-wrap').hidden = $('st-class').value !== '__new';
    if (!$('st-class-new-wrap').hidden) $('st-class-new').focus();
  });

  $('st-id').addEventListener('input', () => {
    const changed = editing && $('st-id').value.replace(/\D/g, '') !== editing.id;
    $('st-warning').textContent = changed
      ? 'Changing the ID: results already saved under the old ID (' + editing.id + ') will no longer be matched to this student, and printed sheets with the old ID will read as unknown.'
      : '';
  });

  $('student-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const s = studentFromForm();
    const problems = M.roster.checkStudent(state.roster, s, editing ? editing.id : null);
    const list = $('st-problems');
    list.innerHTML = '';
    problems.forEach((p) => { const li = document.createElement('li'); li.textContent = p; list.appendChild(li); });
    if (problems.length) return;
    const wasEditing = editing;
    $('student-dialog').close();
    state.selectedClass = s.classCode;
    const name = (s.hebFirst + ' ' + s.hebLast).trim() || s.firstName + ' ' + s.lastName;
    await saveRosterCsv(M.roster.csvWithStudent(state.roster, s, wasEditing ? wasEditing.id : null), 'edited in the app',
      wasEditing ? 'Saved changes to ' + name + '.' : 'Added ' + name + ' to ' + M.hebrew.classLabel(s.classCode) + '.');
  });

  $('st-cancel').addEventListener('click', () => $('student-dialog').close());

  $('st-delete').addEventListener('click', async () => {
    const s = editing;
    if (!s) return;
    const name = (s.hebFirst + ' ' + s.hebLast).trim() || s.firstName + ' ' + s.lastName;
    if (!confirm('Remove ' + name + ' (' + s.id + ') from the roster?\n\nTheir saved quiz results are kept.')) return;
    $('student-dialog').close();
    await saveRosterCsv(M.roster.csvWithoutStudent(state.roster, s.id), 'edited in the app', 'Removed ' + name + '.');
  });

  $('roster-add').addEventListener('click', () => openStudent(null));

  // ----- Whole roster -----
  $('roster-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const parsed = M.roster.fromCsv(await file.text());
    if (!parsed.students.length) {
      alert('That file could not be used as a roster:\n\n' + parsed.problems.join('\n'));
      return;
    }
    let msg = 'Replace the roster (' + state.roster.students.length + ' students) with "' + file.name + '" (' + parsed.students.length + ' students in ' + parsed.classes.length + ' classes)?';
    if (parsed.problems.length) msg += '\n\nSome rows will be skipped:\n' + parsed.problems.slice(0, 8).join('\n') + (parsed.problems.length > 8 ? '\n…' : '');
    if (!confirm(msg)) return;
    await saveRosterCsv(M.roster.studentsToCsv(parsed.students), file.name, 'Roster replaced with "' + file.name + '".');
  });

  $('roster-download').addEventListener('click', () => {
    // The invisible mark at the start tells Excel the file is UTF-8, so Hebrew shows correctly.
    M.ui.download('﻿' + M.roster.studentsToCsv(state.roster.students), 'Roster ' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv');
  });

  // Once we know where data lives (signed in, or this browser), load the roster from there.
  document.addEventListener('millim:ready', loadRoster);

  // ---------------- Answer sheet form ----------------
  function fillStaticLists() {
    const choices = $('quiz-choices');
    for (let n = L.MIN_CHOICES; n <= L.MAX_CHOICES; n++) choices.add(new Option(String(n), String(n)));
    const styles = $('quiz-style');
    Object.keys(L.CHOICE_STYLES).forEach((key) => {
      const label = document.createElement('label');
      label.className = 'option-inline';
      label.innerHTML = '<input type="radio" name="choice-style"> <span></span>';
      label.querySelector('input').value = key;
      label.querySelector('span').textContent = L.CHOICE_STYLES[key].name;
      if (key === 'hebrew') label.querySelector('span').dir = 'rtl';
      styles.appendChild(label);
    });
  }

  function fillClassAndGradeLists() {
    const r = state.roster;
    const cls = $('prefill-class'), grd = $('prefill-grade');
    const keepClass = cls.value, keepGrade = grd.value;
    cls.innerHTML = ''; grd.innerHTML = '';
    for (const code of r.classes) {
      const n = r.students.filter((s) => s.classCode === code).length;
      // Hebrew last, so the mixed text displays in the right order
      cls.add(new Option(code + '  (' + n + ' students)  —  ' + M.hebrew.classLabel(code), code));
    }
    for (const g of M.roster.gradesOf(r)) {
      const n = M.roster.studentsInGrade(r, g).length;
      grd.add(new Option('Grade ' + g + '  (' + n + ' students)  —  ' + M.hebrew.gradeLabel(g), String(g)));
    }
    if (keepClass) cls.value = keepClass;
    if (keepGrade) grd.value = keepGrade;
    restoreSheetSettings(true);
  }

  function addOverrideRow(o) {
    o = o || {};
    const row = document.createElement('div');
    row.className = 'override-row';
    row.innerHTML =
      'Questions <input type="number" class="ov-from" min="1" max="100"> to ' +
      '<input type="number" class="ov-to" min="1" max="100"> have ' +
      '<select class="ov-choices"></select> choices ' +
      '<button type="button" class="link-button ov-remove" title="Remove">remove</button>';
    const sel = row.querySelector('.ov-choices');
    for (let n = L.MIN_CHOICES; n <= L.MAX_CHOICES; n++) sel.add(new Option(String(n), String(n)));
    row.querySelector('.ov-from').value = o.from || '';
    row.querySelector('.ov-to').value = o.to || '';
    sel.value = String(o.choices || 2);
    row.querySelector('.ov-remove').addEventListener('click', () => { row.remove(); saveSheetSettings(); });
    $('override-list').appendChild(row);
  }

  function readSheetSettings() {
    const style = document.querySelector('input[name="choice-style"]:checked');
    const overrides = Array.from(document.querySelectorAll('.override-row')).map((row) => ({
      from: Number(row.querySelector('.ov-from').value),
      to: Number(row.querySelector('.ov-to').value || row.querySelector('.ov-from').value),
      choices: Number(row.querySelector('.ov-choices').value),
    })).filter((o) => o.from > 0);
    return {
      quiz: {
        title: $('quiz-title').value.trim(),
        numQuestions: Number($('quiz-questions').value),
        choiceStyle: style ? style.value : 'numbers',
        defaultChoices: Number($('quiz-choices').value),
        choiceOverrides: overrides,
      },
      kind: document.querySelector('input[name="sheet-kind"]:checked').value,
      copies: Number($('blank-copies').value) || 1,
      classCode: $('prefill-class').value,
      grade: $('prefill-grade').value,
    };
  }

  function saveSheetSettings() {
    M.storage.save('sheetSettings', readSheetSettings());
  }

  function restoreSheetSettings(listsOnly) {
    const s = M.storage.load('sheetSettings', null);
    if (!s) {
      if (!listsOnly) {
        $('quiz-choices').value = '5';
        document.querySelector('input[name="choice-style"][value="numbers"]').checked = true;
      }
      return;
    }
    if (listsOnly) {
      if (s.classCode && state.roster.classes.includes(s.classCode)) $('prefill-class').value = s.classCode;
      if (s.grade) $('prefill-grade').value = s.grade;
      return;
    }
    $('quiz-title').value = s.quiz.title || '';
    $('quiz-questions').value = s.quiz.numQuestions || 20;
    $('quiz-choices').value = String(s.quiz.defaultChoices || 5);
    const style = document.querySelector('input[name="choice-style"][value="' + s.quiz.choiceStyle + '"]');
    (style || document.querySelector('input[name="choice-style"]')).checked = true;
    (s.quiz.choiceOverrides || []).forEach(addOverrideRow);
    const kind = document.querySelector('input[name="sheet-kind"][value="' + s.kind + '"]');
    if (kind) kind.checked = true;
    $('blank-copies').value = s.copies || 1;
  }

  // Check the settings and explain any problem in plain words.
  function validate(settings) {
    const q = settings.quiz;
    if (!(q.numQuestions >= 1 && q.numQuestions <= L.MAX_QUESTIONS)) return 'Number of questions must be between 1 and ' + L.MAX_QUESTIONS + '.';
    for (const o of q.choiceOverrides) {
      if (o.from > q.numQuestions || o.to > q.numQuestions) return 'The quiz only has ' + q.numQuestions + ' questions, but a different-choices row mentions question ' + Math.max(o.from, o.to) + '.';
      if (o.to < o.from) return 'In a different-choices row, the second question number must not be smaller than the first.';
    }
    if (settings.kind === 'class' && !settings.classCode) return 'Pick a class.';
    if (settings.kind === 'grade' && !settings.grade) return 'Pick a grade.';
    return null;
  }

  // English letters, digits and a few symbols only: some browsers fall back to
  // "download" as the file name when it contains Hebrew.
  function safeFileName(parts) {
    return parts
      .map((p) => String(p || '').replace(/[^A-Za-z0-9 _().-]+/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean).join(' - ').slice(0, 80);
  }

  function showPdf(bytes, fileName) {
    if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
    state.pdfUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = $('download-pdf');
    link.href = state.pdfUrl;
    link.download = fileName;
    link.hidden = false;
    $('pdf-preview').src = state.pdfUrl;
    $('pdf-preview').hidden = false;
    $('preview-empty').hidden = true;
  }

  function setStatus(text, isError) {
    const el = $('sheet-status');
    el.textContent = text;
    el.classList.toggle('error', !!isError);
  }

  $('sheet-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const settings = readSheetSettings();
    const problem = validate(settings);
    if (problem) { setStatus(problem, true); return; }
    saveSheetSettings();

    let students = null;
    let namePart = 'blank';
    if (settings.kind === 'class') {
      students = M.roster.studentsInClass(state.roster, settings.classCode);
      namePart = 'class ' + settings.classCode;
    } else if (settings.kind === 'grade') {
      students = M.roster.studentsInGrade(state.roster, settings.grade);
      namePart = 'grade ' + settings.grade;
    }
    if (students && !students.length) { setStatus('There are no students in that ' + settings.kind + '.', true); return; }

    $('make-pdf').disabled = true;
    setStatus('Creating…');
    try {
      const bytes = await M.sheetPdf.create({ quiz: settings.quiz, students, copies: settings.copies });
      const pages = students ? students.length : settings.copies;
      showPdf(bytes, safeFileName(['Answer sheets', settings.quiz.title, namePart]) + '.pdf');
      setStatus('Done: ' + pages + (pages === 1 ? ' sheet.' : ' sheets.'));
    } catch (err) {
      console.error(err);
      setStatus('Something went wrong while creating the PDF: ' + err.message, true);
    } finally {
      $('make-pdf').disabled = false;
    }
  });

  $('sheet-form').addEventListener('change', saveSheetSettings);
  $('add-override').addEventListener('click', () => {
    const n = Number($('quiz-questions').value) || 1;
    addOverrideRow({ from: n, to: n, choices: 2 });
    saveSheetSettings();
  });

  $('make-test-packet').addEventListener('click', async () => {
    setStatus('Creating test packet…');
    try {
      showPdf(await M.testSheets.createPacket(), 'Millim test packet.pdf');
      setStatus('Test packet ready (4 pages).');
    } catch (err) {
      console.error(err);
      setStatus('Something went wrong: ' + err.message, true);
    }
  });

  // ---------------- Start ----------------
  fillStaticLists();
  restoreSheetSettings(false);
  showTab(M.storage.load('tab', 'sheets'));
  loadRoster();
})();
