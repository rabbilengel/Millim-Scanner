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
  async function loadRoster() {
    const override = M.storage.load('rosterOverride', null);
    let csv = null;
    if (override && override.csv) {
      csv = override.csv;
      state.rosterSource = 'from the file "' + override.name + '" you loaded on ' + new Date(override.loadedAt).toLocaleDateString();
    } else {
      // On a website (GitHub Pages) read the latest data/roster.csv; when opened from a file, use the built-in copy.
      if (location.protocol.startsWith('http')) {
        try {
          const res = await fetch('data/roster.csv', { cache: 'no-cache' });
          if (res.ok) { csv = await res.text(); state.rosterSource = 'from data/roster.csv in the project'; }
        } catch (e) { /* fall back below */ }
      }
      if (!csv) { csv = window.MILLIM_ROSTER_CSV || ''; state.rosterSource = 'built into the app (from data/roster.csv)'; }
    }
    state.roster = M.roster.fromCsv(csv);
    $('roster-reset').hidden = !override;
    renderRoster();
    fillClassAndGradeLists();
  }

  function renderRoster() {
    const r = state.roster;
    $('roster-summary').textContent =
      r.students.length + ' students in ' + r.classes.length + ' classes — roster ' + state.rosterSource + '.';
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
      tbody.appendChild(tr);
    });
  }

  $('roster-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const csv = await file.text();
    const parsed = M.roster.fromCsv(csv);
    if (!parsed.students.length) {
      alert('That file could not be used as a roster:\n\n' + parsed.problems.join('\n'));
      return;
    }
    M.storage.save('rosterOverride', { csv, name: file.name, loadedAt: Date.now() });
    await loadRoster();
  });

  $('roster-reset').addEventListener('click', async () => {
    M.storage.remove('rosterOverride');
    await loadRoster();
  });

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
