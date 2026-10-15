/*
 * CLOUD — your account and online storage, using Google Firebase.
 *  - Sign in / sign out / reset password (Firebase Authentication)
 *  - Read and write your quizzes and results (Firestore database)
 *
 * Where things are stored online (only you can read or change them; see firestore.rules):
 *   users/{your account}/quizzes/{quiz}              answer key, title, layout
 *   users/{your account}/quizzes/{quiz}/results/{student}   one student's answers and score
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});

  let auth = null, db = null, ready = false;

  // Accounts only work from a real website (e.g. GitHub Pages), not from a file opened on the computer.
  function available() {
    const cfg = root.MILLIM_FIREBASE_CONFIG;
    return !!(cfg && cfg.apiKey && cfg.projectId && root.firebase && /^https?:$/.test(root.location.protocol));
  }

  function init() {
    if (ready) return true;
    if (!available()) return false;
    const cfg = root.MILLIM_FIREBASE_CONFIG;
    const app = root.firebase.initializeApp(cfg);
    auth = app.auth();
    db = app.firestore();
    if (cfg.emulator) {
      // Only used by the automated tests (a practice Firebase running on the test computer).
      auth.useEmulator(cfg.emulator.auth);
      db.useEmulator(cfg.emulator.firestoreHost, cfg.emulator.firestorePort);
    }
    // Keep a copy on this computer, so saving works even if the internet drops for a moment.
    db.enablePersistence({ synchronizeTabs: true }).catch(() => { /* e.g. private window: just works online */ });
    ready = true;
    return true;
  }

  // ---------- Account ----------
  function onAccountChange(callback) { auth.onAuthStateChanged(callback); }
  function currentUser() { return auth && auth.currentUser; }

  async function signIn(email, password, remember) {
    const P = root.firebase.auth.Auth.Persistence;
    await auth.setPersistence(remember ? P.LOCAL : P.SESSION);
    return auth.signInWithEmailAndPassword(email.trim(), password);
  }
  // Sign out, and erase the copy of your data kept on this computer (important on shared computers).
  async function signOut() {
    await auth.signOut();
    try { await db.terminate(); await db.clearPersistence(); } catch (e) { /* nothing stored */ }
  }
  function resetPassword(email) { return auth.sendPasswordResetEmail(email.trim()); }

  // Firebase's error codes → plain English.
  function explain(err) {
    const code = (err && err.code) || '';
    const messages = {
      'auth/invalid-email': 'That doesn\'t look like an email address.',
      'auth/user-not-found': 'Wrong email or password.',
      'auth/wrong-password': 'Wrong email or password.',
      'auth/invalid-credential': 'Wrong email or password.',
      'auth/invalid-login-credentials': 'Wrong email or password.',
      'auth/too-many-requests': 'Too many tries. Wait a few minutes, or reset your password.',
      'auth/network-request-failed': 'No internet connection. Check the connection and try again.',
      'auth/user-disabled': 'This account has been turned off in the Firebase console.',
      'auth/missing-password': 'Type your password.',
      'permission-denied': 'Firebase refused access. Check the security rules (docs/firebase-setup.md, step 5).',
      'unavailable': 'Can\'t reach the online storage right now (no internet?).',
    };
    return messages[code] || (err && err.message) || String(err);
  }

  // ---------- Data ----------
  function userDoc() {
    const u = currentUser();
    if (!u) throw new Error('Not signed in.');
    return db.collection('users').doc(u.uid);
  }
  const quizzesRef = () => userDoc().collection('quizzes');
  const resultsRef = (quizId) => quizzesRef().doc(quizId).collection('results');

  // Firestore can't store lists inside lists, so the key's answers are stored as text: [[0],[1,3],[]] -> ["0","1,3",""]
  function quizToCloud(q) {
    return Object.assign({}, q, { answers: q.answers.map((a) => a.join(',')) });
  }
  function quizFromCloud(id, data) {
    return Object.assign({}, data, { id, answers: (data.answers || []).map((s) => (s === '' ? [] : String(s).split(',').map(Number))) });
  }

  /*
   * Writes are kept on this computer at once and uploaded in the background.
   * Wait a few seconds for the upload; if it takes longer (offline), report that it's pending.
   */
  function confirmed(promise) {
    return Promise.race([
      promise.then(() => 'uploaded'),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 6000)),
    ]);
  }

  async function listQuizzes() {
    const snap = await quizzesRef().get();
    return snap.docs.map((d) => quizFromCloud(d.id, d.data()));
  }
  function saveQuiz(q) { return confirmed(quizzesRef().doc(q.id).set(quizToCloud(q))); }

  async function deleteQuiz(quizId) {
    const snap = await resultsRef(quizId).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(quizzesRef().doc(quizId));
    return confirmed(batch.commit());
  }

  async function listResults(quizId) {
    const snap = await resultsRef(quizId).get();
    return snap.docs.map((d) => Object.assign({}, d.data(), { docId: d.id }));
  }

  function saveResults(quizId, rows) {
    // Firestore allows up to 500 changes per batch.
    const commits = [];
    for (let i = 0; i < rows.length; i += 400) {
      const batch = db.batch();
      rows.slice(i, i + 400).forEach((r) => {
        const data = Object.assign({}, r);
        delete data.docId;
        batch.set(resultsRef(quizId).doc(r.docId), data);
      });
      commits.push(batch.commit());
    }
    return confirmed(Promise.all(commits));
  }

  function deleteResult(quizId, docId) { return confirmed(resultsRef(quizId).doc(docId).delete()); }

  // The roster: one record { csv, name, updatedAt }
  const rosterDoc = () => userDoc().collection('settings').doc('roster');
  async function getRoster() {
    const snap = await rosterDoc().get();
    return snap.exists ? snap.data() : null;
  }
  function saveRoster(record) { return confirmed(rosterDoc().set(record)); }

  M.cloud = {
    getRoster, saveRoster,
    available, init, onAccountChange, currentUser, signIn, signOut, resetPassword, explain,
    listQuizzes, saveQuiz, deleteQuiz, listResults, saveResults, deleteResult,
  };
})(typeof window !== 'undefined' ? window : globalThis);
