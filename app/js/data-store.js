/*
 * DATA STORE — the one place the screens save and load quizzes and results.
 *
 * Two modes:
 *  - 'cloud': signed in to your Firebase account; data is online and follows you to any computer.
 *  - 'local': no account set up (or app opened from a file); data stays in this browser.
 *
 * A quiz:   { id, title, layout: { numQuestions, choiceStyle, maxChoices }, answers: [[0],[2],[]...], updatedAt }
 * A result: { docId, studentId, onRoster, hebLast, hebFirst, lastName, firstName, classCode, classLabel,
 *             answers: [choice | null | 'multiple', ...], correct, possible, percent, source, reviewed, savedAt }
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});
  const S = () => M.storage;

  let mode = 'local';
  let cache = []; // quizzes, newest first

  function emit() {
    if (root.document) root.document.dispatchEvent(new CustomEvent('millim:data'));
  }
  function sortCache() { cache.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); }

  // ---------- local (this browser) ----------
  const local = {
    listQuizzes: async () => S().load('quizzes', []),
    saveQuiz: async (q) => {
      const all = S().load('quizzes', []).filter((k) => k.id !== q.id);
      all.unshift(q);
      return S().save('quizzes', all) ? 'saved' : 'failed';
    },
    deleteQuiz: async (id) => {
      S().save('quizzes', S().load('quizzes', []).filter((k) => k.id !== id));
      S().remove('results.' + id);
      return 'saved';
    },
    listResults: async (id) => {
      const stored = S().load('results.' + id, null);
      return stored ? stored.rows.map((r) => Object.assign({ docId: r.docId || r.studentId }, r)) : [];
    },
    saveResults: async (id, rows) => {
      const byDoc = new Map((await local.listResults(id)).map((r) => [r.docId, r]));
      rows.forEach((r) => byDoc.set(r.docId, r));
      return S().save('results.' + id, { rows: Array.from(byDoc.values()) }) ? 'saved' : 'failed';
    },
    deleteResult: async (id, docId) => {
      const rows = (await local.listResults(id)).filter((r) => r.docId !== docId);
      S().save('results.' + id, { rows });
      return 'saved';
    },
  };

  // The roster as changed in the app (null = use the original roster from data/roster.csv)
  local.getRoster = async () => {
    const r = S().load('rosterOverride', null);
    return r && r.csv ? { csv: r.csv, name: r.name || '', updatedAt: r.updatedAt || r.loadedAt || null } : null;
  };
  local.saveRoster = async (record) => (S().save('rosterOverride', record) ? 'saved' : 'failed');
  local.deleteRoster = async () => { S().remove('rosterOverride'); return 'saved'; };

  const backend = () => (mode === 'cloud' ? M.cloud : local);

  async function start(newMode) {
    mode = newMode;
    cache = await backend().listQuizzes();
    sortCache();
    emit();
  }

  function quizzes() { return cache; }
  function getQuiz(id) { return cache.find((q) => q.id === id) || null; }

  // Returns 'uploaded' | 'pending' (cloud, offline: will upload later) | 'saved' (local) | 'failed'
  async function saveQuiz(q) {
    q.updatedAt = Date.now();
    cache = cache.filter((k) => k.id !== q.id);
    cache.unshift(q);
    emit();
    return backend().saveQuiz(q);
  }

  async function deleteQuiz(id) {
    cache = cache.filter((k) => k.id !== id);
    emit();
    return backend().deleteQuiz(id);
  }

  function listResults(quizId) { return backend().listResults(quizId); }

  // rows replace any earlier result with the same docId (e.g. re-scanning a student's sheet)
  async function saveResults(quiz, rows) {
    const now = Date.now();
    rows = rows.map((r) => Object.assign({}, r, { savedAt: now }));
    const status = await backend().saveResults(quiz.id, rows);
    quiz.lastGradedAt = now;
    await saveQuiz(quiz);
    return status;
  }

  function deleteResult(quizId, docId) { return backend().deleteResult(quizId, docId); }

  // ---------- Backup file ----------
  async function exportAll() {
    const out = { app: 'Millim Scanner', version: 1, exportedAt: new Date().toISOString(), quizzes: [] };
    for (const q of cache) out.quizzes.push(Object.assign({}, q, { results: await listResults(q.id) }));
    return out;
  }

  // Add everything from a backup (keeps what's already there; same quiz/student is replaced).
  async function importAll(data) {
    if (!data || !Array.isArray(data.quizzes)) throw new Error('This is not a Millim Scanner backup file.');
    let quizCount = 0, resultCount = 0;
    for (const item of data.quizzes) {
      const results = item.results || [];
      const quiz = Object.assign({}, item);
      delete quiz.results;
      await backend().saveQuiz(quiz);
      if (results.length) await backend().saveResults(quiz.id, results.map((r) => Object.assign({ docId: r.docId || r.studentId }, r)));
      quizCount++; resultCount += results.length;
    }
    await start(mode);
    return { quizCount, resultCount };
  }

  // ---------- Moving results saved in this browser into the account ----------
  function localOnlyCount() {
    if (mode !== 'cloud') return 0;
    const ids = new Set(cache.map((q) => q.id));
    return S().load('quizzes', []).filter((q) => !ids.has(q.id)).length;
  }

  async function uploadLocal() {
    const ids = new Set(cache.map((q) => q.id));
    const quizzesHere = S().load('quizzes', []).filter((q) => !ids.has(q.id));
    const data = { quizzes: [] };
    for (const q of quizzesHere) data.quizzes.push(Object.assign({}, q, { results: await local.listResults(q.id) }));
    return importAll(data);
  }

  function getRoster() { return backend().getRoster(); }
  function saveRoster(csv, name) { return backend().saveRoster({ csv, name: name || '', updatedAt: Date.now() }); }
  function resetRoster() { return backend().deleteRoster(); }

  M.dataStore = {
    getRoster, saveRoster, resetRoster,
    start, mode: () => mode, quizzes, getQuiz, saveQuiz, deleteQuiz,
    listResults, saveResults, deleteResult, exportAll, importAll, localOnlyCount, uploadLocal,
    _local: local,
  };
})(typeof window !== 'undefined' ? window : globalThis);
